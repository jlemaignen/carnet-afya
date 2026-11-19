// FICHIER GÉNÉRÉ par scripts/bundle-function.mjs : ne pas modifier à la main.
// Supabase, Edge Functions, carnet-api : coller ce fichier entier, puis Deploy.

import { createClient } from 'npm:@supabase/supabase-js@2';

// ── Contrat (fiches) ──
export interface Participant {
  id: string;
  name: string;
  country: string;
  site: string;
  /** Nom de famille : sert au numéro des patientes (ETH_GIRMA_001). */
  last: string;
  first?: string;
  specialty?: string | null;
  /** Certification de l'atelier, saisie par l'équipe pédagogique. */
  ws: { date: string; place: string } | null;
  registered?: boolean;
}

export const TIMEPOINTS = ['pre', 'd30', 'm6', 'm12', 'late'] as const;
export type Timepoint = (typeof TIMEPOINTS)[number];

export interface Complication {
  type: string;
  date: string;
  grade: string;
}

export interface Visit {
  status: 'seen' | 'lost';
  /** Suivi tardif : date de la visite. */
  date?: string;
  wexner?: (number | null)[];
  fiq8?: Record<string, number | 'na'>;
  sex?: { active: boolean | null; reason: string | null; dysp: string | null; fear: boolean | null };
  continence?: string | null;
}

export interface Operation {
  spType: string | null;
  assoc: string[];
  quality: string | null;
  contam: string | null;
  suture: { mat: string | null; size: string | null };
  abx: string | null;
  abxList: string[];
  note: string;
}

export interface Feedback {
  from: 'trainer' | 'part';
  kind: 'msg' | 'val' | 'kudos';
  text: string;
  date: string;
  read: boolean;
}

export interface Patient {
  code: string;
  pid: string;
  age: number;
  parity: number;
  hospital: string;
  consultDate: string | null;
  date: string;
  type: 'SP' | 'RVF' | 'BOTH';
  origin: string;
  causeNote: string;
  durMonths: number | null;
  prior: string | null;
  priorOk: string | null;
  uro: string | null;
  uroNote: string;
  cloaca: string | null;
  pbody: string | null;
  rvfEx: string | null;
  exam: string;
  plan: string;
  op: Operation | null;
  diffs: string[];
  diffNote: string;
  comps: Complication[];
  flag: boolean;
  visits: Partial<Record<Timepoint, Visit>>;
  fb: Feedback[];
}

export interface Workshop {
  id: string;
  place: string;
  date: string;
  active: boolean;
}

/** Comparaison avec le groupe et réseau AFYA : calculés sur le serveur, jamais de fiche d'un autre. */
export interface GroupView {
  /** null tant que le groupe compte moins de 5 participants avec des patientes. */
  cmp: { wxPre: number | null; wxLast: number | null; f8Pre: number | null; f8M12: number | null; m12Pct: number | null; compPct: number } | null;
  network: {
    total: number;
    countries: Record<string, number>;
    cotm: { type: string; country: string; wxPre: number | null; wxLast: number | null; f8Pre: number | null; f8Last: number | null; spType: string | null; name: string } | null;
  };
}


// ── Règles de validation ──
// Règles du carnet (prototype de Lionel, version 9) : validation d'une fiche patiente reçue du
// navigateur. Tout ce qui n'est pas prévu ici est écarté ; les textes libres sont bornés et ne
// doivent jamais contenir le nom de la patiente (rappel affiché dans les formulaires).
// Les échanges avec le formateur (fb) ne viennent jamais du navigateur : la fonction les gère.

export const TYPES = ['SP', 'RVF', 'BOTH'] as const;
export const ORIGINS = ['obst', 'trauma', 'sv', 'cong', 'iatro', 'other'] as const;
export const DIFFS = ['expo', 'edges', 'scar', 'bleed', 'time', 'mat', 'help', 'other'] as const;
export const COMPS = ['inf', 'dehis', 'bleed', 'rvf', 'fail', 'other'] as const;
export const GRADES = ['I', 'II', 'IIIa', 'IIIb', 'IV', 'V'] as const;
export const SEX_REASONS = ['inc', 'pain', 'part', 'choice', 'other'] as const;
export const DYSP = ['no', 'sup', 'deep', 'both'] as const;
export const CONTINENCE = ['yes', 'better', 'no'] as const;
export const PRIOR = ['no', 'imm', 'sec', 'both'] as const;
export const URO = ['none', 'vvf', 'other'] as const;
export const YES_NO = ['yes', 'no'] as const;
export const SP_TYPES = ['e2e', 'ovl'] as const;
export const ASSOC = ['pr', 'lev', 'vag', 'other'] as const;
export const QUAL = ['exc', 'med', 'poor'] as const;
export const CONTAM = ['none', 'light', 'mod', 'high'] as const;
export const SUT_MAT = ['Vicryl', 'PDS', 'Monocryl', 'Prolene', 'other'] as const;
export const SUT_SIZE = ['0', '2-0', '3-0', '4-0'] as const;
export const ABX = ['cro', 'mtz', 'cxm', 'cfz', 'amx'] as const;
export const SPECIALTIES = ['gyn', 'surg', 'col', 'uro', 'other'] as const;
export const COUNTRIES = ['ETH', 'TAN', 'BUR', 'DRC', 'KEN', 'UGA', 'RWA', 'BEN'] as const;

/** AFYA FIQ8 : f1 à f8, A et B de 0 (jamais) à 3 (toujours) ou « na » ; question globale de 0 à 10. */
const F8_ITEMS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'fA', 'fB'];

export class InvalidPatient extends Error {}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** « Mwakyusa » donne « MWAKYUSA » : sans accents ni signes, en majuscules. */
export function normName(x: string): string {
  return String(x || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z]/g, '').toUpperCase();
}

/** Préfixe des codes des patientes d'un participant : pays et nom, ex. « ETH_GIRMA ». */
export function codePrefix(p: { country: string; last: string }): string {
  return `${p.country}_${normName(p.last)}`;
}

export function isCodeOf(code: string, p: { country: string; last: string }): boolean {
  const prefix = codePrefix(p) + '_';
  return code.startsWith(prefix) && /^\d{3,4}$/.test(code.slice(prefix.length));
}

function oneOf<T extends string>(value: unknown, list: readonly T[], field: string): T {
  if (typeof value !== 'string' || !(list as readonly string[]).includes(value)) throw new InvalidPatient(`Valeur invalide : ${field}.`);
  return value as T;
}

function optOneOf<T extends string>(value: unknown, list: readonly T[], field: string): T | null {
  return value == null || value === '' ? null : oneOf(value, list, field);
}

function int(value: unknown, min: number, max: number, field: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) throw new InvalidPatient(`Valeur invalide : ${field}.`);
  return value;
}

function date(value: unknown, field: string): string {
  if (typeof value !== 'string' || !ISO_DATE.test(value) || Number.isNaN(Date.parse(value + 'T00:00:00Z'))) throw new InvalidPatient(`Date invalide : ${field}.`);
  return value;
}

function optDate(value: unknown, field: string): string | null {
  return value == null || value === '' ? null : date(value, field);
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function subset<T extends string>(value: unknown, list: readonly T[], field: string): T[] {
  return Array.isArray(value) ? [...new Set(value.map((x) => oneOf(x, list, field)))] : [];
}

function cleanComp(c: unknown): Complication {
  const o = (c ?? {}) as Record<string, unknown>;
  return { type: oneOf(o.type, COMPS, 'complication'), date: date(o.date, 'complication'), grade: oneOf(o.grade, GRADES, 'Clavien-Dindo') };
}

function cleanVisit(v: unknown, tp: string): Visit {
  const o = (v ?? {}) as Record<string, unknown>;
  if (o.status === 'lost') return tp === 'late' && o.date ? { status: 'lost', date: date(o.date, 'suivi tardif') } : { status: 'lost' };
  const wx = Array.isArray(o.wexner) ? o.wexner : [];
  const wexner = [0, 1, 2, 3, 4].map((i) => (wx[i] === null || wx[i] === undefined ? null : int(wx[i], 0, 4, 'Wexner')));
  const fiq8: Record<string, number | 'na'> = {};
  const fq = (o.fiq8 ?? {}) as Record<string, unknown>;
  for (const id of F8_ITEMS) {
    if (fq[id] == null) continue;
    fiq8[id] = fq[id] === 'na' ? 'na' : int(fq[id], 0, 3, 'FIQ8');
  }
  if (fq.glob != null) fiq8.glob = int(fq.glob, 0, 10, 'FIQ8 question globale');
  const sx = (o.sex ?? {}) as Record<string, unknown>;
  const active = bool(sx.active);
  const sex = {
    active,
    reason: active === false ? optOneOf(sx.reason, SEX_REASONS, 'santé sexuelle') : null,
    dysp: optOneOf(sx.dysp, DYSP, 'dyspareunie'),
    fear: bool(sx.fear),
  };
  const out: Visit = { status: 'seen', wexner, fiq8, sex };
  if (tp !== 'pre') out.continence = optOneOf(o.continence, CONTINENCE, 'continence');
  if (tp === 'late') out.date = date(o.date, 'suivi tardif');
  return out;
}

function cleanOp(input: unknown, type: string) {
  if (input == null) return null;
  const o = input as Record<string, unknown>;
  const su = (o.suture ?? {}) as Record<string, unknown>;
  const abx = optOneOf(o.abx, YES_NO, 'antibiotique');
  return {
    spType: type === 'RVF' ? null : optOneOf(o.spType, SP_TYPES, 'type de sphinctéroplastie'),
    assoc: subset(o.assoc, ASSOC, 'gestes associés'),
    quality: optOneOf(o.quality, QUAL, 'qualité du sphincter'),
    contam: optOneOf(o.contam, CONTAM, 'contamination'),
    suture: { mat: optOneOf(su.mat, SUT_MAT, 'fil'), size: optOneOf(su.size, SUT_SIZE, 'calibre du fil') },
    abx,
    abxList: abx === 'yes' ? subset(o.abxList, ABX, 'antibiotiques') : [],
    note: text(o.note, 4000),
  };
}

/** Fiche propre et complète, ou InvalidPatient. Le participant est imposé par le serveur. */
export function cleanPatient(input: unknown, code: string, participantId: string): Patient {
  const o = (input ?? {}) as Record<string, unknown>;
  const visitsIn = (o.visits ?? {}) as Record<string, unknown>;
  const visits: Patient['visits'] = {};
  for (const tp of TIMEPOINTS) {
    if (visitsIn[tp] != null) visits[tp] = cleanVisit(visitsIn[tp], tp);
  }
  if (!visits.pre) throw new InvalidPatient("L'évaluation préopératoire manque.");
  const type = oneOf(o.type, TYPES, "type d'intervention");
  const prior = optOneOf(o.prior, PRIOR, 'chirurgie antérieure');
  const uro = optOneOf(o.uro, URO, 'lésion urinaire');
  return {
    code,
    pid: participantId,
    age: int(o.age, 10, 90, 'âge'),
    parity: int(o.parity ?? 0, 0, 20, 'parité'),
    hospital: text(o.hospital, 120),
    consultDate: optDate(o.consultDate, 'date de consultation'),
    date: date(o.date, "date de l'intervention"),
    type,
    origin: oneOf(o.origin ?? 'other', ORIGINS, 'origine'),
    causeNote: text(o.causeNote, 300),
    durMonths: o.durMonths == null || o.durMonths === '' ? null : int(o.durMonths, 0, 840, 'durée des symptômes'),
    prior,
    priorOk: prior === 'sec' || prior === 'both' ? optOneOf(o.priorOk, YES_NO, 'succès de la reconstruction') : null,
    uro,
    uroNote: uro && uro !== 'none' ? text(o.uroNote, 200) : '',
    cloaca: optOneOf(o.cloaca, YES_NO, 'cloaque'),
    pbody: optOneOf(o.pbody, YES_NO, 'corps périnéal'),
    rvfEx: optOneOf(o.rvfEx, YES_NO, 'FRV à l’examen'),
    exam: text(o.exam, 4000),
    plan: text(o.plan, 4000),
    op: cleanOp(o.op, type),
    diffs: subset(o.diffs, DIFFS, 'difficulté'),
    diffNote: text(o.diffNote, 1000),
    comps: Array.isArray(o.comps) ? o.comps.slice(0, 20).map(cleanComp) : [],
    flag: o.flag === true,
    visits,
    fb: [],
  };
}

// ── Échanges avec le formateur ───────────────────────────────────────────────

export type FbKind = 'msg' | 'val' | 'kudos';

export interface Fb {
  from: 'trainer' | 'part';
  kind: FbKind;
  text: string;
  date: string;
  read: boolean;
}

/** Un message ou une marque (validation, félicitations), daté du jour à Genève. */
export function newFb(from: 'trainer' | 'part', kind: unknown, txt: unknown, today: string): Fb {
  if (from === 'part' && kind !== 'msg') throw new InvalidPatient('Seul le formateur valide ou félicite un cas.');
  const k = oneOf(kind, ['msg', 'val', 'kudos'] as const, 'échange');
  const body = k === 'msg' ? text(txt, 2000).trim() : '';
  if (k === 'msg' && !body) throw new InvalidPatient('Message vide.');
  return { from, kind: k, text: body, date: today, read: from === 'part' };
}

// ── Inscription ─────────────────────────────────────────────────────────────

export interface Registration {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country: string;
  hospital: string;
  specialty: string;
  workshop_id: string | null;
}

export function cleanRegistration(input: unknown): Registration {
  const o = (input ?? {}) as Record<string, unknown>;
  const req = (v: unknown, max: number, field: string) => {
    const s = text(v, max).trim();
    if (!s) throw new InvalidPatient(`Champ manquant : ${field}.`);
    return s;
  };
  const email = req(o.email, 254, 'e-mail').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InvalidPatient('Adresse e-mail invalide.');
  const last = req(o.last, 80, 'nom');
  if (!normName(last)) throw new InvalidPatient('Le nom doit contenir des lettres.');
  if (o.consent !== true) throw new InvalidPatient('La charte de protection des données doit être acceptée.');
  return {
    first_name: req(o.first, 80, 'prénom'),
    last_name: last,
    email,
    phone: text(o.phone, 40).trim(),
    country: oneOf(o.country, COUNTRIES, 'pays'),
    hospital: req(o.hospital, 120, 'hôpital'),
    specialty: oneOf(o.specialty ?? 'other', SPECIALTIES, 'spécialité'),
    workshop_id: o.workshop == null || o.workshop === '' ? null : text(o.workshop, 60),
  };
}

// ── Comparaison avec le groupe ──
// Comparaison avec le groupe et « réseau AFYA », calculés sur le serveur à partir de toutes les
// fiches : le participant ne reçoit que des moyennes et des comptes, jamais la fiche d'un autre.
// Mêmes calculs que le prototype (stats, f8Mean, networkCard).

/** En dessous de ce nombre de participants avec des patientes, pas de comparaison (anonymat). */
export const MIN_PARTICIPANTS = 5;

const F8_DOM: Record<string, string[]> = { life: ['f1', 'f2', 'fA', 'fB'], cope: ['f3', 'f4', 'f5'], self: ['f6'], emb: ['f7', 'f8'] };
const F8_MIN: Record<string, number> = { life: 2, cope: 2, self: 1, emb: 1 };

export function wxTotal(w: unknown): number | null {
  return Array.isArray(w) && w.length === 5 && w.every((v) => typeof v === 'number') ? (w as number[]).reduce((a, b) => a + b, 0) : null;
}

/** AFYA FIQ8 : total équivalent FIQL (4 à 16), seulement si les 4 domaines sont calculés. */
export function f8Total(a: Record<string, unknown> | undefined): number | null {
  if (!a) return null;
  let total = 0;
  for (const k of Object.keys(F8_DOM)) {
    const v = F8_DOM[k].map((id) => a[id]).filter((x): x is number => typeof x === 'number');
    if (v.length < F8_MIN[k]) return null;
    total += 4 - v.reduce((x, y) => x + y, 0) / v.length;
  }
  return total;
}

const mean = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : null);
const addDays = (s: string, n: number) => {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d;
};

function lastVisit(p: Patient) {
  for (const tp of ['late', 'm12', 'm6', 'd30'] as const) {
    const v = p.visits[tp];
    if (v && v.status !== 'lost') return v;
  }
  return null;
}

function f8Mean(list: Patient[], tp: 'pre' | 'm12'): number | null {
  return mean(list.map((p) => (p.visits[tp] && p.visits[tp]!.status !== 'lost' ? f8Total(p.visits[tp]!.fiq8 as Record<string, unknown>) : null)).filter((x): x is number => x != null));
}

export function groupView(patients: Patient[], parts: { id: string; name: string; country: string }[], today: Date): GroupView {
  const byId = new Map(parts.map((p) => [p.id, p]));
  const contributors = new Set(patients.map((p) => p.pid)).size;
  let cmp: GroupView['cmp'] = null;
  if (contributors >= MIN_PARTICIPANTS) {
    const eligible12 = patients.filter((p) => addDays(p.date, 365 + 30) <= today);
    cmp = {
      wxPre: mean(patients.map((p) => wxTotal(p.visits.pre?.wexner)).filter((v): v is number => v != null)),
      wxLast: mean(patients.map((p) => wxTotal(lastVisit(p)?.wexner)).filter((v): v is number => v != null)),
      f8Pre: f8Mean(patients, 'pre'),
      f8M12: f8Mean(patients, 'm12'),
      m12Pct: eligible12.length ? eligible12.filter((p) => p.visits.m12?.status === 'seen').length / eligible12.length : null,
      compPct: patients.length ? patients.filter((p) => p.comps.length).length / patients.length : 0,
    };
  }
  const countries: Record<string, number> = {};
  for (const p of patients) {
    const c = byId.get(p.pid)?.country ?? '?';
    countries[c] = (countries[c] ?? 0) + 1;
  }
  // Cas du mois : le plus récent que le formateur a félicité.
  const cand = patients.filter((p) => (p.fb ?? []).some((m) => m.kind === 'kudos')).sort((a, b) => b.date.localeCompare(a.date))[0];
  let cotm: GroupView['network']['cotm'] = null;
  if (cand) {
    const lv = lastVisit(cand);
    const part = byId.get(cand.pid);
    cotm = {
      type: cand.type,
      country: part?.country ?? '',
      wxPre: wxTotal(cand.visits.pre?.wexner),
      wxLast: wxTotal(lv?.wexner),
      f8Pre: f8Total(cand.visits.pre?.fiq8 as Record<string, unknown>),
      f8Last: f8Total(lv?.fiq8 as Record<string, unknown>),
      spType: cand.op?.spType ?? null,
      name: part?.name ?? '',
    };
  }
  return { cmp, network: { total: patients.length, countries, cotm } };
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
  if (error || !data.user) {
    if (jwt) console.error('session refusée : ' + (error?.message ?? 'utilisateur introuvable'));
    throw new Refus(401, 'no_session', 'Veuillez vous connecter.');
  }
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
