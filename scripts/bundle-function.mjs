// Assemble la fonction carnet-api en un seul fichier, à coller dans l'éditeur de Supabase
// (Edge Functions, Deploy a new function, Via Editor). Rejoue-le après chaque modification de
// supabase/functions/carnet-api/ ou du contrat.
//   node scripts/bundle-function.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// Du contrat, la fonction n'a besoin que des fiches (types et moments d'évaluation).
const contract = read('web/src/lib/contract.ts');
const start = contract.indexOf('export interface Participant');
const end = contract.indexOf('export interface CarnetView');
if (start < 0 || end < 0) throw new Error('contrat : repères introuvables');
const fiches = contract.slice(start, end);

const rules = read('supabase/functions/carnet-api/rules.ts').replace(/^import .*\n/m, '');
const index = read('supabase/functions/carnet-api/index.ts').replace(/^import \{ InvalidPatient.*\n/m, '');

const out = [
  '// FICHIER GÉNÉRÉ par scripts/bundle-function.mjs : ne pas modifier à la main.',
  '// Supabase, Edge Functions, carnet-api : coller ce fichier entier, puis Deploy.',
  '',
  index.split('\n').filter((l) => l.startsWith('import ')).join('\n'),
  '',
  '// ── Contrat (fiches) ──',
  fiches,
  '// ── Règles de validation ──',
  rules,
  '// ── Fonction ──',
  index.split('\n').filter((l) => !l.startsWith('import ')).join('\n'),
].join('\n');

writeFileSync(new URL('../supabase/carnet-api.bundle.ts', import.meta.url), out);
console.log(`supabase/carnet-api.bundle.ts : ${out.split('\n').length} lignes`);
