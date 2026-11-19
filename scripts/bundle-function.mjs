// Assemble la fonction carnet-api en un seul fichier, à coller dans l'éditeur de Supabase
// (Edge Functions, carnet-api, Code, Deploy). Rejoue-le après chaque modification de
// supabase/functions/carnet-api/ ou du contrat.
//   node scripts/bundle-function.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** Retire les imports entre fichiers locaux (tout est dans le même fichier une fois assemblé). */
const local = (src) => src.replace(/^import (type )?\{[^}]*\} from '\.[^']*';\n/gm, '');

// Du contrat, la fonction n'a besoin que des fiches et de la vue du groupe.
const contract = read('web/src/lib/contract.ts');
const start = contract.indexOf('export interface Participant');
const end = contract.indexOf('export interface CarnetView');
if (start < 0 || end < 0) throw new Error('contrat : repères introuvables');

const index = local(read('supabase/functions/carnet-api/index.ts'));
const out = [
  '// FICHIER GÉNÉRÉ par scripts/bundle-function.mjs : ne pas modifier à la main.',
  '// Supabase, Edge Functions, carnet-api : coller ce fichier entier, puis Deploy.',
  '',
  index.split('\n').filter((l) => l.startsWith('import ')).join('\n'),
  '',
  '// ── Contrat (fiches) ──',
  contract.slice(start, end),
  '// ── Règles de validation ──',
  local(read('supabase/functions/carnet-api/rules.ts')),
  '// ── Comparaison avec le groupe ──',
  local(read('supabase/functions/carnet-api/group.ts')),
  '// ── Fonction ──',
  index.split('\n').filter((l) => !l.startsWith('import ')).join('\n'),
].join('\n');

if (/from '\.\.?\//.test(out)) throw new Error('un import local est resté dans le fichier assemblé');
writeFileSync(new URL('../supabase/carnet-api.bundle.ts', import.meta.url), out);
console.log(`supabase/carnet-api.bundle.ts : ${out.split('\n').length} lignes`);
