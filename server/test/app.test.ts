import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from '../src/app.ts';
import { LoginThrottle, hashPassword, openSecret, sealSecret, totpAt, totpStep, verifyTotp } from '../src/auth.ts';
import type { Config } from '../src/config.ts';
import type { Section } from '../src/contract.ts';
import { Repository } from '../src/db.ts';
import type { Mailer } from '../src/mailer.ts';
import { parseSections } from '../src/sections.ts';

const PASSWORD = 'mot-de-passe-de-test-123';
const EMAIL = 'externe@exemple.ch';
const SECRET = 'x'.repeat(40);

const config: Config = {
  port: 0,
  publicBaseUrl: 'http://localhost:3030',
  sessionSecret: SECRET,
  dbPath: ':memory:',
  sessionMaxAgeSeconds: 3600,
  codeTtlSeconds: 300,
  resetTtlSeconds: 1800,
  mail: { transport: 'none', host: '', port: 587, secure: false, user: '', password: '', from: '' },
};

async function setup(sections: Section[] = ['formateur']) {
  const repo = new Repository(':memory:');
  const userId = repo.createUser(EMAIL, 'Personne Externe', await hashPassword(PASSWORD), sections);
  const app = await buildApp({ config, repo, logger: false, throttle: new LoginThrottle(3) });
  return { app, repo, userId };
}

type Ctx = Awaited<ReturnType<typeof setup>>;

function cookieOf(res: { cookies: { name: string; value: string }[] }, name: string): string {
  const c = res.cookies.find((x) => x.name === name);
  return c ? `${c.name}=${c.value}` : '';
}

async function password(ctx: Ctx, pwd = PASSWORD, email = EMAIL) {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/login', payload: { email, password: pwd } });
  return { res, pending: cookieOf(res, 'carnet_afya_code'), session: cookieOf(res, 'carnet_afya_session') };
}

/** Connexion d'un compte sans application d'authentification. */
async function login(ctx: Ctx): Promise<string> {
  const { res, session } = await password(ctx);
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().step, 'done');
  return session;
}

const post = (ctx: Ctx, url: string, cookie: string, payload: object = {}) =>
  ctx.app.inject({ method: 'POST', url, headers: { cookie }, payload });

/** Active l'application d'authentification et renvoie le secret, comme le ferait le téléphone. */
async function enrol(ctx: Ctx, cookie: string): Promise<Buffer> {
  const setup = await post(ctx, '/api/totp/setup', cookie);
  assert.equal(setup.statusCode, 200);
  assert.match(setup.json().uri, /^otpauth:\/\/totp\//);
  const secret = openSecret(ctx.repo.findUser(ctx.userId)!.totp_pending, SECRET)!;
  const res = await post(ctx, '/api/totp/enable', cookie, { code: totpAt(secret, totpStep()) });
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().totpEnabled, true);
  return secret;
}

/** Un code d'une période pas encore utilisée (l'activation a consommé la période en cours). */
const fresh = (secret: Buffer) => totpAt(secret, totpStep() + 1);

describe('connexion', () => {
  it("refuse l'API sans session", async () => {
    const ctx = await setup();
    for (const url of ['/api/accueil', '/api/me']) {
      assert.equal((await ctx.app.inject({ method: 'GET', url })).statusCode, 401, url);
    }
    assert.equal((await post(ctx, '/api/totp/setup', '')).statusCode, 401);
  });

  it('sans application : le mot de passe ouvre la session (cookie httpOnly SameSite strict)', async () => {
    const ctx = await setup();
    const { res } = await password(ctx);
    assert.equal(res.json().me.email, EMAIL);
    assert.equal(res.json().me.totpEnabled, false);
    const c = res.cookies.find((x) => x.name === 'carnet_afya_session')!;
    assert.equal(c.httpOnly, true);
    assert.equal(c.sameSite, 'Strict');
  });

  it('même message pour compte inconnu et mauvais mot de passe, puis verrou', async () => {
    const ctx = await setup();
    const a = await password(ctx, 'faux');
    const b = await password(ctx, PASSWORD, 'inconnu@exemple.ch');
    assert.equal(a.res.statusCode, 401);
    assert.equal(a.res.json().message, b.res.json().message);
    await password(ctx, 'faux');
    await password(ctx, 'faux');
    assert.equal((await password(ctx)).res.statusCode, 429, 'verrouillé même avec le bon mot de passe');
  });

  it('compte désactivé : session coupée et connexion refusée', async () => {
    const ctx = await setup();
    const cookie = await login(ctx);
    ctx.repo.setDisabled(ctx.userId, true, Date.now() + 1000);
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode, 401);
    assert.equal((await password(ctx)).res.statusCode, 401);
  });
});

describe("application d'authentification (facultative)", () => {
  it("une fois activée, le mot de passe seul n'ouvre plus de session", async () => {
    const ctx = await setup();
    const secret = await enrol(ctx, await login(ctx));
    const { res, pending, session } = await password(ctx);
    assert.equal(res.json().step, 'code');
    assert.equal(session, '');
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/accueil', headers: { cookie: pending } })).statusCode, 401);
    const ok = await post(ctx, '/api/login/code', pending, { code: fresh(secret) });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().totpEnabled, true);
    assert.notEqual(cookieOf(ok, 'carnet_afya_session'), '');
  });

  it("un code ne sert qu'une fois", async () => {
    const ctx = await setup();
    const secret = await enrol(ctx, await login(ctx));
    const code = fresh(secret);
    const first = await password(ctx);
    assert.equal((await post(ctx, '/api/login/code', first.pending, { code })).statusCode, 200);
    const second = await password(ctx);
    assert.equal((await post(ctx, '/api/login/code', second.pending, { code })).json().error, 'bad_code');
  });

  it('code faux : 5 essais puis il faut ressaisir le mot de passe', async () => {
    const ctx = await setup();
    const secret = await enrol(ctx, await login(ctx));
    const { pending } = await password(ctx);
    const good = fresh(secret);
    const bad = good === '000000' ? '000001' : '000000';
    for (let i = 0; i < 4; i++) assert.equal((await post(ctx, '/api/login/code', pending, { code: bad })).json().error, 'bad_code');
    assert.equal((await post(ctx, '/api/login/code', pending, { code: bad })).json().error, 'code_expired');
    assert.equal((await post(ctx, '/api/login/code', pending, { code: good })).statusCode, 401, 'le bon code ne marche plus');
  });

  it('un code sans le cookie du navigateur qui a saisi le mot de passe est refusé', async () => {
    const ctx = await setup();
    const secret = await enrol(ctx, await login(ctx));
    await password(ctx);
    assert.equal((await post(ctx, '/api/login/code', '', { code: fresh(secret) })).statusCode, 401);
  });

  it("l'activation exige un premier code juste ; rien n'est activé avant", async () => {
    const ctx = await setup();
    const cookie = await login(ctx);
    await post(ctx, '/api/totp/setup', cookie);
    assert.equal((await post(ctx, '/api/totp/enable', cookie, { code: '000000' })).statusCode, 400);
    assert.equal(ctx.repo.findUser(ctx.userId)!.totp_secret, null);
    assert.equal((await password(ctx)).res.json().step, 'done');
  });

  it('désactivation : code exigé ; remise à zéro par l\'administrateur', async () => {
    const ctx = await setup();
    const cookie = await login(ctx);
    const secret = await enrol(ctx, cookie);
    assert.equal((await post(ctx, '/api/totp/setup', cookie)).statusCode, 409);
    assert.equal((await post(ctx, '/api/totp/disable', cookie, { code: '000000' })).statusCode, 400);
    const off = await post(ctx, '/api/totp/disable', cookie, { code: fresh(secret) });
    assert.equal(off.json().totpEnabled, false);
    await enrol(ctx, cookie);
    ctx.repo.clearTotp(ctx.userId);
    assert.equal((await password(ctx)).res.json().step, 'done');
  });

  it('TOTP : vecteur RFC 6238, tolérance d\'une période, secret chiffré en base', () => {
    const rfc = Buffer.from('12345678901234567890');
    assert.equal(totpAt(rfc, Math.floor(59 / 30)), '287082');
    assert.equal(totpAt(rfc, Math.floor(1111111109 / 30)), '081804');
    const now = 1_800_000_000_000, s = totpStep(now);
    assert.equal(verifyTotp(rfc, totpAt(rfc, s - 1), 0, now), s - 1);
    assert.equal(verifyTotp(rfc, totpAt(rfc, s + 1), 0, now), s + 1);
    assert.equal(verifyTotp(rfc, totpAt(rfc, s - 2), 0, now), null);
    assert.equal(verifyTotp(rfc, totpAt(rfc, s), s, now), null, 'période déjà utilisée');
    const sealed = sealSecret(rfc, SECRET);
    assert.equal(sealed.includes(rfc.toString('base64url')), false);
    assert.deepEqual(openSecret(sealed, SECRET), rfc);
    assert.equal(openSecret(sealed, 'y'.repeat(40)), null);
  });
});

describe('mot de passe oublié', () => {
  /** App avec un envoi d'e-mails factice qui garde les messages. */
  async function setupMail() {
    const ctx = await setup();
    const boite: { to: string; subject: string; text: string; html: string }[] = [];
    const mailer: Mailer = { send: async (m) => void boite.push(m) };
    const app = await buildApp({ config, repo: ctx.repo, logger: false, throttle: new LoginThrottle(3), mailer });
    const jeton = () => {
      const m = boite.at(-1)!.text.match(/#reinitialisation=([A-Za-z0-9_-]+)/);
      assert.ok(m, 'le message contient le lien');
      return m[1];
    };
    return { ...ctx, app, boite, jeton };
  }
  const attendre = () => new Promise((r) => setImmediate(r));

  it("sans envoi d'e-mails : non proposé, la demande est refusée", async () => {
    const ctx = await setup();
    assert.deepEqual((await ctx.app.inject({ method: 'GET', url: '/api/auth/options' })).json(), { resetByEmail: false });
    const res = await ctx.app.inject({ method: 'POST', url: '/api/password/forgot', payload: { email: EMAIL } });
    assert.equal(res.statusCode, 503);
  });

  it('même réponse pour une adresse inconnue, aucun e-mail', async () => {
    const ctx = await setupMail();
    assert.deepEqual((await ctx.app.inject({ method: 'GET', url: '/api/auth/options' })).json(), { resetByEmail: true });
    const inconnu = await ctx.app.inject({ method: 'POST', url: '/api/password/forgot', payload: { email: 'personne@exemple.ch' } });
    const connu = await ctx.app.inject({ method: 'POST', url: '/api/password/forgot', payload: { email: EMAIL } });
    await attendre();
    assert.equal(inconnu.statusCode, 200);
    assert.deepEqual(inconnu.json(), connu.json());
    assert.equal(ctx.boite.length, 1);
    assert.equal(ctx.boite[0].to, EMAIL);
    assert.equal(/[—–·]/.test(ctx.boite[0].text), false, 'typographie de la charte');
  });

  it('le lien change le mot de passe une seule fois et coupe les sessions', async () => {
    const ctx = await setupMail();
    const cookie = await login(ctx);
    await ctx.app.inject({ method: 'POST', url: '/api/password/forgot', payload: { email: EMAIL } });
    await attendre();
    const token = ctx.jeton();
    assert.equal(ctx.repo.findReset(token), undefined, 'le jeton en clair n\'est pas en base');
    const court = await ctx.app.inject({ method: 'POST', url: '/api/password/reset', payload: { token, password: 'court' } });
    assert.equal(court.json().error, 'too_short');
    const NOUVEAU = 'nouveau-mot-de-passe-456';
    const ok = await ctx.app.inject({ method: 'POST', url: '/api/password/reset', payload: { token, password: NOUVEAU } });
    assert.equal(ok.statusCode, 200);
    const encore = await ctx.app.inject({ method: 'POST', url: '/api/password/reset', payload: { token, password: 'encore-un-autre-789' } });
    assert.equal(encore.json().error, 'reset_invalid', 'le lien ne sert qu\'une fois');
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/me', headers: { cookie } })).statusCode, 401, 'session ouverte coupée');
    assert.equal((await password(ctx)).res.statusCode, 401, 'ancien mot de passe refusé');
    assert.equal((await password(ctx, NOUVEAU)).res.statusCode, 200);
  });

  it('lien expiré ou remplacé par une nouvelle demande : refusé', async () => {
    const ctx = await setupMail();
    await ctx.app.inject({ method: 'POST', url: '/api/password/forgot', payload: { email: EMAIL } });
    await attendre();
    const premier = ctx.jeton();
    await ctx.app.inject({ method: 'POST', url: '/api/password/forgot', payload: { email: EMAIL } });
    await attendre();
    const remplace = await ctx.app.inject({ method: 'POST', url: '/api/password/reset', payload: { token: premier, password: 'nouveau-mot-de-passe-456' } });
    assert.equal(remplace.json().error, 'reset_invalid');
    ctx.repo.createReset('x'.repeat(64), ctx.userId, Date.now() - 1000);
    const faux = await ctx.app.inject({ method: 'POST', url: '/api/password/reset', payload: { token: 'y'.repeat(43), password: 'nouveau-mot-de-passe-456' } });
    assert.equal(faux.json().error, 'reset_invalid');
  });

  it('au plus 3 demandes par heure et par compte', async () => {
    const ctx = await setupMail();
    for (let i = 0; i < 5; i++) await ctx.app.inject({ method: 'POST', url: '/api/password/forgot', payload: { email: EMAIL } });
    await attendre();
    assert.equal(ctx.boite.length, 3);
  });

  it("avec l'application d'authentification, le code reste exigé", async () => {
    const ctx = await setupMail();
    const secret = await enrol(ctx, await login(ctx));
    await ctx.app.inject({ method: 'POST', url: '/api/password/forgot', payload: { email: EMAIL } });
    await attendre();
    const token = ctx.jeton();
    const NOUVEAU = 'nouveau-mot-de-passe-456';
    const sans = await ctx.app.inject({ method: 'POST', url: '/api/password/reset', payload: { token, password: NOUVEAU } });
    assert.equal(sans.json().error, 'code_required');
    const faux = await ctx.app.inject({ method: 'POST', url: '/api/password/reset', payload: { token, password: NOUVEAU, code: '000000' } });
    assert.equal(faux.json().error, 'bad_code');
    const ok = await ctx.app.inject({ method: 'POST', url: '/api/password/reset', payload: { token, password: NOUVEAU, code: fresh(secret) } });
    assert.equal(ok.statusCode, 200);
    assert.equal((await password(ctx, NOUVEAU)).res.json().step, 'code', 'le second facteur reste actif');
  });

  it('compte désactivé : aucun e-mail', async () => {
    const ctx = await setupMail();
    ctx.repo.setDisabled(ctx.userId, true);
    await ctx.app.inject({ method: 'POST', url: '/api/password/forgot', payload: { email: EMAIL } });
    await attendre();
    assert.equal(ctx.boite.length, 0);
  });
});

describe('accueil et rubriques', () => {
  it('ouvert avec une rubrique, rubriques renvoyées', async () => {
    const ctx = await setup(['formateur']);
    const cookie = await login(ctx);
    const res = await ctx.app.inject({ method: 'GET', url: '/api/accueil', headers: { cookie } });
    assert.equal(res.statusCode, 200);
    assert.deepEqual(res.json().sections, ['formateur']);
  });

  it('changer les rubriques prend effet tout de suite ; aucune rubrique = 403', async () => {
    const ctx = await setup(['formateur']);
    const cookie = await login(ctx);
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/accueil', headers: { cookie } })).statusCode, 200);
    ctx.repo.setSections(ctx.userId, []);
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/accueil', headers: { cookie } })).statusCode, 403);
  });

  it('mot de passe provisoire : à changer avant les données, puis accès normal', async () => {
    const repo = new Repository(':memory:');
    repo.createUser('provisoire@exemple.ch', 'Provisoire', await hashPassword(PASSWORD), ['formateur'], true);
    const app = await buildApp({ config, repo, logger: false, throttle: new LoginThrottle(3) });
    const ctx = { app, repo, userId: 0 };
    const { res, session } = await password(ctx, PASSWORD, 'provisoire@exemple.ch');
    assert.equal(res.json().me.mustChangePassword, true);
    assert.equal((await app.inject({ method: 'GET', url: '/api/accueil', headers: { cookie: session } })).statusCode, 403);

    assert.equal((await post(ctx, '/api/password', session, { current: 'faux-mot-de-passe', next: 'nouveau-mot-de-passe-1' })).statusCode, 400);
    assert.equal((await post(ctx, '/api/password', session, { current: PASSWORD, next: 'court' })).statusCode, 400);
    assert.equal((await post(ctx, '/api/password', session, { current: PASSWORD, next: PASSWORD })).statusCode, 400);
    const ok = await post(ctx, '/api/password', session, { current: PASSWORD, next: 'nouveau-mot-de-passe-1' });
    assert.equal(ok.statusCode, 200);
    assert.equal(ok.json().mustChangePassword, false);
    const neuve = cookieOf(ok, 'carnet_afya_session');
    assert.equal((await app.inject({ method: 'GET', url: '/api/accueil', headers: { cookie: neuve } })).statusCode, 200);
    assert.equal((await app.inject({ method: 'GET', url: '/api/accueil', headers: { cookie: session } })).statusCode, 401, "l'ancienne session est coupée");
    assert.equal((await password(ctx, 'nouveau-mot-de-passe-1', 'provisoire@exemple.ch')).res.statusCode, 200);
  });

  it("aucune route d'écriture de données", async () => {
    const ctx = await setup();
    const cookie = await login(ctx);
    for (const method of ['POST', 'PUT', 'DELETE'] as const) {
      const res = await ctx.app.inject({ method, url: '/api/accueil', headers: { cookie }, payload: {} });
      assert.equal(res.statusCode, 404, method);
    }
  });

  it('parseSections', () => {
    assert.deepEqual(parseSections('formateur, formateur'), ['formateur']);
    assert.deepEqual(parseSections('all'), ['participant', 'formateur']);
    assert.throws(() => parseSections('formateur,patients'));
  });
});

describe('administrateurs', () => {
  /** Un administrateur prêt à agir : rôle donné sur le serveur, application d'authentification activée. */
  async function admin(ctx: Ctx): Promise<string> {
    ctx.repo.setAdmin(ctx.userId, true);
    const cookie = await login(ctx);
    await enrol(ctx, cookie);
    return cookie;
  }
  const call = (ctx: Ctx, method: 'GET' | 'POST' | 'PATCH', url: string, cookie: string, payload?: object) =>
    ctx.app.inject({ method, url, headers: { cookie }, ...(payload ? { payload } : {}) });
  const nouveau = { email: 'Invitee@Exemple.ch', displayName: 'Personne Invitée', sections: ['formateur'] };

  it('refusé sans session, à un compte ordinaire, et à un administrateur sans application', async () => {
    const ctx = await setup();
    assert.equal((await call(ctx, 'GET', '/api/admin/users', '')).statusCode, 401);
    const cookie = await login(ctx);
    assert.equal((await call(ctx, 'GET', '/api/admin/users', cookie)).statusCode, 403);
    assert.equal((await call(ctx, 'POST', '/api/admin/users', cookie, nouveau)).statusCode, 403);
    ctx.repo.setAdmin(ctx.userId, true);
    const sansTotp = await call(ctx, 'POST', '/api/admin/users', cookie, nouveau);
    assert.equal(sansTotp.json().error, 'totp_required');
    assert.equal(ctx.repo.findUserByEmail('invitee@exemple.ch'), undefined);
    assert.equal((await call(ctx, 'GET', '/api/me', cookie)).json().isAdmin, true);
  });

  it('crée un compte avec un mot de passe provisoire, à changer avant de voir les chiffres', async () => {
    const ctx = await setup();
    const cookie = await admin(ctx);
    const res = await call(ctx, 'POST', '/api/admin/users', cookie, nouveau);
    assert.equal(res.statusCode, 200);
    const { user, temporaryPassword } = res.json();
    assert.equal(user.email, 'invitee@exemple.ch');
    assert.deepEqual(user.sections, ['formateur']);
    assert.equal(user.mustChangePassword, true);
    assert.equal(user.isAdmin, false);
    assert.equal(temporaryPassword.length >= 12, true);
    assert.equal((await call(ctx, 'POST', '/api/admin/users', cookie, nouveau)).statusCode, 409, 'doublon refusé');

    const list = (await call(ctx, 'GET', '/api/admin/users', cookie)).json();
    assert.equal(list.length, 2);
    assert.equal(/password|secret|hash/i.test(JSON.stringify(list).replace(/mustChangePassword/g, '')), false, 'ni mot de passe ni secret dans la liste');

    const first = await password(ctx, temporaryPassword, 'invitee@exemple.ch');
    assert.equal(first.res.json().me.mustChangePassword, true);
    assert.equal((await call(ctx, 'GET', '/api/accueil', first.session)).statusCode, 403);
    assert.equal((await call(ctx, 'GET', '/api/admin/users', first.session)).statusCode, 403);
  });

  it('modifie rubriques et activation, réinitialise mot de passe et application', async () => {
    const ctx = await setup();
    const cookie = await admin(ctx);
    const created = (await call(ctx, 'POST', '/api/admin/users', cookie, nouveau)).json();
    const id = created.user.id;

    const maj = await call(ctx, 'PATCH', `/api/admin/users/${id}`, cookie, { sections: [] });
    assert.deepEqual(maj.json().sections, []);
    assert.equal((await call(ctx, 'PATCH', `/api/admin/users/${id}`, cookie, { sections: ['patients'] })).statusCode, 400);
    assert.equal((await call(ctx, 'PATCH', `/api/admin/users/${id}`, cookie, { isAdmin: true })).statusCode, 400, 'le rôle ne se donne pas ici');

    assert.equal((await call(ctx, 'PATCH', `/api/admin/users/${id}`, cookie, { disabled: true })).json().disabled, true);
    assert.equal((await password(ctx, created.temporaryPassword, 'invitee@exemple.ch')).res.statusCode, 401);
    assert.equal((await call(ctx, 'PATCH', `/api/admin/users/${id}`, cookie, { disabled: false })).json().disabled, false);

    const reset = (await call(ctx, 'POST', `/api/admin/users/${id}/reset-password`, cookie)).json();
    assert.notEqual(reset.temporaryPassword, created.temporaryPassword);
    assert.equal((await password(ctx, created.temporaryPassword, 'invitee@exemple.ch')).res.statusCode, 401, 'ancien mot de passe refusé');
    assert.equal((await password(ctx, reset.temporaryPassword, 'invitee@exemple.ch')).res.statusCode, 200);

    ctx.repo.enableTotp(id, 'scelle', 1);
    assert.equal((await call(ctx, 'POST', `/api/admin/users/${id}/reset-totp`, cookie)).json().totpEnabled, false);
    assert.equal((await call(ctx, 'PATCH', '/api/admin/users/9999', cookie, { disabled: true })).statusCode, 404);

    const kinds = ctx.repo.recentEvents().filter((e) => e.kind.startsWith('admin_')).map((e) => `${e.kind}|${e.email}`);
    assert.equal(kinds.includes(`admin_user_created|${EMAIL}`), true, "l'auteur est noté au journal");
    assert.equal(kinds.includes(`admin_password_reset|${EMAIL}`), true);
  });

  it('ne peut rien faire sur un compte administrateur, le sien compris', async () => {
    const ctx = await setup();
    const cookie = await admin(ctx);
    const autre = ctx.repo.createUser('chef@exemple.ch', 'Autre Admin', await hashPassword(PASSWORD), []);
    ctx.repo.setAdmin(autre, true);
    for (const id of [ctx.userId, autre]) {
      assert.equal((await call(ctx, 'PATCH', `/api/admin/users/${id}`, cookie, { disabled: true })).statusCode, 403);
      assert.equal((await call(ctx, 'POST', `/api/admin/users/${id}/reset-password`, cookie)).statusCode, 403);
      assert.equal((await call(ctx, 'POST', `/api/admin/users/${id}/reset-totp`, cookie)).statusCode, 403);
    }
    assert.equal(ctx.repo.findUser(autre)!.disabled, 0);
    assert.equal((await password(ctx, PASSWORD, 'chef@exemple.ch')).res.statusCode, 200);
  });

  it("un administrateur choisit ses propres rubriques, rien d'autre sur son compte ni sur celui d'un autre administrateur", async () => {
    const ctx = await setup();
    const cookie = await admin(ctx);
    const autre = ctx.repo.createUser('chef@exemple.ch', 'Autre Admin', await hashPassword(PASSWORD), []);
    ctx.repo.setAdmin(autre, true);
    const soi = await call(ctx, 'PATCH', `/api/admin/users/${ctx.userId}`, cookie, { sections: [] });
    assert.equal(soi.statusCode, 200);
    assert.deepEqual(soi.json().sections, []);
    assert.equal((await call(ctx, 'PATCH', `/api/admin/users/${ctx.userId}`, cookie, { sections: ['formateur'], disabled: true })).statusCode, 403, 'rubriques seulement');
    assert.equal((await call(ctx, 'PATCH', `/api/admin/users/${ctx.userId}`, cookie, { displayName: 'Autre nom' })).statusCode, 403);
    assert.equal((await call(ctx, 'PATCH', `/api/admin/users/${autre}`, cookie, { sections: ['formateur'] })).statusCode, 403, "pas les rubriques d'un autre administrateur");
    assert.equal(ctx.repo.findUser(ctx.userId)!.disabled, 0);
  });

  it('nomme et révoque un administrateur avec un code saisi à l\'instant, jamais pour soi-même', async () => {
    const ctx = await setup();
    ctx.repo.setAdmin(ctx.userId, true);
    const cookie = await login(ctx);
    const secret = await enrol(ctx, cookie);
    const id = (await call(ctx, 'POST', '/api/admin/users', cookie, nouveau)).json().user.id;
    const role = (target: number, admin: boolean, code: string) => call(ctx, 'POST', `/api/admin/users/${target}/admin`, cookie, { admin, code });

    assert.equal((await call(ctx, 'POST', `/api/admin/users/${id}/admin`, cookie, { admin: true })).statusCode, 400, 'code obligatoire');
    assert.equal((await role(id, true, '000000')).statusCode, 400);
    assert.equal(ctx.repo.findUser(id)!.is_admin, 0);

    const code = totpAt(secret, totpStep() + 1);
    const ok = await role(id, true, code);
    assert.equal(ok.json().isAdmin, true);
    assert.equal((await role(id, false, code)).statusCode, 400, 'un code ne sert qu\'une fois');
    assert.equal(ctx.repo.findUser(id)!.is_admin, 1);
    assert.equal((await call(ctx, 'POST', `/api/admin/users/${id}/reset-password`, cookie)).statusCode, 403, 'protégé tant qu\'il est administrateur');

    assert.equal((await role(ctx.userId, false, totpAt(secret, totpStep() + 2))).statusCode, 403, 'pas son propre rôle');
    assert.equal(ctx.repo.findUser(ctx.userId)!.is_admin, 1);

    // Horloge du téléphone en avance de deux périodes : hors tolérance, donc on avance le compteur à la main
    ctx.repo.setTotpStep(ctx.userId, totpStep() - 5);
    assert.equal((await role(id, false, totpAt(secret, totpStep()))).json().isAdmin, false);
    const kinds = ctx.repo.recentEvents().map((e) => `${e.kind}|${e.email}|${e.detail}`);
    assert.equal(kinds.includes(`admin_granted|${EMAIL}|invitee@exemple.ch`), true);
    assert.equal(kinds.includes(`admin_revoked|${EMAIL}|invitee@exemple.ch`), true);
  });

  it('un compte ordinaire ne peut pas se nommer administrateur', async () => {
    const ctx = await setup();
    const cookie = await login(ctx);
    const secret = await enrol(ctx, cookie);
    const res = await call(ctx, 'POST', `/api/admin/users/${ctx.userId}/admin`, cookie, { admin: true, code: totpAt(secret, totpStep() + 1) });
    assert.equal(res.statusCode, 403);
    assert.equal(ctx.repo.findUser(ctx.userId)!.is_admin, 0);
  });

  it('migration : une base créée avant le rôle administrateur garde ses comptes', async () => {
    const { DatabaseSync } = await import('node:sqlite');
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'dash-'));
    try {
      const file = join(dir, 'ancienne.db');
      const old = new DatabaseSync(file);
      old.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE, display_name TEXT NOT NULL,
        password_hash TEXT NOT NULL, sections TEXT NOT NULL DEFAULT '[]', disabled INTEGER NOT NULL DEFAULT 0, sessions_valid_after INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')), last_login_at TEXT, totp_secret TEXT, totp_pending TEXT, totp_last_step INTEGER NOT NULL DEFAULT 0,
        must_change_password INTEGER NOT NULL DEFAULT 0);
        INSERT INTO users (email, display_name, password_hash, sections) VALUES ('ancien@exemple.ch', 'Ancien', 'x', '["formateur"]');`);
      old.close();
      const repo = new Repository(file);
      const u = repo.findUserByEmail('ancien@exemple.ch')!;
      assert.equal(u.is_admin, 0);
      assert.equal(u.sections, '["formateur"]');
      repo.setAdmin(u.id, true);
      assert.equal(new Repository(file).findUser(u.id)!.is_admin, 1);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
