// Réveil quotidien du projet Supabase gratuit (mis en veille après 7 jours sans activité).
// Cloudflare, Workers, « Create Worker » : coller ce fichier, Deploy, puis Settings, Triggers,
// « Cron Triggers » : 0 6 * * * (chaque jour à 6 h UTC, 7 h ou 8 h à Genève).
// N'utilise que la clé publique : la fonction ping() ne lit rien d'autre que le chiffre 1.
const SUPABASE_URL = 'https://bvnnpqubzkxiizhinyuy.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_0QhQ-GPBfBi-QgJPIKPVjA_-AQ-ztWk';

async function ping() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ping`, {
    method: 'POST',
    headers: { apikey: PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: '{}',
  });
  return `${res.status} ${await res.text()}`;
}

export default {
  // Déclenché par le cron.
  async scheduled(_event, _env, ctx) {
    ctx.waitUntil(ping().then((r) => console.log('Supabase réveillé :', r)));
  },
  // Ouvrir l'adresse du Worker dans le navigateur lance un réveil à la main, pour vérifier.
  async fetch() {
    return new Response(`Supabase : ${await ping()}`, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  },
};
