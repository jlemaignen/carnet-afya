// Règles du carnet (prototype de Lionel, version 9) : validation d'une fiche patiente reçue du
// navigateur. Tout ce qui n'est pas prévu ici est écarté ; les textes libres sont bornés et ne
// doivent jamais contenir le nom de la patiente (rappel affiché dans les formulaires).
// Les échanges avec le formateur (fb) ne viennent jamais du navigateur : la fonction les gère.
import { TIMEPOINTS, type Complication, type Patient, type Visit } from '../../../web/src/lib/contract.ts';

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
