// Fonction Supabase « carnet-api » : seules écritures du carnet et gestion des comptes.
// Le navigateur lit directement la base (règles d'accès RLS) ; tout ce qui écrit passe ici, avec la
// clé de service, après vérification du compte appelant et de chaque champ.
//
// Déploiement : Supabase, Edge Functions, « Deploy a new function », « Via Editor », nom carnet-api,
// coller le fichier supabase/carnet-api.bundle.ts (généré par scripts/bundle-function.mjs).
import { createClient } from 'npm:@supabase/supabase-js@2';
import { InvalidPatient, cleanPatient, cleanRegistration, isCodeOf, newFb, normName } from './rules.ts';
import { groupView } from './group.ts';

const SECTIONS = ['participant', 'formateur'] as const;
type Section = (typeof SECTIONS)[number];

/**
 * Clé de service : ancien nom (SUPABASE_SERVICE_ROLE_KEY) ou nouvelles clés secrètes
 * (SUPABASE_SECRET_KEYS, objet JSON {nom: clé}), selon l'âge du projet.
 */
function serviceKey(): string {
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS') ?? '{}') as Record<string, string>;
    const first = keys.default ?? Object.values(keys)[0];
    if (first) return first;
  } catch {
    /* format inattendu : erreur claire ci-dessous */
  }
  throw new Error('clé de service introuvable (SUPABASE_SERVICE_ROLE_KEY ou SUPABASE_SECRET_KEYS)');
}

const admin = createClient(Deno.env.get('SUPABASE_URL')!, serviceKey(), {
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
  const part = await myParticipant(me);
  if (typeof code !== 'string' || !isCodeOf(code, { country: part.country, last: part.key })) {
    throw new Refus(403, 'not_yours', "Ce code n'appartient pas à votre carnet.");
  }
  const { data: existing } = await admin.from('patients').select('participant_id, data').eq('code', code).maybeSingle();
  if (existing && existing.participant_id !== part.id) throw new Refus(403, 'not_yours', "Cette fiche n'appartient pas à votre carnet.");
  let patient;
  try {
    patient = cleanPatient(input, code, part.id);
    // Les échanges avec le formateur restent ceux de la base, jamais ceux envoyés par le navigateur.
    patient.fb = ((existing?.data as { fb?: typeof patient.fb } | undefined)?.fb) ?? [];
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

/** Participant rattaché au compte, avec la clé du numéro de ses patientes (ETH_GIRMA). */
async function myParticipant(me: Profile) {
  if (!me.sections.includes('participant')) throw new Refus(403, 'read_only', 'Les formateurs consultent le carnet sans le modifier.');
  const { data: part } = await admin.from('participants').select('id, country, code_key, last_name, name').eq('user_id', me.id).maybeSingle();
  if (!part) throw new Refus(403, 'no_participant', "Ce compte n'est pas encore rattaché à un identifiant AFYA. Contactez un formateur.");
  const key = part.code_key || normName(part.last_name || String(part.name).trim().split(/\s+/).pop() || '');
  return { id: part.id as string, country: part.country as string, key };
}

const isTrainer = (me: Profile) => me.sections.includes('formateur') || me.is_admin;

/** Jour à Genève (AAAA-MM-JJ). */
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich' }).format(new Date());

type Row = { code: string; participant_id: string; data: Record<string, unknown> & { fb?: { from: string; read: boolean }[] } };

async function loadPatient(code: unknown): Promise<Row> {
  const { data } = await admin.from('patients').select('code, participant_id, data').eq('code', String(code ?? '')).maybeSingle();
  if (!data) throw new Refus(404, 'not_found', 'Fiche introuvable.');
  return data as Row;
}

/** Message, validation ou félicitations sur un cas. Le participant n'écrit que sur ses fiches. */
async function feedback(me: Profile, body: Record<string, unknown>) {
  const row = await loadPatient(body.code);
  const trainer = isTrainer(me);
  if (!trainer) {
    const part = await myParticipant(me);
    if (row.participant_id !== part.id) throw new Refus(403, 'not_yours', "Cette fiche n'appartient pas à votre carnet.");
  }
  let fb;
  try {
    fb = newFb(trainer ? 'trainer' : 'part', body.kind, body.text, today());
  } catch (e) {
    if (e instanceof InvalidPatient) throw new Refus(400, 'invalid', e.message);
    throw e;
  }
  const data = { ...row.data, fb: [...(row.data.fb ?? []), fb] };
  await admin.from('patients').update({ data, updated_at: new Date().toISOString(), updated_by: me.id }).eq('code', row.code);
  await log(me.id, 'feedback_' + fb.kind, row.code);
  return data;
}

/** Le participant a lu les messages du formateur sur ce cas. */
async function readFeedback(me: Profile, code: unknown) {
  const part = await myParticipant(me);
  const row = await loadPatient(code);
  if (row.participant_id !== part.id) throw new Refus(403, 'not_yours', "Cette fiche n'appartient pas à votre carnet.");
  const data = { ...row.data, fb: (row.data.fb ?? []).map((m) => (m.from === 'trainer' ? { ...m, read: true } : m)) };
  await admin.from('patients').update({ data }).eq('code', row.code);
  return data;
}

/** Comparaison avec le groupe et réseau AFYA : moyennes et comptes seulement. */
async function group() {
  const [{ data: rows }, { data: parts }] = await Promise.all([
    admin.from('patients').select('data'),
    admin.from('participants').select('id, name, country'),
  ]);
  return groupView((rows ?? []).map((r) => r.data), parts ?? [], new Date());
}

// ── Inscription par le lien ou le QR code d'un atelier (sans compte) ───────────

async function register(body: Record<string, unknown>) {
  let r;
  try {
    r = cleanRegistration(body);
  } catch (e) {
    if (e instanceof InvalidPatient) throw new Refus(400, 'invalid', e.message);
    throw e;
  }
  if (r.workshop_id) {
    const { data: w } = await admin.from('workshops').select('id').eq('id', r.workshop_id).maybeSingle();
    if (!w) r.workshop_id = null;
  }
  // Une seule demande en attente par adresse ; garde-fou contre les envois en masse.
  const { data: dup } = await admin.from('registrations').select('id').eq('email', r.email).eq('status', 'pending').maybeSingle();
  if (dup) return { ok: true };
  const since = new Date(Date.now() - 3600_000).toISOString();
  const { count } = await admin.from('registrations').select('id', { count: 'exact', head: true }).gte('created_at', since);
  if ((count ?? 0) >= 40) throw new Refus(429, 'rate_limited', 'Trop de demandes en ce moment. Réessayez plus tard.');
  await admin.from('registrations').insert(r);
  await log(null, 'registration', `${r.country} ${r.email}`);
  return { ok: true };
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
    case 'registrations': {
      const { data } = await admin.from('registrations').select('*').eq('status', 'pending').order('created_at');
      return data ?? [];
    }
    case 'reject_registration': {
      await admin.from('registrations').update({ status: 'rejected', handled_by: me.id, handled_at: new Date().toISOString() })
        .eq('id', String(body.id)).eq('status', 'pending');
      await log(me.id, 'registration_rejected', String(body.id));
      return { ok: true };
    }
    case 'accept_registration': {
      const { data: r } = await admin.from('registrations').select('*').eq('id', String(body.id)).eq('status', 'pending').maybeSingle();
      if (!r) throw new Refus(404, 'not_found', 'Demande introuvable ou déjà traitée.');
      const name = `Dr ${String(r.first_name).charAt(0).toUpperCase()}. ${r.last_name}`;
      // Identifiant AFYA : pays, année, numéro d'ordre dans ce pays et cette année.
      const year = today().slice(0, 4);
      const { data: same } = await admin.from('participants').select('id, code_key').eq('country', r.country);
      const n = (same ?? []).filter((p) => p.id.includes(`/ ${year} /`)).reduce((m, p) => Math.max(m, Number(p.id.split('/').pop()) || 0), 0) + 1;
      const id = `AFYA / ${r.country} / ${year} / ${String(n).padStart(2, '0')}`;
      // Clé du numéro des patientes : le nom, avec un chiffre si un confrère du pays porte le même.
      const base = normName(r.last_name);
      let key = base;
      for (let i = 2; (same ?? []).some((p) => p.code_key === key); i++) key = base + i;
      const password = temporaryPassword();
      const { data: u, error } = await admin.auth.admin.createUser({ email: r.email, password, email_confirm: true, user_metadata: { display_name: name } });
      if (error || !u.user) throw new Refus(409, 'exists', error?.message.includes('already') ? 'Un compte existe déjà pour cette adresse.' : (error?.message ?? 'Création impossible.'));
      await admin.from('profiles').upsert({ id: u.user.id, email: r.email, display_name: name, sections: ['participant'], must_change_password: true });
      const { error: e2 } = await admin.from('participants').insert({
        id, name, country: r.country, site: r.hospital, user_id: u.user.id, first_name: r.first_name, last_name: r.last_name,
        email: r.email, phone: r.phone, specialty: r.specialty, workshop_id: r.workshop_id, code_key: key,
      });
      if (e2) throw new Error(e2.message);
      await admin.from('registrations').update({ status: 'accepted', handled_by: me.id, handled_at: new Date().toISOString() }).eq('id', r.id);
      await log(me.id, 'registration_accepted', `${r.email} : ${id}`);
      const { data: p } = await admin.from('profiles').select('*').eq('id', u.user.id).single();
      return { user: await view(p as Profile), temporaryPassword: password, participantId: id, codePrefix: `${r.country}_${key}` };
    }
    case 'participants': {
      const { data } = await admin.from('participants')
        .select('id, name, country, site, email, phone, specialty, workshop_id, ws, code_key, user_id').order('id');
      return data ?? [];
    }
    case 'set_ws': {
      const ws = body.ws == null ? null : (body.ws as Record<string, unknown>);
      if (ws && (!/^\d{4}-\d{2}$/.test(String(ws.date)) || !String(ws.place ?? '').trim())) {
        throw new Refus(400, 'validation', "Indiquez le mois et le lieu de l'atelier.");
      }
      const value = ws ? { date: String(ws.date), place: String(ws.place).trim().slice(0, 80) } : null;
      await admin.from('participants').update({ ws: value }).eq('id', String(body.id));
      await log(me.id, value ? 'ws_certified' : 'ws_removed', String(body.id));
      return { ok: true };
    }
    case 'save_workshop': {
      const id = String(body.id ?? '').trim().toLowerCase();
      if (!/^[a-z0-9-]{3,60}$/.test(id) || !/^\d{4}-\d{2}$/.test(String(body.date)) || !String(body.place ?? '').trim()) {
        throw new Refus(400, 'validation', 'Atelier : identifiant (lettres, chiffres, tirets), lieu et mois requis.');
      }
      await admin.from('workshops').upsert({ id, place: String(body.place).trim().slice(0, 80), date: String(body.date), active: body.active !== false });
      await log(me.id, 'workshop_saved', id);
      return { ok: true };
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
    if (body.action === 'register') return json(await register(body));
    const { profile, jwt } = await caller(req);
    if (body.action === 'save') return json(await savePatient(profile, String(body.code ?? ''), body.patient));
    if (body.action === 'feedback') return json(await feedback(profile, body));
    if (body.action === 'read_feedback') return json(await readFeedback(profile, body.code));
    if (body.action === 'group') return json(await group());
    requireAdmin(profile, jwt);
    return json(await adminAction(profile, body));
  } catch (e) {
    if (e instanceof Refus) return json({ error: e.code, message: e.message }, e.status);
    if (e instanceof SyntaxError) return json({ error: 'validation', message: 'Requête invalide.' }, 400);
    console.error((e as Error).message);
    return json({ error: 'server', message: 'Une erreur est survenue. Réessayez dans quelques instants.' }, 500);
  }
});
