// Comparaison avec le groupe et « réseau AFYA », calculés sur le serveur à partir de toutes les
// fiches : le participant ne reçoit que des moyennes et des comptes, jamais la fiche d'un autre.
// Mêmes calculs que le prototype (stats, f8Mean, networkCard).
import type { GroupView, Patient } from '../../../web/src/lib/contract.ts';

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
