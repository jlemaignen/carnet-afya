// Accès aux données : Supabase (comptes, base) et la fonction carnet-api (écritures).
// L'interface de cet objet `api` est restée celle de l'ancien serveur, pour que les écrans ne
// changent pas : seules les implémentations passent par Supabase.
import { createClient, FunctionsHttpError } from '@supabase/supabase-js';
import type { AdminPasswordResult, AdminUser, AuthOptions, CarnetView, GroupView, LoginStep, MeView, Participant, Patient, Section, TotpSetup, Workshop } from './contract.ts';

export type { AdminPasswordResult, AdminUser, MeView, Section } from './contract.ts';

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

export const supabase = createClient(URL, KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
});

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

/** Appelé quand la session a expiré ou a été fermée : l'app revient à l'écran de connexion. */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}
supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT') onUnauthorized();
});

/** Lien « Mot de passe oublié » ouvert : Supabase a ouvert une session de récupération. */
export function onPasswordRecovery(fn: () => void) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') fn();
  });
}

const network = () => new ApiError(0, 'network', 'Pas de connexion. Vérifiez le réseau puis réessayez.');
const MAUVAIS = 'Adresse ou mot de passe incorrect.';

interface ProfileRow {
  id: string;
  email: string;
  display_name: string;
  sections: Section[];
  is_admin: boolean;
  disabled: boolean;
  must_change_password: boolean;
}

async function verifiedTotp() {
  const { data } = await supabase.auth.mfa.listFactors();
  return data?.totp.find((f) => f.status === 'verified') ?? null;
}

async function profile(): Promise<ProfileRow> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) throw new ApiError(401, 'no_session', 'Veuillez vous connecter.');
  const { data, error } = await supabase.from('profiles').select('*').eq('id', s.session.user.id).single();
  if (error || !data) throw new ApiError(401, 'no_session', 'Veuillez vous connecter.');
  if (data.disabled) {
    await supabase.auth.signOut();
    throw new ApiError(401, 'no_session', MAUVAIS);
  }
  return data as ProfileRow;
}

async function me(): Promise<MeView> {
  const p = await profile();
  // Application d'authentification activée mais code pas encore saisi : pas de session utilisable.
  const { data: niveau } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (niveau?.nextLevel === 'aal2' && niveau.currentLevel !== 'aal2') throw new ApiError(401, 'no_session', 'Veuillez vous connecter.');
  return {
    email: p.email,
    displayName: p.display_name,
    sections: p.sections,
    totpEnabled: !!(await verifiedTotp()),
    mustChangePassword: p.must_change_password,
    isAdmin: p.is_admin,
  };
}

/** Appel à la fonction carnet-api ; ses refus gardent leur message. */
async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('carnet-api', { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };
    // Retour à la connexion seulement si la session a vraiment disparu ; sinon le refus s'affiche.
    if (res.status === 401 && !(await supabase.auth.getSession()).data.session) onUnauthorized();
    throw new ApiError(res.status, j.error ?? 'unknown', j.message ?? 'Une erreur est survenue.');
  }
  throw network();
}

/** Mot de passe actuel vérifié sans toucher à la session en cours. */
async function checkPassword(email: string, password: string): Promise<boolean> {
  const tmp = createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const { error } = await tmp.auth.signInWithPassword({ email, password });
  if (!error) await tmp.auth.signOut({ scope: 'local' });
  return !error;
}

let pendingFactor: string | null = null;

export const api = {
  async login(email: string, password: string): Promise<LoginStep> {
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) {
      if (error.status === 429) throw new ApiError(429, 'rate_limited', 'Trop de tentatives, réessayez dans quelques minutes.');
      if (!error.status) throw network();
      throw new ApiError(401, 'bad_credentials', MAUVAIS);
    }
    const { data: niveau } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (niveau?.nextLevel === 'aal2' && niveau.currentLevel !== 'aal2') return { step: 'code' };
    return { step: 'done', me: await me() };
  },

  async code(code: string): Promise<MeView> {
    const f = await verifiedTotp();
    if (!f) throw new ApiError(400, 'code_expired', 'Recommencez la connexion.');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
    if (error) throw new ApiError(400, 'bad_code', 'Code incorrect. Attendez le code suivant et réessayez.');
    return me();
  },

  authOptions: async (): Promise<AuthOptions> => ({ resetByEmail: true }),

  async forgot(email: string): Promise<{ ok: true }> {
    // Même réponse que le compte existe ou non.
    await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: location.origin + location.pathname });
    return { ok: true };
  },

  /** Après le lien reçu par e-mail : session de récupération ouverte par Supabase. */
  async resetPassword(_token: string, password: string, code?: string): Promise<{ ok: true }> {
    const f = await verifiedTotp();
    if (f) {
      if (!code) throw new ApiError(400, 'code_required', "Saisissez aussi le code de votre application d'authentification.");
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
      if (error) throw new ApiError(400, 'bad_code', 'Code incorrect. Attendez le code suivant et réessayez.');
    }
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw new ApiError(400, 'invalid', error.message.includes('same') ? "Choisissez un mot de passe différent de l'ancien." : 'Ce lien a expiré : redemandez-en un.');
    await supabase.rpc('password_changed');
    await supabase.auth.signOut({ scope: 'global' });
    return { ok: true };
  },

  async totpSetup(): Promise<TotpSetup> {
    // Une activation commencée puis abandonnée ne doit pas bloquer la suivante.
    const { data } = await supabase.auth.mfa.listFactors();
    for (const f of data?.all ?? []) if (f.status !== 'verified') await supabase.auth.mfa.unenroll({ factorId: f.id });
    const { data: e, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Carnet AFYA' });
    if (error || !e) throw new ApiError(400, 'totp', 'Activation impossible pour le moment.');
    pendingFactor = e.id;
    return { secret: e.totp.secret, uri: e.totp.uri };
  },

  async totpEnable(code: string): Promise<MeView> {
    if (!pendingFactor) throw new ApiError(400, 'totp', 'Recommencez l’activation.');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: pendingFactor, code });
    if (error) throw new ApiError(400, 'bad_code', 'Code incorrect. Vérifiez l’heure du téléphone et réessayez.');
    pendingFactor = null;
    return me();
  },

  async totpDisable(code: string): Promise<MeView> {
    const f = await verifiedTotp();
    if (!f) return me();
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
    if (error) throw new ApiError(400, 'bad_code', 'Code incorrect.');
    await supabase.auth.mfa.unenroll({ factorId: f.id });
    await supabase.auth.refreshSession();
    return me();
  },

  adminUsers: () => call<AdminUser[]>({ action: 'users' }),
  adminCreate: (email: string, displayName: string, sections: Section[]) =>
    call<AdminPasswordResult>({ action: 'create', email, displayName, sections }),
  adminUpdate: (id: string, change: { sections?: Section[]; disabled?: boolean; displayName?: string }) =>
    call<AdminUser>({ action: 'update', id, ...change }),
  adminResetPassword: (id: string) => call<AdminPasswordResult>({ action: 'reset_password', id }),
  // Le rôle administrateur exige déjà une session confirmée par le code (aal2) : le code saisi ici
  // est vérifié une seconde fois par Supabase avant l'appel.
  async adminSetRole(id: string, isAdmin: boolean, code: string): Promise<AdminUser> {
    const f = await verifiedTotp();
    if (!f) throw new ApiError(403, 'totp_required', "Activez d'abord l'application d'authentification (bouton Sécurité).");
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: f.id, code });
    if (error) throw new ApiError(400, 'bad_code', 'Code incorrect ou déjà utilisé. Attendez le code suivant.');
    return call<AdminUser>({ action: 'set_admin', id, admin: isAdmin });
  },
  adminResetTotp: (id: string) => call<AdminUser>({ action: 'reset_totp', id }),

  async logout(): Promise<{ ok: true }> {
    await supabase.auth.signOut({ scope: 'local' });
    return { ok: true };
  },

  me,

  async changePassword(current: string, next: string): Promise<MeView> {
    const p = await profile();
    if (!(await checkPassword(p.email, current))) throw new ApiError(400, 'bad_password', 'Mot de passe actuel incorrect.');
    if (current === next) throw new ApiError(400, 'same', "Choisissez un mot de passe différent de l'actuel.");
    const { error } = await supabase.auth.updateUser({ password: next });
    if (error) throw new ApiError(400, 'invalid', error.message.includes('weak') ? 'Mot de passe trop faible.' : 'Changement impossible. Réessayez.');
    await supabase.rpc('password_changed');
    return me();
  },

  /** Le carnet vu par ce compte : le serveur (règles d'accès) ne renvoie que ce qui est permis. */
  async carnet(): Promise<CarnetView> {
    const p = await profile();
    if (p.must_change_password) throw new ApiError(403, 'password_change_required', 'Choisissez votre mot de passe avant de consulter le carnet.');
    const trainer = p.sections.includes('formateur') || p.is_admin;
    const [r1, r2, r3, group] = await Promise.all([
      supabase.from('participants').select('id, name, country, site, user_id, first_name, last_name, specialty, ws, code_key').order('id'),
      supabase.from('patients').select('data'),
      supabase.from('workshops').select('id, place, date, active').order('date', { ascending: false }),
      call<GroupView>({ action: 'group' }).catch(() => null),
    ]);
    if (r1.error || r2.error || r3.error) throw network();
    const rows = (r1.data ?? []) as {
      id: string; name: string; country: string; site: string; user_id: string | null; first_name: string | null;
      last_name: string | null; specialty: string | null; ws: { date: string; place: string } | null; code_key: string | null;
    }[];
    const parts: Participant[] = rows.map((x) => ({
      id: x.id,
      name: x.name,
      country: x.country,
      site: x.site,
      // Le numéro des patientes suit la clé gardée sur le serveur (nom normalisé, chiffre en cas d'homonyme).
      last: x.code_key ?? x.last_name ?? '',
      first: x.first_name ?? undefined,
      specialty: x.specialty,
      ws: x.ws,
      registered: true,
    }));
    const workshops = (r3.data ?? []) as Workshop[];
    const patients = (r2.data ?? []).map((r) => r.data as Patient).sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
    if (trainer) return { role: 'trainer', participant: null, participants: parts, patients, workshops, group };
    const mine = p.sections.includes('participant') ? rows.find((x) => x.user_id === p.id) : undefined;
    if (!mine) {
      throw p.sections.includes('participant')
        ? new ApiError(403, 'no_participant', "Ce compte n'est pas encore rattaché à un identifiant AFYA. Contactez un formateur.")
        : new ApiError(403, 'no_section', "Aucun accès au carnet n'est ouvert pour ce compte.");
    }
    const participant = parts.find((x) => x.id === mine.id)!;
    return { role: 'part', participant, participants: [participant], patients, workshops, group };
  },

  savePatient: (code: string, p: unknown) => call<Patient>({ action: 'save', code, patient: p }),
  feedback: (code: string, kind: string, text: string) => call<Patient>({ action: 'feedback', code, kind, text }),
  readFeedback: (code: string) => call<Patient>({ action: 'read_feedback', code }),

  /** Ateliers, lisibles sans compte : ceux ouverts à l'inscription, ou tous (équipe). */
  async workshops(all = false): Promise<Workshop[]> {
    let q = supabase.from('workshops').select('id, place, date, active');
    if (!all) q = q.eq('active', true);
    const { data, error } = await q.order('date', { ascending: false });
    if (error) throw network();
    return (data ?? []) as Workshop[];
  },
  /** Demande d'inscription par le lien ou le QR code d'un atelier : sans compte, validée ensuite par un administrateur. */
  register: (r: object) => call<{ ok: true }>({ ...r, action: 'register' }),

  // Équipe pédagogique (administrateurs).
  adminRegistrations: () => call<Registration[]>({ action: 'registrations' }),
  adminAcceptRegistration: (id: string) => call<AcceptResult>({ action: 'accept_registration', id }),
  adminRejectRegistration: (id: string) => call<{ ok: true }>({ action: 'reject_registration', id }),
  adminParticipants: () => call<ParticipantRow[]>({ action: 'participants' }),
  adminSetWs: (id: string, ws: { date: string; place: string } | null) => call<{ ok: true }>({ action: 'set_ws', id, ws }),
  adminSaveWorkshop: (w: Workshop) => call<{ ok: true }>({ action: 'save_workshop', ...w }),
};

export interface Registration {
  id: string;
  created_at: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  hospital: string;
  specialty: string;
  workshop_id: string | null;
}

export interface AcceptResult {
  user: AdminUser;
  temporaryPassword: string;
  participantId: string;
  codePrefix: string;
}

export interface ParticipantRow {
  id: string;
  name: string;
  country: string;
  site: string;
  email: string | null;
  phone: string | null;
  specialty: string | null;
  workshop_id: string | null;
  ws: { date: string; place: string } | null;
  code_key: string | null;
  user_id: string | null;
}
