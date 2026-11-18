import { SECTIONS, type Section } from './contract.ts';

/** « all » ou une liste séparée par des virgules, rendue dans l'ordre canonique, sans doublon. */
export function parseSections(value: string): Section[] {
  if (value.trim().toLowerCase() === 'all' || value.trim().toLowerCase() === 'tout') return [...SECTIONS];
  const wanted = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  const unknown = wanted.filter((s) => !(SECTIONS as readonly string[]).includes(s));
  if (unknown.length) throw new Error(`Rubrique inconnue : ${unknown.join(', ')}. Possibles : ${SECTIONS.join(', ')}, all.`);
  return SECTIONS.filter((s) => wanted.includes(s));
}
