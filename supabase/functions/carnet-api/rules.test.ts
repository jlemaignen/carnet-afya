// Règles de validation des fiches, telles que la fonction carnet-api les applique.
//   node --test supabase/functions/carnet-api/rules.test.ts
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { cleanPatient, cleanRegistration, codePrefix, isCodeOf, newFb, normName } from './rules.ts';

const ETH = 'AFYA / ETH / 2024 / 01';
const DRC = 'AFYA / DRC / 2024 / 02';
const GIRMA = { country: 'ETH', last: 'Girma' };
const C1 = 'ETH_GIRMA_001';

const fiche = (over: Record<string, unknown> = {}) => ({
  age: 27, parity: 3, hospital: 'Bahir Dar', date: '2026-10-02', type: 'SP', origin: 'obst',
  diffs: ['scar'], diffNote: '', comps: [], flag: false,
  visits: { pre: { status: 'seen', wexner: [3, 4, 2, 4, 3], fiq8: { f1: 2, f2: 1, fB: 'na', glob: 7 }, sex: { active: false, reason: 'inc', dysp: 'sup', fear: true } } },
  ...over,
});

describe('carnet : règles', () => {
  it('numéro des patientes : pays, nom sans accents, ordre sur 3 chiffres', () => {
    assert.equal(normName('Mwakyusa-Lé'), 'MWAKYUSALE');
    assert.equal(codePrefix(GIRMA), 'ETH_GIRMA');
    assert.ok(isCodeOf(C1, GIRMA));
    assert.ok(!isCodeOf('TAN_GIRMA_001', GIRMA));
    assert.ok(!isCodeOf('ETH_GIRMA_X01', GIRMA));
  });

  it('fiche nettoyée : champs inconnus écartés, participant imposé, échanges jamais repris du navigateur', () => {
    const p = cleanPatient({ ...fiche(), nom: 'Identité', pid: DRC, fb: [{ from: 'trainer', kind: 'val' }] }, C1, ETH);
    assert.equal(p.pid, ETH);
    assert.equal((p as unknown as Record<string, unknown>).nom, undefined);
    assert.deepEqual(p.visits.pre?.fiq8, { f1: 2, f2: 1, fB: 'na', glob: 7 });
    assert.equal(p.visits.pre?.continence, undefined, 'pas de continence avant l’intervention');
    assert.deepEqual(p.fb, []);
  });

  it('intervention et suivi tardif', () => {
    const p = cleanPatient(fiche({ op: { spType: 'ovl', assoc: ['pr', 'pr'], quality: 'med', suture: { mat: 'PDS', size: '2-0' }, abx: 'no', abxList: ['cro'], note: 'ok' },
      visits: { pre: fiche().visits.pre, late: { status: 'seen', date: '2027-05-01', wexner: [0, 0, 0, 0, 0], continence: 'yes' } } }), C1, ETH);
    assert.deepEqual(p.op?.assoc, ['pr']);
    assert.deepEqual(p.op?.abxList, [], 'pas d’antibiotique coché sans « oui »');
    assert.equal(p.visits.late?.date, '2027-05-01');
    assert.throws(() => cleanPatient(fiche({ visits: { pre: fiche().visits.pre, late: { status: 'seen' } } }), C1, ETH), 'suivi tardif sans date');
  });

  it('valeurs hors bornes refusées', () => {
    assert.throws(() => cleanPatient(fiche({ age: 7 }), C1, ETH));
    assert.throws(() => cleanPatient(fiche({ type: 'XX' }), C1, ETH));
    assert.throws(() => cleanPatient(fiche({ visits: { pre: { status: 'seen', wexner: [5, 0, 0, 0, 0] } } }), C1, ETH));
    assert.throws(() => cleanPatient(fiche({ visits: { pre: { status: 'seen', fiq8: { f1: 4 } } } }), C1, ETH), 'FIQ8 de 0 à 3');
    assert.throws(() => cleanPatient(fiche({ visits: {} }), C1, ETH), 'évaluation préopératoire obligatoire');
  });

  it('échanges : seul le formateur valide ou félicite, message non vide', () => {
    assert.equal(newFb('trainer', 'val', 'x', '2026-11-19').text, '');
    assert.throws(() => newFb('part', 'kudos', '', '2026-11-19'));
    assert.throws(() => newFb('part', 'msg', '   ', '2026-11-19'));
    assert.equal(newFb('part', 'msg', 'Bonjour', '2026-11-19').read, true);
  });

  it('inscription : champs obligatoires, charte acceptée, pays connu', () => {
    const ok = { first: 'Hana', last: 'Girma', email: 'H@Exemple.org', country: 'ETH', hospital: 'Bahir Dar', specialty: 'gyn', consent: true };
    assert.equal(cleanRegistration(ok).email, 'h@exemple.org');
    assert.throws(() => cleanRegistration({ ...ok, consent: false }));
    assert.throws(() => cleanRegistration({ ...ok, country: 'FRA' }));
    assert.throws(() => cleanRegistration({ ...ok, last: '123' }));
  });
});
