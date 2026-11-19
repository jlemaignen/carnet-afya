// Fonction Supabase « carnet-api » : seules écritures du carnet et gestion des comptes.
// Le navigateur lit directement la base (règles d'accès RLS) ; tout ce qui écrit passe ici, avec la
// clé de service, après vérification du compte appelant et de chaque champ.
//
// Déploiement : Supabase, Edge Functions, « Deploy a new function », « Via Editor », nom carnet-api,
// coller le fichier supabase/carnet-api.bundle.ts (généré par scripts/bundle-function.mjs).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { InvalidPatient, cleanPatient, isCodeOf } from './rules.ts';

const SECTIONS = ['participant', 'formateur'] as const;
type Section = (typeof SECTIONS)[number];

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

class Refus extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

interface Profile {
  id: string;
  email: string;
  display_name: string;
  sections: Section[];
  is_admin: boolean;
  disabled: boolean;
  must_change_password: boolean;
}

/** Niveau d'authentification de la session (aal2 = code de l'application saisi). */
function aal(jwt: string): string {
  try {
    const payload = JSON.parse(atob(jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return String(payload.aal ?? 'aal1');
  } catch {
    return 'aal1';
  }
}

async function caller(req: Request): Promise<{ profile: Profile; jwt: string }> {
  const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new Refus(401, 'no_session', 'Veuillez vous connecter.');
  const { data: profile } = await admin.from('profiles').select('*').eq('id', data.user.id).single();
  if (!profile || profile.disabled) throw new Refus(401, 'no_session', 'Veuillez vous connecter.');
  if (profile.must_change_password) throw new Refus(403, 'password_change_required', "Choisissez d'abord votre mot de passe.");
  return { profile: profile as Profile, jwt };
}

async function log(userId: string | null, kind: string, detail?: string) {
  await admin.from('events').insert({ user_id: userId, kind, detail: detail ?? null });
}

// ── Fiches ─────────────────────────────────────────────────────────────────

async function savePatient(me: Profile, code: string, input: unknown) {
  if (!me.sections.includes('participant')) {
    throw new Refus(403, 'read_only', 'Les formateurs consultent le carnet sans le modifier.');
  }
  const { data: part } = await admin.from('participants').select('id').eq('user_id', me.id).maybeSingle();
  if (!part) throw new Refus(403, 'no_participant', "Ce compte n'est pas encore rattaché à un identifiant AFYA. Contactez un formateur.");
  if (typeof code !== 'string' || !isCodeOf(code, part.id)) throw new Refus(403, 'not_yours', "Ce code n'appartient pas à votre carnet.");
  const { data: existing } = await admin.from('patients').select('participant_id').eq('code', code).maybeSingle();
  if (existing && existing.participant_id !== part.id) throw new Refus(403, 'not_yours', "Cette fiche n'appartient pas à votre carnet.");
  let patient;
  try {
    patient = cleanPatient(input, code, part.id);
  } catch (e) {
    if (e instanceof InvalidPatient) throw new Refus(400, 'invalid', e.message);
    throw e;
  }
  const { error } = await admin
    .from('patients')
    .upsert({ code, participant_id: part.id, data: patient, updated_at: new Date().toISOString(), updated_by: me.id });
  if (error) throw new Error(error.message);
  await log(me.id, existing ? 'patient_update' : 'patient_create', code);
  return patient;
}

// ── Comptes (administrateurs, session confirmée par l'application d'authentification) ──

function requireAdmin(me: Profile, jwt: string) {
  if (!me.is_admin) throw new Refus(403, 'forbidden', 'Réservé aux administrateurs.');
  if (aal(jwt) !== 'aal2') {
    throw new Refus(403, 'totp_required', "Pour gérer les comptes, activez l'application d'authentification (bouton Sécurité), puis reconnectez-vous avec son code.");
  }
}

function temporaryPassword(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}

const cleanSections = (list: unknown): Section[] =>
  SECTIONS.filter((s) => Array.isArray(list) && list.includes(s));

async function view(p: Profile) {
  const { data } = await admin.auth.admin.getUserById(p.id);
  const u = data.user;
  return {
    id: p.id,
    email: p.email,
    displayName: p.display_name,
    sections: p.sections,
    disabled: p.disabled,
    totpEnabled: (u?.factors ?? []).some((f) => f.status === 'verified'),
    mustChangePassword: p.must_change_password,
    isAdmin: p.is_admin,
    lastLoginAt: u?.last_sign_in_at ?? null,
  };
}

/** Le compte visé, s'il existe et n'est pas administrateur (sauf soi-même pour ses rubriques). */
async function target(id: unknown, me: Profile, soiMeme = false): Promise<Profile> {
  const { data } = await admin.from('profiles').select('*').eq('id', String(id)).maybeSingle();
  if (!data) throw new Refus(404, 'not_found', 'Compte introuvable.');
  if (data.is_admin && !(soiMeme && data.id === me.id)) throw new Refus(403, 'admin_account', "Retirez d'abord le rôle administrateur de ce compte.");
  return data as Profile;
}

async function adminAction(me: Profile, body: Record<string, unknown>) {
  switch (body.action) {
    case 'users': {
      const { data } = await admin.from('profiles').select('*').order('email');
      return Promise.all((data ?? []).map((p) => view(p as Profile)));
    }
    case 'create': {
      const email = String(body.email ?? '').trim().toLowerCase();
      const displayName = String(body.displayName ?? '').trim().slice(0, 80);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !displayName) throw new Refus(400, 'validation', "Indiquez l'adresse et le nom de la personne.");
      const password = temporaryPassword();
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { display_name: displayName } });
      if (error || !data.user) throw new Refus(409, 'exists', error?.message.includes('already') ? 'Un compte existe déjà pour cette adresse.' : (error?.message ?? 'Création impossible.'));
      const sections = cleanSections(body.sections);
      await admin.from('profiles').upsert({ id: data.user.id, email, display_name: displayName, sections, must_change_password: true });
      await log(me.id, 'admin_user_created', `${email} : ${sections.join(',') || 'aucune rubrique'}`);
      const { data: p } = await admin.from('profiles').select('*').eq('id', data.user.id).single();
      return { user: await view(p as Profile), temporaryPassword: password };
    }
    case 'update': {
      const change: Record<string, unknown> = {};
      const onlySections = Object.keys(body).every((k) => k === 'action' || k === 'id' || k === 'sections');
      const u = await target(body.id, me, onlySections);
      if (Array.isArray(body.sections)) change.sections = cleanSections(body.sections);
      if (typeof body.displayName === 'string' && body.displayName.trim()) change.display_name = body.displayName.trim().slice(0, 80);
      if (typeof body.disabled === 'boolean') {
        change.disabled = body.disabled;
        await admin.auth.admin.updateUserById(u.id, { ban_duration: body.disabled ? '876000h' : 'none' });
      }
      if (!Object.keys(change).length) throw new Refus(400, 'validation', 'Aucune modification reconnue.');
      await admin.from('profiles').update(change).eq('id', u.id);
      await log(me.id, 'admin_user_updated', `${u.email} : ${Object.keys(change).join(', ')}`);
      const { data: p } = await admin.from('profiles').select('*').eq('id', u.id).single();
      return view(p as Profile);
    }
    case 'reset_password': {
      const u = await target(body.id, me);
      const password = temporaryPassword();
      await admin.auth.admin.updateUserById(u.id, { password });
      await admin.from('profiles').update({ must_change_password: true }).eq('id', u.id);
      await log(me.id, 'admin_password_reset', u.email);
      const { data: p } = await admin.from('profiles').select('*').eq('id', u.id).single();
      return { user: await view(p as Profile), temporaryPassword: password };
    }
    case 'reset_totp': {
      const u = await target(body.id, me);
      const { data } = await admin.auth.admin.mfa.listFactors({ userId: u.id });
      for (const f of data?.factors ?? []) await admin.auth.admin.mfa.deleteFactor({ userId: u.id, id: f.id });
      await log(me.id, 'admin_totp_reset', u.email);
      return view(u);
    }
    case 'set_admin': {
      const { data: u } = await admin.from('profiles').select('*').eq('id', String(body.id)).maybeSingle();
      if (!u) throw new Refus(404, 'not_found', 'Compte introuvable.');
      if (u.id === me.id) throw new Refus(403, 'self', 'Vous ne pouvez pas modifier votre propre rôle.');
      if (body.admin === true && u.disabled) throw new Refus(409, 'disabled', 'Réactivez ce compte avant de le nommer administrateur.');
      await admin.from('profiles').update({ is_admin: body.admin === true }).eq('id', u.id);
      await log(me.id, body.admin === true ? 'admin_granted' : 'admin_revoked', u.email);
      const { data: p } = await admin.from('profiles').select('*').eq('id', u.id).single();
      return view(p as Profile);
    }
    default:
      throw new Refus(400, 'validation', 'Action inconnue.');
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method', message: 'Méthode non acceptée.' }, 405);
  try {
    const raw = await req.text();
    if (raw.length > 64 * 1024) throw new Refus(413, 'too_large', 'Fiche trop volumineuse.');
    const body = JSON.parse(raw || '{}') as Record<string, unknown>;
    const { profile, jwt } = await caller(req);
    if (body.action === 'save') return json(await savePatient(profile, String(body.code ?? ''), body.patient));
    requireAdmin(profile, jwt);
    return json(await adminAction(profile, body));
  } catch (e) {
    if (e instanceof Refus) return json({ error: e.code, message: e.message }, e.status);
    if (e instanceof SyntaxError) return json({ error: 'validation', message: 'Requête invalide.' }, 400);
    console.error((e as Error).message);
    return json({ error: 'server', message: 'Une erreur est survenue. Réessayez dans quelques instants.' }, 500);
  }
});
