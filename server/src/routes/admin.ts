import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { generateTemporaryPassword, hashPassword, openSecret, verifyTotp } from '../auth.ts';
import type { AppDeps } from '../app.ts';
import { type AdminPasswordResult, type AdminUser, SECTIONS, type Section } from '../contract.ts';
import { type UserRow, userSections } from '../db.ts';
import type { RequireUser } from './auth.ts';

/**
 * Gestion des comptes par un administrateur, depuis l'app.
 *
 * Garde-fous :
 *  - donner ou retirer le rôle administrateur exige un code de l'application d'authentification
 *    de celui qui agit, saisi à l'instant (une session laissée ouverte ne suffit pas) ; personne ne
 *    peut retirer son propre rôle ;
 *  - les autres actions sont sans effet sur un compte administrateur, le sien compris : il faut
 *    d'abord lui retirer le rôle. Seule exception : un administrateur choisit ses propres rubriques
 *    (il peut déjà les ouvrir à n'importe quel autre compte, ce n'est donc pas un droit de plus) ;
 *  - son application d'authentification doit être activée (un mot de passe volé ne suffit pas à
 *    créer des comptes qui voient les chiffres) ;
 *  - aucun mot de passe n'est choisi ici : le serveur tire un mot de passe provisoire, renvoyé une
 *    seule fois, que la personne remplace à sa première connexion ;
 *  - chaque action est notée au journal avec son auteur.
 */
export function registerAdminRoutes(app: FastifyInstance, deps: AppDeps, requireUser: RequireUser): void {
  const { repo, config } = deps;
  const limited = { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } };

  const view = (u: Omit<UserRow, 'password_hash'>): AdminUser => ({
    id: u.id,
    email: u.email,
    displayName: u.display_name,
    sections: userSections(u),
    disabled: u.disabled === 1,
    totpEnabled: u.totp_secret !== null,
    mustChangePassword: u.must_change_password === 1,
    isAdmin: u.is_admin === 1,
    lastLoginAt: u.last_login_at,
  });

  const requireAdmin = async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    await requireUser(req, reply);
    if (reply.sent) return;
    const u = req.user!;
    if (!u.is_admin) {
      return reply.code(403).send({ error: 'forbidden', message: 'Réservé aux administrateurs.' });
    }
    if (u.must_change_password) {
      return reply.code(403).send({ error: 'password_change_required', message: 'Choisissez d\'abord votre mot de passe.' });
    }
    if (!u.totp_secret) {
      return reply.code(403).send({
        error: 'totp_required',
        message: "Pour gérer les comptes, activez d'abord l'application d'authentification (bouton Sécurité).",
      });
    }
  };

  /**
   * Le compte visé, s'il existe et n'est pas administrateur. Sinon la réponse est déjà envoyée.
   * soiMeme : le compte administrateur de la personne qui agit est accepté (ses propres rubriques).
   */
  function target(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply, soiMeme = false): UserRow | null {
    const id = Number(req.params.id);
    const u = Number.isInteger(id) && id > 0 ? repo.findUser(id) : undefined;
    if (!u) {
      reply.code(404).send({ error: 'not_found', message: 'Compte introuvable.' });
      return null;
    }
    if (u.is_admin && !(soiMeme && u.id === req.user!.id)) {
      reply.code(403).send({ error: 'admin_account', message: "Retirez d'abord le rôle administrateur de ce compte." });
      return null;
    }
    return u;
  }

  const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[0-9]{1,9}$' } } } as const;
  const sectionsSchema = { type: 'array', maxItems: SECTIONS.length, uniqueItems: true, items: { type: 'string', enum: [...SECTIONS] } } as const;
  const nameSchema = { type: 'string', minLength: 1, maxLength: 80 } as const;
  const ordered = (list: Section[]): Section[] => SECTIONS.filter((s) => list.includes(s));

  app.get('/api/admin/users', { ...limited, preHandler: requireAdmin }, async (): Promise<AdminUser[]> => repo.listUsers().map(view));

  app.post<{ Body: { email: string; displayName: string; sections: Section[] } }>(
    '/api/admin/users',
    {
      ...limited,
      preHandler: requireAdmin,
      schema: {
        body: {
          type: 'object',
          required: ['email', 'displayName', 'sections'],
          additionalProperties: false,
          properties: {
            email: { type: 'string', maxLength: 254, pattern: '^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$' },
            displayName: nameSchema,
            sections: sectionsSchema,
          },
        },
      },
    },
    async (req, reply): Promise<AdminPasswordResult | void> => {
      const email = req.body.email.trim().toLowerCase();
      const displayName = req.body.displayName.trim();
      if (!displayName) return reply.code(400).send({ error: 'validation', message: 'Indiquez le nom de la personne.' });
      if (repo.findUserByEmail(email)) {
        return reply.code(409).send({ error: 'exists', message: 'Un compte existe déjà pour cette adresse.' });
      }
      const sections = ordered(req.body.sections);
      const temporaryPassword = generateTemporaryPassword();
      const id = repo.createUser(email, displayName, await hashPassword(temporaryPassword), sections, true);
      repo.log('admin_user_created', req.user!.id, `${email} : ${sections.join(',') || 'aucune rubrique'}`);
      return { user: view(repo.findUser(id)!), temporaryPassword };
    },
  );

  app.patch<{ Params: { id: string }; Body: { displayName?: string; sections?: Section[]; disabled?: boolean } }>(
    '/api/admin/users/:id',
    {
      ...limited,
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          additionalProperties: false,
          minProperties: 1,
          properties: { displayName: nameSchema, sections: sectionsSchema, disabled: { type: 'boolean' } },
        },
      },
    },
    async (req, reply): Promise<AdminUser | void> => {
      // Sur son propre compte administrateur, seules les rubriques peuvent changer.
      const seulesRubriques = Object.keys(req.body).every((k) => k === 'sections');
      const u = target(req, reply, seulesRubriques);
      if (!u) return;
      const changes: string[] = [];
      if (req.body.displayName !== undefined && req.body.displayName.trim()) {
        repo.setDisplayName(u.id, req.body.displayName.trim());
        changes.push('nom');
      }
      if (req.body.sections !== undefined) {
        const sections = ordered(req.body.sections);
        repo.setSections(u.id, sections);
        changes.push(`rubriques ${sections.join(',') || 'aucune'}`);
      }
      if (req.body.disabled !== undefined) {
        repo.setDisabled(u.id, req.body.disabled);
        changes.push(req.body.disabled ? 'désactivé' : 'réactivé');
      }
      // Les champs inconnus sont écartés par la validation : une demande qui ne change rien est une erreur.
      if (!changes.length) return reply.code(400).send({ error: 'validation', message: 'Aucune modification reconnue.' });
      repo.log('admin_user_updated', req.user!.id, `${u.email} : ${changes.join(' ; ')}`);
      return view(repo.findUser(u.id)!);
    },
  );

  // Mot de passe oublié : nouveau mot de passe provisoire, sessions ouvertes coupées.
  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/reset-password',
    { ...limited, preHandler: requireAdmin, schema: { params: idParams } },
    async (req, reply): Promise<AdminPasswordResult | void> => {
      const u = target(req, reply);
      if (!u) return;
      const temporaryPassword = generateTemporaryPassword();
      repo.setPassword(u.id, await hashPassword(temporaryPassword), Date.now(), true);
      repo.log('admin_password_reset', req.user!.id, u.email);
      return { user: view(repo.findUser(u.id)!), temporaryPassword };
    },
  );

  // Téléphone perdu : retire l'application d'authentification du compte.
  app.post<{ Params: { id: string } }>(
    '/api/admin/users/:id/reset-totp',
    { ...limited, preHandler: requireAdmin, schema: { params: idParams } },
    async (req, reply): Promise<AdminUser | void> => {
      const u = target(req, reply);
      if (!u) return;
      repo.clearTotp(u.id);
      repo.log('admin_totp_reset', req.user!.id, u.email);
      return view(repo.findUser(u.id)!);
    },
  );

  // Donner ou retirer le rôle administrateur : confirmation par un code saisi à l'instant.
  app.post<{ Params: { id: string }; Body: { admin: boolean; code: string } }>(
    '/api/admin/users/:id/admin',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
      preHandler: requireAdmin,
      schema: {
        params: idParams,
        body: {
          type: 'object',
          required: ['admin', 'code'],
          additionalProperties: false,
          properties: { admin: { type: 'boolean' }, code: { type: 'string', pattern: '^[0-9]{6}$' } },
        },
      },
    },
    async (req, reply): Promise<AdminUser | void> => {
      const actor = req.user!;
      const id = Number(req.params.id);
      const u = repo.findUser(id);
      if (!u) return reply.code(404).send({ error: 'not_found', message: 'Compte introuvable.' });
      if (u.id === actor.id) {
        return reply.code(403).send({ error: 'self', message: 'Vous ne pouvez pas modifier votre propre rôle.' });
      }
      const secret = openSecret(actor.totp_secret, config.sessionSecret);
      const step = secret ? verifyTotp(secret, req.body.code, actor.totp_last_step) : null;
      if (step === null) {
        repo.log('code_failed', actor.id, 'rôle administrateur');
        return reply.code(400).send({ error: 'bad_code', message: 'Code incorrect ou déjà utilisé. Attendez le code suivant.' });
      }
      repo.setTotpStep(actor.id, step);
      if (req.body.admin && u.disabled) {
        return reply.code(409).send({ error: 'disabled', message: 'Réactivez ce compte avant de le nommer administrateur.' });
      }
      repo.setAdmin(u.id, req.body.admin);
      repo.log(req.body.admin ? 'admin_granted' : 'admin_revoked', actor.id, u.email);
      return view(repo.findUser(u.id)!);
    },
  );
}
