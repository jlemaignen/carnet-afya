import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  type LoginThrottle, MAX_CODE_ATTEMPTS, MIN_PASSWORD_LENGTH, base32, hashPassword, hashResetToken, newChallengeId, newResetToken, newTotpSecret, openSecret, sealSecret,
  signChallenge, signSession, totpUri, verifyChallenge, verifyPassword, verifySession, verifyTotp,
} from '../auth.ts';
import type { AppDeps } from '../app.ts';
import type { AuthOptions, LoginStep, MeView, TotpSetup } from '../contract.ts';
import { type UserRow, userSections } from '../db.ts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: UserRow;
  }
}

export type RequireUser = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

const codeBody = {
  type: 'object',
  required: ['code'],
  additionalProperties: false,
  properties: { code: { type: 'string', pattern: '^[0-9]{6}$' } },
} as const;

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

export function registerAuthRoutes(app: FastifyInstance, deps: AppDeps, throttle: LoginThrottle): { requireUser: RequireUser } {
  const { config, repo } = deps;
  const secure = config.publicBaseUrl.startsWith('https://');
  // Préfixe __Host- : cookie lié au domaine exact, https uniquement, impossible à poser par un sous-domaine.
  const sessionCookie = secure ? '__Host-carnet_afya_session' : 'carnet_afya_session';
  const challengeCookie = secure ? '__Host-carnet_afya_code' : 'carnet_afya_code';
  const cookieOpts = { httpOnly: true, secure, sameSite: 'strict', path: '/' } as const;
  const limited = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

  const me = (u: UserRow): MeView => ({
    email: u.email, displayName: u.display_name, sections: userSections(u), totpEnabled: u.totp_secret !== null,
    mustChangePassword: u.must_change_password === 1,
    isAdmin: u.is_admin === 1,
  });

  const requireUser: RequireUser = async (req, reply) => {
    const s = verifySession(req.cookies[sessionCookie], config.sessionSecret, config.sessionMaxAgeSeconds);
    const user = s ? repo.findUser(s.userId) : undefined;
    if (!s || !user || user.disabled || s.issuedAt < user.sessions_valid_after) {
      return reply.code(401).send({ error: 'no_session', message: 'Veuillez vous connecter.' });
    }
    req.user = user;
  };

  function openSession(reply: FastifyReply, user: UserRow): MeView {
    throttle.reset(user.email);
    repo.touchLogin(user.id);
    repo.log('login', user.id, user.totp_secret ? 'mot de passe + code' : 'mot de passe');
    reply.clearCookie(challengeCookie, cookieOpts);
    reply.setCookie(sessionCookie, signSession(user.id, Date.now(), config.sessionSecret), { ...cookieOpts, maxAge: config.sessionMaxAgeSeconds });
    return me(user);
  }

  // Étape 1 : email + mot de passe. Si le compte a une application d'authentification, la session
  // n'est pas ouverte ici : il faut encore le code (étape 2).
  app.post<{ Body: { email: string; password: string } }>(
    '/api/login',
    {
      ...limited,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'password'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', minLength: 3, maxLength: 254 },
            password: { type: 'string', minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (req, reply): Promise<LoginStep | void> => {
      const email = req.body.email.trim();
      if (throttle.isLocked(email)) {
        return reply.code(429).send({ error: 'locked', message: 'Trop de tentatives pour ce compte. Réessayez dans 15 minutes.' });
      }
      const user = repo.findUserByEmail(email);
      const ok = await verifyPassword(user?.password_hash, req.body.password);
      if (!ok || !user || user.disabled) {
        throttle.fail(email);
        repo.log('login_failed', user?.id ?? null);
        return reply.code(401).send({ error: 'bad_credentials', message: 'Adresse email ou mot de passe incorrect.' });
      }
      if (!user.totp_secret) return { step: 'done', me: openSession(reply, user) };

      const challengeId = newChallengeId();
      repo.purgeChallenges();
      repo.createChallenge(challengeId, user.id, Date.now() + config.codeTtlSeconds * 1000);
      reply.setCookie(challengeCookie, signChallenge(challengeId, config.sessionSecret), { ...cookieOpts, maxAge: config.codeTtlSeconds });
      return { step: 'code' };
    },
  );

  // Étape 2 : le code de l'application d'authentification ouvre la session.
  app.post<{ Body: { code: string } }>('/api/login/code', { ...limited, schema: { body: codeBody } }, async (req, reply): Promise<MeView | void> => {
    const expired = () => {
      reply.clearCookie(challengeCookie, cookieOpts);
      return reply.code(401).send({ error: 'code_expired', message: 'Délai dépassé ou trop d\'essais. Reconnectez-vous.' });
    };
    const challengeId = verifyChallenge(req.cookies[challengeCookie], config.sessionSecret);
    const challenge = challengeId ? repo.findChallenge(challengeId) : undefined;
    if (!challenge || challenge.expires_at < Date.now()) return expired();
    const user = repo.findUser(challenge.user_id);
    const secret = user && !user.disabled ? openSecret(user.totp_secret, config.sessionSecret) : null;
    if (!user || !secret) return expired();

    const step = verifyTotp(secret, req.body.code, user.totp_last_step);
    if (step === null) {
      repo.bumpChallenge(challenge.id);
      repo.log('code_failed', user.id);
      if (challenge.attempts + 1 >= MAX_CODE_ATTEMPTS) {
        repo.deleteChallenge(challenge.id);
        throttle.fail(user.email);
        return expired();
      }
      return reply.code(401).send({ error: 'bad_code', message: 'Code incorrect.' });
    }
    repo.setTotpStep(user.id, step);
    repo.deleteChallenge(challenge.id);
    return openSession(reply, user);
  });

  app.post('/api/logout', async (_req, reply) => {
    reply.clearCookie(sessionCookie, cookieOpts);
    reply.clearCookie(challengeCookie, cookieOpts);
    return { ok: true };
  });

  app.get('/api/me', { preHandler: requireUser }, async (req) => me(req.user!));

  // Changement de mot de passe par la personne : obligatoire après une création ou une réinitialisation.
  // Le mot de passe actuel est exigé (une session volée ne suffit pas). Les autres sessions sont
  // coupées et celle-ci est rouverte.
  app.post<{ Body: { current: string; next: string } }>(
    '/api/password',
    {
      ...limited,
      preHandler: requireUser,
      schema: {
        body: {
          type: 'object',
          required: ['current', 'next'],
          additionalProperties: false,
          properties: {
            current: { type: 'string', minLength: 1, maxLength: 256 },
            next: { type: 'string', minLength: 1, maxLength: 256 },
          },
        },
      },
    },
    async (req, reply): Promise<MeView | void> => {
      const user = req.user!;
      if (!(await verifyPassword(user.password_hash, req.body.current))) {
        repo.log('password_change_failed', user.id);
        return reply.code(400).send({ error: 'bad_password', message: 'Mot de passe actuel incorrect.' });
      }
      if (req.body.next.length < MIN_PASSWORD_LENGTH) {
        return reply.code(400).send({ error: 'too_short', message: `Le nouveau mot de passe doit compter au moins ${MIN_PASSWORD_LENGTH} caractères.` });
      }
      if (req.body.next === req.body.current) {
        return reply.code(400).send({ error: 'same', message: "Le nouveau mot de passe doit être différent de l'actuel." });
      }
      const now = Date.now();
      repo.setPassword(user.id, await hashPassword(req.body.next), now, false);
      repo.log('password_changed', user.id);
      reply.setCookie(sessionCookie, signSession(user.id, now, config.sessionSecret), { ...cookieOpts, maxAge: config.sessionMaxAgeSeconds });
      return me(repo.findUser(user.id)!);
    },
  );

  // ── Mot de passe oublié : lien à usage unique envoyé par e-mail ──
  //
  // - même réponse que le compte existe ou non, et l'envoi part en arrière-plan : la réponse ne
  //   dit pas si l'adresse a un compte ;
  // - le lien vaut 30 minutes, une seule fois, et une nouvelle demande annule la précédente ;
  //   au plus 3 demandes par heure et par compte ;
  // - le jeton n'est jamais gardé en clair (empreinte SHA-256) et voyage après le # de l'adresse :
  //   il n'apparaît ni dans les journaux du serveur ni du proxy ;
  // - si l'application d'authentification est activée, son code reste exigé : l'accès à la
  //   boîte e-mail ne suffit pas ;
  // - le nouveau mot de passe coupe toutes les sessions ouvertes ; on se reconnecte ensuite.
  const mailer = deps.mailer ?? null;

  app.get('/api/auth/options', async (): Promise<AuthOptions> => ({ resetByEmail: mailer !== null }));

  app.post<{ Body: { email: string } }>(
    '/api/password/forgot',
    {
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
      schema: {
        body: {
          type: 'object',
          required: ['email'],
          additionalProperties: false,
          properties: { email: { type: 'string', minLength: 3, maxLength: 254 } },
        },
      },
    },
    async (req, reply) => {
      if (!mailer) {
        return reply.code(503).send({ error: 'reset_unavailable', message: 'La réinitialisation par e-mail n\'est pas disponible. Demandez à un administrateur de réinitialiser votre mot de passe.' });
      }
      const user = repo.findUserByEmail(req.body.email.trim());
      const uneHeure = new Date(Date.now() - 3600_000).toISOString().replace('T', ' ').slice(0, 19);
      if (user && !user.disabled && repo.countResetRequests(user.id, uneHeure) < 3) {
        const token = newResetToken();
        repo.purgeResets();
        repo.createReset(hashResetToken(token), user.id, Date.now() + config.resetTtlSeconds * 1000);
        repo.log('password_reset_requested', user.id);
        const lien = `${config.publicBaseUrl}/#reinitialisation=${token}`;
        const minutes = Math.round(config.resetTtlSeconds / 60);
        mailer
          .send({
            to: user.email,
            subject: 'Réinitialisation de votre mot de passe',
            text: [
              `Bonjour ${user.display_name},`,
              '',
              'Une réinitialisation du mot de passe de votre compte au tableau de bord du Carnet AFYA du CCA a été demandée.',
              `Pour choisir un nouveau mot de passe, ouvrez ce lien dans les ${minutes} minutes. Il ne sert qu'une fois.`,
              '',
              lien,
              '',
              "Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.",
              '',
              'Centre de Chirurgie Ambulatoire de Genève',
              'Une entité des Hôpitaux Universitaires de Genève et de Hirslanden Genève',
            ].join('\n'),
            html: `<p>Bonjour ${escapeHtml(user.display_name)},</p>
<p>Une réinitialisation du mot de passe de votre compte au tableau de bord du Carnet AFYA du CCA a été demandée.</p>
<p>Pour choisir un nouveau mot de passe, ouvrez ce lien dans les ${minutes} minutes. Il ne sert qu'une fois.</p>
<p><a href="${lien}">Choisir un nouveau mot de passe</a></p>
<p>Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.</p>
<p style="color:#6b6b6b;font-size:13px">Centre de Chirurgie Ambulatoire de Genève<br>Une entité des Hôpitaux Universitaires de Genève et de Hirslanden Genève</p>`,
          })
          .catch((err: unknown) => {
            req.log.error({ err: (err as Error).message }, "envoi de l'e-mail de réinitialisation impossible");
            repo.log('password_reset_mail_failed', user.id);
          });
      } else if (user) {
        repo.log('password_reset_refused', user.id, user.disabled ? 'compte désactivé' : 'trop de demandes');
      }
      return { ok: true };
    },
  );

  app.post<{ Body: { token: string; password: string; code?: string } }>(
    '/api/password/reset',
    {
      ...limited,
      schema: {
        body: {
          type: 'object',
          required: ['token', 'password'],
          additionalProperties: false,
          properties: {
            token: { type: 'string', minLength: 20, maxLength: 100 },
            password: { type: 'string', minLength: 1, maxLength: 256 },
            code: { type: 'string', pattern: '^[0-9]{6}$' },
          },
        },
      },
    },
    async (req, reply) => {
      const invalide = () =>
        reply.code(400).send({ error: 'reset_invalid', message: 'Ce lien n\'est plus valable. Refaites une demande depuis la page de connexion.' });
      const tokenHash = hashResetToken(req.body.token);
      const reset = repo.findReset(tokenHash);
      if (!reset || reset.expires_at < Date.now()) return invalide();
      const user = repo.findUser(reset.user_id);
      if (!user || user.disabled) return invalide();

      if (req.body.password.length < MIN_PASSWORD_LENGTH) {
        return reply.code(400).send({ error: 'too_short', message: `Le nouveau mot de passe doit compter au moins ${MIN_PASSWORD_LENGTH} caractères.` });
      }
      const secret = openSecret(user.totp_secret, config.sessionSecret);
      let step: number | null = null;
      if (secret) {
        if (!req.body.code) {
          return reply.code(400).send({ error: 'code_required', message: "Saisissez aussi le code de votre application d'authentification." });
        }
        step = verifyTotp(secret, req.body.code, user.totp_last_step);
        if (step === null) {
          repo.bumpReset(tokenHash);
          repo.log('code_failed', user.id, 'réinitialisation');
          if (reset.attempts + 1 >= MAX_CODE_ATTEMPTS) {
            repo.deleteResets(user.id);
            return invalide();
          }
          return reply.code(400).send({ error: 'bad_code', message: 'Code incorrect.' });
        }
      }
      repo.setPassword(user.id, await hashPassword(req.body.password), Date.now(), false);
      if (step !== null) repo.setTotpStep(user.id, step);
      repo.deleteResets(user.id);
      repo.purgeChallenges();
      throttle.reset(user.email);
      repo.log('password_reset_by_email', user.id);
      return { ok: true };
    },
  );

  // ── Application d'authentification : activation facultative par la personne elle-même ──

  // Propose un secret. Rien n'est activé tant que le premier code n'a pas été validé.
  app.post('/api/totp/setup', { ...limited, preHandler: requireUser }, async (req, reply): Promise<TotpSetup | void> => {
    const user = req.user!;
    if (user.totp_secret) return reply.code(409).send({ error: 'already', message: "L'application d'authentification est déjà activée." });
    const secret = newTotpSecret();
    repo.setTotpPending(user.id, sealSecret(secret, config.sessionSecret));
    return { secret: base32(secret), uri: totpUri(secret, user.email) };
  });

  app.post<{ Body: { code: string } }>('/api/totp/enable', { ...limited, preHandler: requireUser, schema: { body: codeBody } }, async (req, reply): Promise<MeView | void> => {
    const user = req.user!;
    const secret = openSecret(user.totp_pending, config.sessionSecret);
    if (user.totp_secret || !secret) return reply.code(409).send({ error: 'no_setup', message: "Recommencez l'activation." });
    const step = verifyTotp(secret, req.body.code, 0);
    if (step === null) {
      return reply.code(400).send({ error: 'bad_code', message: "Code incorrect. Vérifiez l'heure du téléphone et réessayez." });
    }
    repo.enableTotp(user.id, user.totp_pending!, step);
    repo.log('totp_enabled', user.id);
    return me(repo.findUser(user.id)!);
  });

  // Désactivation par la personne : un code valide est exigé (une session volée ne suffit pas).
  app.post<{ Body: { code: string } }>('/api/totp/disable', { ...limited, preHandler: requireUser, schema: { body: codeBody } }, async (req, reply): Promise<MeView | void> => {
    const user = req.user!;
    const secret = openSecret(user.totp_secret, config.sessionSecret);
    if (!secret) return reply.code(409).send({ error: 'not_enabled', message: "L'application d'authentification n'est pas activée." });
    if (verifyTotp(secret, req.body.code, user.totp_last_step) === null) {
      repo.log('code_failed', user.id);
      return reply.code(400).send({ error: 'bad_code', message: 'Code incorrect.' });
    }
    repo.clearTotp(user.id);
    repo.log('totp_disabled', user.id);
    return me(repo.findUser(user.id)!);
  });

  return { requireUser };
}
