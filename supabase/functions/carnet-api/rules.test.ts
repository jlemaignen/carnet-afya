// Règles de validation des fiches, telles que la fonction carnet-api les applique.
//   node --test supabase/functions/carnet-api/rules.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanPatient, codePrefix, isCodeOf } from './rules.ts';

const ETH = 'AFYA / ETH / 2024 / 01';
const DRC = 'AFYA / DRC / 2024 / 02';

const fiche = (over: Record<string, unknown> = {}) => ({
  age: 27, parity: 3, hospital: 'Bahir Dar', date: '2026-10-02', type: 'SP', origin: 'obst',
  diffs: ['scar'], diffNote: '', comps: [], flag: false,
  visits: { pre: { status: 'seen', wexner: [3, 4, 2, 4, 3], fiql: { q1: 2, q2a: 1, q2b: null }, sex: { active: false, reason: 'inc', dysp: null, fear: true } } },
  ...over,
});

describe('carnet : règles', () => {
  it('code des patientes tiré de l’identifiant AFYA', () => {
    assert.equal(codePrefix(ETH), 'ETH-2024-01');
    assert.ok(isCodeOf('ETH-2024-01-P001', ETH));
    assert.ok(!isCodeOf('DRC-2024-02-P001', ETH));
    assert.ok(!isCodeOf('ETH-2024-01-PX01', ETH));
  });

  it('fiche nettoyée : champs inconnus écartés, participant imposé', () => {
    const p = cleanPatient({ ...fiche(), nom: 'Identité', pid: DRC }, 'ETH-2024-01-P001', ETH);
    assert.equal(p.pid, ETH);
    assert.equal((p as unknown as Record<string, unknown>).nom, undefined);
    assert.deepEqual(p.visits.pre?.fiql, { q1: 2, q2a: 1, q2b: null });
    assert.equal(p.visits.pre?.continence, undefined, 'pas de continence avant l’intervention');
  });

  it('valeurs hors bornes refusées', () => {
    assert.throws(() => cleanPatient(fiche({ age: 7 }), 'ETH-2024-01-P001', ETH));
    assert.throws(() => cleanPatient(fiche({ type: 'XX' }), 'ETH-2024-01-P001', ETH));
    assert.throws(() => cleanPatient(fiche({ visits: { pre: { status: 'seen', wexner: [5, 0, 0, 0, 0] } } }), 'ETH-2024-01-P001', ETH));
    assert.throws(() => cleanPatient(fiche({ visits: { pre: { status: 'seen', fiql: { q1: null } } } }), 'ETH-2024-01-P001', ETH), 'q1 sans « non applicable »');
    assert.throws(() => cleanPatient(fiche({ visits: {} }), 'ETH-2024-01-P001', ETH), 'évaluation préopératoire obligatoire');
  });
});
