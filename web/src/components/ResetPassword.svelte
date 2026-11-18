<script lang="ts">
  import { api, ApiError } from '../lib/api.ts';
  import Brand from './Brand.svelte';

  const MIN = 12;

  // token : jeton du lien reçu par e-mail ; onDone : retour à la page de connexion.
  let { token, onDone }: { token: string; onDone: () => void } = $props();

  let nouveau = $state('');
  let confirmation = $state('');
  let code = $state('');
  // Le code n'est demandé que si le compte a une application d'authentification (le serveur le dit).
  let avecCode = $state(false);
  let error = $state('');
  let fini = $state(false);
  let busy = $state(false);

  const pret = $derived(nouveau.length >= MIN && nouveau === confirmation && (!avecCode || code.length === 6));

  async function valider(e: SubmitEvent) {
    e.preventDefault();
    if (busy || !pret) return;
    busy = true;
    error = '';
    try {
      await api.resetPassword(token, nouveau, avecCode ? code : undefined);
      fini = true;
      nouveau = '';
      confirmation = '';
    } catch (err) {
      if (err instanceof ApiError && err.code === 'code_required') {
        avecCode = true;
      } else {
        error = err instanceof ApiError ? err.message : 'Une erreur est survenue.';
      }
      code = '';
    } finally {
      busy = false;
    }
  }
</script>

<div class="page">
  {#if fini}
    <section class="card" aria-live="polite">
      <Brand height={32} />
      <div>
        <p class="lab">Mot de passe oublié</p>
        <h1>Mot de passe changé</h1>
      </div>
      <p class="aide">Votre nouveau mot de passe est enregistré. Les sessions ouvertes sur ce compte ont été fermées. Connectez-vous avec votre nouveau mot de passe.</p>
      <button class="btn" type="button" onclick={onDone}>Se connecter</button>
      <div class="frise"><span></span><span></span><span></span><span></span></div>
    </section>
  {:else}
    <form class="card" onsubmit={valider}>
      <Brand height={32} />
      <div>
        <p class="lab">Mot de passe oublié</p>
        <h1>Nouveau mot de passe</h1>
      </div>
      <p class="aide">Choisissez votre nouveau mot de passe, d'au moins {MIN} caractères.</p>
      <label>
        <span class="lab">Nouveau mot de passe</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="password" bind:value={nouveau} autocomplete="new-password" minlength={MIN} required autofocus />
      </label>
      <label>
        <span class="lab">Confirmer le nouveau mot de passe</span>
        <input type="password" bind:value={confirmation} autocomplete="new-password" minlength={MIN} required />
      </label>
      {#if avecCode}
        <label>
          <span class="lab">Code de l'application d'authentification</span>
          <input class="code" bind:value={code} inputmode="numeric" pattern="[0-9]{'{6}'}" maxlength="6" autocomplete="one-time-code" required />
        </label>
      {/if}
      {#if confirmation && nouveau !== confirmation}<p class="err" role="alert">Les deux saisies diffèrent.</p>{/if}
      {#if avecCode && !error}<p class="aide">Votre compte est protégé par une application d'authentification : saisissez aussi le code à 6 chiffres.</p>{/if}
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <button class="btn" type="submit" disabled={busy || !pret}>{busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}</button>
      <button class="btn btn-quiet" type="button" onclick={onDone}>Retour à la connexion</button>
      <div class="frise"><span></span><span></span><span></span><span></span></div>
    </form>
  {/if}
</div>

<style>
  .page { min-height: 100dvh; display: grid; place-items: center; padding: var(--gutter); }
  .card {
    width: min(400px, 100%);
    min-width: 0;
    background: var(--carte);
    border-radius: 14px;
    box-shadow: var(--ombre);
    padding: 28px 24px 20px;
    display: grid;
    gap: 18px;
  }
  h1 { margin: 2px 0 0; font-size: 24px; font-weight: 500; }
  .lab { margin: 0; }
  .aide { margin: 0; font-size: 14px; color: var(--encre-2); overflow-wrap: anywhere; }
  label { display: grid; gap: 6px; }
  input {
    width: 100%;
    min-width: 0;
    min-height: 48px;
    padding: 0 14px;
    border: 1px solid var(--trait);
    border-radius: 8px;
    background: var(--carte-2);
    font-size: 16px;
  }
  input:focus { border-color: var(--bleu); outline: none; }
  .code { font-size: 24px; font-weight: 500; letter-spacing: 0.3em; text-align: center; }
  .err { margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--err-f); color: var(--err-e); font-size: 14px; }
  .btn { width: 100%; }
</style>
