// Règles du carnet : validation d'une fiche patiente reçue du navigateur. Tout ce qui n'est pas
// prévu ici est écarté, pour qu'aucun champ libre ne serve à saisir une identité.
import { TIMEPOINTS, type Complication, type Patient, type Visit } from './contract.ts';

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
