// FICHIER GÉNÉRÉ par scripts/bundle-function.mjs : ne pas modifier à la main.
// Supabase, Edge Functions, carnet-api : coller ce fichier entier, puis Deploy.

import { createClient } from 'npm:@supabase/supabase-js@2';

// ── Contrat (fiches) ──
export interface Participant {
  id: string;
  name: string;
  country: string;
  site: string;
}

export const TIMEPOINTS = ['pre', 'd30', 'm6', 'm12'] as const;
export type Timepoint = (typeof TIMEPOINTS)[number];

export interface Complication {
  type: string;
  date: string;
  grade: string;
}

/** Une évaluation (préopératoire ou suivi). « lost » : perdue de vue, sans autre donnée. */
export interface Visit {
  status: 'seen' | 'lost';
  wexner?: (number | null)[];
  fiql?: Record<string, number | null>;
  sex?: { active: boolean | null; reason: string | null; dysp: boolean | null; fear: boolean | null };
  continence?: string | null;
}

/** Une patiente, connue seulement par son code : aucune identité n'est saisie. */
export interface Patient {
  code: string;
  pid: string;
  age: number;
  parity: number;
  hospital: string;
  date: string;
  type: 'SP' | 'RVF' | 'BOTH';
  origin: string;
  diffs: string[];
  diffNote: string;
  comps: Complication[];
  flag: boolean;
  visits: Partial<Record<Timepoint, Visit>>;
}

/** Tout ce que le carnet charge à l'ouverture, déjà filtré selon le rôle. */

// ── Règles de validation ──
// Règles du carnet : validation d'une fiche patiente reçue du navigateur. Tout ce qui n'est pas
// prévu ici est écarté, pour qu'aucun champ libre ne serve à saisir une identité.

export const TYPES = ['SP', 'RVF', 'BOTH'] as const;
export const ORIGINS = ['obst', 'trauma', 'sv', 'cong', 'other'] as const;
export const DIFFS = ['expo', 'edges', 'scar', 'bleed', 'time', 'mat', 'help', 'other'] as const;
export const COMPS = ['inf', 'dehis', 'bleed', 'rvf', 'fail', 'other'] as const;
export const GRADES = ['I', 'II', 'IIIa', 'IIIb', 'IV', 'V'] as const;
export const SEX_REASONS = ['inc', 'pain', 'part', 'choice', 'other'] as const;
export const CONTINENCE = ['yes', 'better', 'no'] as const;

/** Les 29 questions du FIQL et leurs valeurs possibles (null = non applicable). */
const FIQL_RANGES: Record<string, number> = {
  q1: 5, q4: 6,
  ...Object.fromEntries('abcdefghijklm'.split('').map((l) => [`q2${l}`, 4])),
  ...Object.fromEntries('abcdefghijklmn'.split('').map((l) => [`q3${l}`, 4])),
};
const NULLABLE_FIQL = (id: string) => id.startsWith('q2') || id.startsWith('q3');

export class InvalidPatient extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** « AFYA / ETH / 2024 / 01 » donne « ETH-2024-01 », préfixe des codes de ses patientes. */
export function codePrefix(participantId: string): string {
  return participantId.split('/').map((s) => s.trim()).slice(1).join('-');
}

export function isCodeOf(code: string, participantId: string): boolean {
  const prefix = codePrefix(participantId);
  return code.startsWith(prefix + '-P') && /^\d{3,4}$/.test(code.slice(prefix.length + 2));
}

function oneOf<T extends string>(value: unknown, list: readonly T[], field: string): T {
  if (typeof value !== 'string' || !(list as readonly string[]).includes(value)) throw new InvalidPatient(`Valeur invalide : ${field}.`);
  return value as T;
}

function int(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new InvalidPatient(`Valeur invalide : ${field}.`);
  return value;
}

function date(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z'))) throw new InvalidPatient(`Date invalide : ${field}.`);
  return value;
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function cleanComp(c: unknown): Complication {
  const o = (c ?? {}) as Record<string, unknown>;
  return { type: oneOf(o.type, COMPS, 'complication'), date: date(o.date, 'complication'), grade: oneOf(o.grade, GRADES, 'Clavien-Dindo') };
}

function cleanVisit(v: unknown, withOutcome: boolean): Visit {
  const o = (v ?? {}) as Record<string, unknown>;
  if (o.status === 'lost') return { status: 'lost' };
  const wx = Array.isArray(o.wexner) ? o.wexner : [];
  const wexner = [0, 1, 2, 3, 4].map((i) => (wx[i] === null || wx[i] === undefined ? null : int(wx[i], 0, 4, 'Wexner')));
  const fiql: Record<string, number | null> = {};
  const fq = (o.fiql ?? {}) as Record<string, unknown>;
  for (const [id, max] of Object.entries(FIQL_RANGES)) {
    if (!(id in fq)) continue;
    if (fq[id] === null && NULLABLE_FIQL(id)) fiql[id] = null;
    else fiql[id] = int(fq[id], 1, max, 'FIQL');
  }
  const sx = (o.sex ?? {}) as Record<string, unknown>;
  const active = bool(sx.active);
  const sex = {
    active,
    reason: active === false && sx.reason != null ? oneOf(sx.reason, SEX_REASONS, 'santé sexuelle') : null,
    dysp: bool(sx.dysp),
    fear: bool(sx.fear),
  };
  const out: Visit = { status: 'seen', wexner, fiql, sex };
  if (withOutcome) out.continence = o.continence == null ? null : oneOf(o.continence, CONTINENCE, 'continence');
  return out;
}

/** Fiche propre et complète, ou InvalidPatient. Le participant est imposé par le serveur. */
export function cleanPatient(input: unknown, code: string, participantId: string): Patient {
  const o = (input ?? {}) as Record<string, unknown>;
  const visitsIn = (o.visits ?? {}) as Record<string, unknown>;
  const visits: Patient['visits'] = {};
  for (const tp of TIMEPOINTS) {
    if (visitsIn[tp] != null) visits[tp] = cleanVisit(visitsIn[tp], tp !== 'pre');
  }
  if (!visits.pre) throw new InvalidPatient("L'évaluation préopératoire manque.");
  const diffs = Array.isArray(o.diffs) ? [...new Set(o.diffs.map((d) => oneOf(d, DIFFS, 'difficulté')))] : [];
  const comps = Array.isArray(o.comps) ? o.comps.slice(0, 20).map(cleanComp) : [];
  return {
    code,
    pid: participantId,
    age: int(o.age, 10, 90, 'âge'),
    parity: int(o.parity ?? 0, 0, 20, 'parité'),
    hospital: text(o.hospital, 120),
    date: date(o.date, "date de l'intervention"),
    type: oneOf(o.type, TYPES, "type d'intervention"),
    origin: oneOf(o.origin ?? 'other', ORIGINS, 'origine'),
    diffs,
    diffNote: text(o.diffNote, 1000),
    comps,
    flag: o.flag === true,
    visits,
  };
}

// ── Fonction ──
// Fonction Supabase « carnet-api » : seules écritures du carnet et gestion des comptes.
// Le navigateur lit directement la base (règles d'accès RLS) ; tout ce qui écrit passe ici, avec la
// clé de service, après vérification du compte appelant et de chaque champ.
//
// Déploiement : Supabase, Edge Functions, « Deploy a new function », « Via Editor », nom carnet-api,
// coller le fichier supabase/carnet-api.bundle.ts (généré par scripts/bundle-function.mjs).

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
