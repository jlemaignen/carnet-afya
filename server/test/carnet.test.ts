import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildApp } from '../src/app.ts';
import { LoginThrottle, hashPassword } from '../src/auth.ts';
import { cleanPatient, codePrefix, isCodeOf } from '../src/carnet.ts';
import type { Config } from '../src/config.ts';
import type { Section } from '../src/contract.ts';
import { Repository } from '../src/db.ts';

const PASSWORD = 'mot-de-passe-de-test-123';
const config: Config = {
  port: 0,
  publicBaseUrl: 'http://localhost:3030',
  sessionSecret: 'x'.repeat(40),
  dbPath: ':memory:',
  sessionMaxAgeSeconds: 3600,
  codeTtlSeconds: 300,
  resetTtlSeconds: 1800,
  mail: { transport: 'none', host: '', port: 587, secure: false, user: '', password: '', from: '' },
};

const ETH = { id: 'AFYA / ETH / 2024 / 01', name: 'Dr H. Girma', country: 'ETH', site: 'Bahir Dar' };
const DRC = { id: 'AFYA / DRC / 2024 / 02', name: 'Dr J. Mukendi', country: 'DRC', site: 'Bukavu' };

const fiche = (over: Record<string, unknown> = {}) => ({
  age: 27, parity: 3, hospital: 'Bahir Dar', date: '2026-10-02', type: 'SP', origin: 'obst',
  diffs: ['scar'], diffNote: '', comps: [], flag: false,
  visits: { pre: { status: 'seen', wexner: [3, 4, 2, 4, 3], fiql: { q1: 2, q2a: 1, q2b: null }, sex: { active: false, reason: 'inc', dysp: null, fear: true } } },
  ...over,
});

async function setup() {
  const repo = new Repository(':memory:');
  const hash = await hashPassword(PASSWORD);
  const ids: Record<string, number> = {};
  const add = (email: string, sections: Section[]) => (ids[email] = repo.createUser(email, email, hash, sections));
  add('eth@exemple.ch', ['participant']);
  add('drc@exemple.ch', ['participant']);
  add('libre@exemple.ch', ['participant']);
  add('formateur@exemple.ch', ['formateur']);
  add('rien@exemple.ch', []);
  repo.upsertParticipant(ETH);
  repo.upsertParticipant(DRC);
  repo.linkParticipant(ETH.id, ids['eth@exemple.ch']);
  repo.linkParticipant(DRC.id, ids['drc@exemple.ch']);
  const app = await buildApp({ config, repo, logger: false, throttle: new LoginThrottle(50) });
  const login = async (email: string) => {
    const res = await app.inject({ method: 'POST', url: '/api/login', payload: { email, password: PASSWORD } });
    const c = res.cookies.find((x) => x.name === 'carnet_afya_session')!;
    return `${c.name}=${c.value}`;
  };
  const get = (cookie: string) => app.inject({ method: 'GET', url: '/api/carnet', headers: { cookie } });
  const put = (cookie: string, code: string, payload: object) =>
    app.inject({ method: 'PUT', url: `/api/carnet/patients/${encodeURIComponent(code)}`, headers: { cookie }, payload });
  return { app, repo, login, get, put };
}

describe('carnet : règles', () => {
  it('code des patientes tiré de l’identifiant AFYA', () => {
    assert.equal(codePrefix(ETH.id), 'ETH-2024-01');
    assert.ok(isCodeOf('ETH-2024-01-P001', ETH.id));
    assert.ok(!isCodeOf('DRC-2024-02-P001', ETH.id));
    assert.ok(!isCodeOf('ETH-2024-01-PX01', ETH.id));
  });

  it('fiche nettoyée : champs inconnus écartés, participant imposé', () => {
    const p = cleanPatient({ ...fiche(), nom: 'Identité', pid: DRC.id }, 'ETH-2024-01-P001', ETH.id);
    assert.equal(p.pid, ETH.id);
    assert.equal((p as unknown as Record<string, unknown>).nom, undefined);
    assert.deepEqual(p.visits.pre?.fiql, { q1: 2, q2a: 1, q2b: null });
    assert.equal(p.visits.pre?.continence, undefined, 'pas de continence avant l’intervention');
  });

  it('valeurs hors bornes refusées', () => {
    assert.throws(() => cleanPatient(fiche({ age: 7 }), 'ETH-2024-01-P001', ETH.id));
    assert.throws(() => cleanPatient(fiche({ type: 'XX' }), 'ETH-2024-01-P001', ETH.id));
    assert.throws(() => cleanPatient(fiche({ visits: { pre: { status: 'seen', wexner: [5, 0, 0, 0, 0] } } }), 'ETH-2024-01-P001', ETH.id));
    assert.throws(() => cleanPatient(fiche({ visits: { pre: { status: 'seen', fiql: { q1: null } } } }), 'ETH-2024-01-P001', ETH.id), 'q1 sans « non applicable »');
    assert.throws(() => cleanPatient(fiche({ visits: {} }), 'ETH-2024-01-P001', ETH.id), 'évaluation préopératoire obligatoire');
  });
});

describe('carnet : accès', () => {
  it('un participant crée, modifie et ne voit que ses fiches', async () => {
    const ctx = await setup();
    const eth = await ctx.login('eth@exemple.ch');
    const drc = await ctx.login('drc@exemple.ch');
    assert.equal((await ctx.put(eth, 'ETH-2024-01-P001', fiche())).statusCode, 200);
    assert.equal((await ctx.put(drc, 'DRC-2024-02-P001', fiche({ hospital: 'Bukavu' }))).statusCode, 200);

    const vue = (await ctx.get(eth)).json();
    assert.equal(vue.role, 'part');
    assert.equal(vue.participant.id, ETH.id);
    assert.deepEqual(vue.patients.map((p: { code: string }) => p.code), ['ETH-2024-01-P001']);
    assert.deepEqual(vue.participants.map((p: { id: string }) => p.id), [ETH.id]);

    const suivi = fiche({ visits: { ...fiche().visits, d30: { status: 'lost' } } });
    assert.equal((await ctx.put(eth, 'ETH-2024-01-P001', suivi)).statusCode, 200);
    assert.deepEqual((await ctx.get(eth)).json().patients[0].visits.d30, { status: 'lost' });
  });

  it('un participant ne peut pas écrire dans le carnet d’un autre', async () => {
    const ctx = await setup();
    const eth = await ctx.login('eth@exemple.ch');
    const drc = await ctx.login('drc@exemple.ch');
    assert.equal((await ctx.put(drc, 'DRC-2024-02-P001', fiche())).statusCode, 200);
    assert.equal((await ctx.put(eth, 'DRC-2024-02-P001', fiche())).statusCode, 403);
    assert.equal(ctx.repo.listPatients()[0].hospital, 'Bahir Dar', 'fiche inchangée');
  });

  it('le formateur voit tout et ne modifie rien', async () => {
    const ctx = await setup();
    const eth = await ctx.login('eth@exemple.ch');
    const drc = await ctx.login('drc@exemple.ch');
    await ctx.put(eth, 'ETH-2024-01-P001', fiche());
    await ctx.put(drc, 'DRC-2024-02-P001', fiche());
    const f = await ctx.login('formateur@exemple.ch');
    const vue = (await ctx.get(f)).json();
    assert.equal(vue.role, 'trainer');
    assert.equal(vue.patients.length, 2);
    assert.equal(vue.participants.length, 2);
    assert.equal(vue.participants[0].userId, undefined, 'pas de lien vers les comptes');
    assert.equal((await ctx.put(f, 'ETH-2024-01-P002', fiche())).statusCode, 403);
  });

  it('compte participant non rattaché ou sans rôle : refusé', async () => {
    const ctx = await setup();
    assert.equal((await ctx.get(await ctx.login('libre@exemple.ch'))).json().error, 'no_participant');
    assert.equal((await ctx.get(await ctx.login('rien@exemple.ch'))).statusCode, 403);
    assert.equal((await ctx.app.inject({ method: 'GET', url: '/api/carnet' })).statusCode, 401);
  });

  it('fiche invalide : 400, rien n’est écrit', async () => {
    const ctx = await setup();
    const eth = await ctx.login('eth@exemple.ch');
    const res = await ctx.put(eth, 'ETH-2024-01-P001', fiche({ age: 'vingt' }));
    assert.equal(res.statusCode, 400);
    assert.equal(ctx.repo.listPatients().length, 0);
  });
});
