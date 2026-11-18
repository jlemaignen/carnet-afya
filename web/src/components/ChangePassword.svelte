<script lang="ts">
  import { api, ApiError, type MeView } from '../lib/api.ts';

  const MIN = 12;

  // impose : premier accès ou mot de passe réinitialisé, rien d'autre n'est accessible avant le changement.
  let { impose = false, onMe }: { impose?: boolean; onMe: (me: MeView) => void } = $props();

  let actuel = $state('');
  let nouveau = $state('');
  let confirmation = $state('');
  let error = $state('');
  let ok = $state(false);
  let busy = $state(false);

  const pret = $derived(actuel.length > 0 && nouveau.length >= MIN && nouveau === confirmation);

  async function valider(e: SubmitEvent) {
    e.preventDefault();
    if (busy || !pret) return;
    busy = true;
    error = '';
    ok = false;
    try {
      const me = await api.changePassword(actuel, nouveau);
      ok = true;
      onMe(me);
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Une erreur est survenue.';
    } finally {
      actuel = '';
      nouveau = '';
      confirmation = '';
      busy = false;
    }
  }
</script>

<form class="mdp" onsubmit={valider}>
  {#if impose}
    <p class="aide">Pour votre première connexion, ou après une réinitialisation, choisissez votre propre mot de passe. Il doit compter au moins {MIN} caractères.</p>
  {:else}
    <p class="aide">Au moins {MIN} caractères. Les autres sessions ouvertes sur ce compte seront fermées.</p>
  {/if}
  <label>
    <span class="lab">{impose ? 'Mot de passe reçu' : 'Mot de passe actuel'}</span>
    <input id="mdp-actuel" type="password" bind:value={actuel} autocomplete="current-password" required />
  </label>
  <label>
    <span class="lab">Nouveau mot de passe</span>
    <input id="mdp-nouveau" type="password" bind:value={nouveau} autocomplete="new-password" minlength={MIN} required />
  </label>
  <label>
    <span class="lab">Confirmer le nouveau mot de passe</span>
    <input id="mdp-confirmation" type="password" bind:value={confirmation} autocomplete="new-password" minlength={MIN} required />
  </label>
  {#if confirmation && nouveau !== confirmation}<p class="err" role="alert">Les deux saisies diffèrent.</p>{/if}
  {#if error}<p class="err" role="alert">{error}</p>{/if}
  {#if ok && !impose}<p class="ok" role="status">Mot de passe changé.</p>{/if}
  <button class="btn" type="submit" disabled={busy || !pret}>{busy ? 'Enregistrement…' : 'Changer le mot de passe'}</button>
</form>

<style>
  .mdp { display: grid; gap: 14px; }
  .aide { margin: 0; font-size: 14px; color: var(--encre-2); }
  label { display: grid; gap: 6px; }
  .lab { margin: 0; }
  input {
    min-height: 44px;
    padding: 0 14px;
    border: 1px solid var(--trait);
    border-radius: 8px;
    background: var(--carte-2);
    font-size: 16px;
  }
  input:focus { border-color: var(--bleu); outline: none; }
  .err, .ok { margin: 0; padding: 10px 12px; border-radius: 8px; font-size: 14px; }
  .err { background: var(--err-f); color: var(--err-e); }
  .ok { background: var(--ok-f, #e8f5ee); color: var(--ok-e, #1d6e3f); }
  .btn { width: 100%; }
</style>
