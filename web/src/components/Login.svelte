<script lang="ts">
  import { api, ApiError, type MeView } from '../lib/api.ts';
  import Brand from './Brand.svelte';

  let { onLogin }: { onLogin: (me: MeView) => void } = $props();

  let step = $state<'password' | 'code' | 'forgot' | 'sent'>('password');
  // « Mot de passe oublié » n'est proposé que si le serveur sait envoyer des e-mails.
  let resetByEmail = $state(false);
  api.authOptions().then((o) => (resetByEmail = o.resetByEmail)).catch(() => {});

  async function submitForgot(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      await api.forgot(email);
      step = 'sent';
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Une erreur est survenue.';
    } finally {
      busy = false;
    }
  }
  let email = $state('');
  let password = $state('');
  let code = $state('');
  let error = $state('');
  let busy = $state(false);

  async function submitPassword(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      const r = await api.login(email, password);
      if (r.step === 'done') {
        onLogin(r.me);
        return;
      }
      step = 'code';
      code = '';
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Une erreur est survenue.';
    } finally {
      password = '';
      busy = false;
    }
  }

  async function submitCode(e: SubmitEvent) {
    e.preventDefault();
    if (busy) return;
    busy = true;
    error = '';
    try {
      onLogin(await api.code(code));
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Une erreur est survenue.';
      code = '';
      if (err instanceof ApiError && err.code === 'code_expired') step = 'password';
    } finally {
      busy = false;
    }
  }

  function restart() {
    step = 'password';
    error = '';
    code = '';
  }
</script>

<div class="page">
  {#if step === 'password'}
    <form class="card" onsubmit={submitPassword}>
      <Brand height={32} />
      <div>
        <p class="lab">Accès réservé</p>
        <h1>Carnet AFYA</h1>
      </div>
      <label>
        <span class="lab">Adresse email</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="email" bind:value={email} autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus />
      </label>
      <label>
        <span class="lab">Mot de passe</span>
        <input type="password" bind:value={password} autocomplete="current-password" required />
      </label>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <button class="btn" type="submit" disabled={busy || !email || !password}>
        {busy ? 'Vérification…' : 'Continuer'}
      </button>
      {#if resetByEmail}
        <button class="btn btn-quiet" type="button" onclick={() => { step = 'forgot'; error = ''; }}>Mot de passe oublié ?</button>
      {/if}
      <div class="frise"><span></span><span></span><span></span><span></span></div>
    </form>
  {:else if step === 'forgot'}
    <form class="card" onsubmit={submitForgot}>
      <Brand height={32} />
      <div>
        <p class="lab">Mot de passe oublié</p>
        <h1>Recevoir un lien</h1>
      </div>
      <p class="aide">Saisissez l'adresse email de votre compte. Vous recevrez un lien pour choisir un nouveau mot de passe, valable 30 minutes.</p>
      <label>
        <span class="lab">Adresse email</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input type="email" bind:value={email} autocomplete="username" autocapitalize="none" spellcheck="false" required autofocus />
      </label>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <button class="btn" type="submit" disabled={busy || !email}>{busy ? 'Envoi…' : 'Envoyer le lien'}</button>
      <button class="btn btn-quiet" type="button" onclick={restart}>Retour à la connexion</button>
      <div class="frise"><span></span><span></span><span></span><span></span></div>
    </form>
  {:else if step === 'sent'}
    <section class="card" aria-live="polite">
      <Brand height={32} />
      <div>
        <p class="lab">Mot de passe oublié</p>
        <h1>Vérifiez vos e-mails</h1>
      </div>
      <p class="aide">Si un compte existe pour <strong>{email}</strong>, un e-mail vient de partir avec un lien valable 30 minutes. Pensez à regarder dans les indésirables. Sans e-mail, demandez à un administrateur de réinitialiser votre mot de passe.</p>
      <button class="btn btn-quiet" type="button" onclick={restart}>Retour à la connexion</button>
      <div class="frise"><span></span><span></span><span></span><span></span></div>
    </section>
  {:else}
    <form class="card" onsubmit={submitCode}>
      <Brand height={32} />
      <div>
        <p class="lab">Vérification</p>
        <h1>Code de vérification</h1>
      </div>
      <p class="aide">Saisissez le code à 6 chiffres affiché par votre application d'authentification pour <strong>{email}</strong>.</p>
      <label>
        <span class="lab">Code</span>
        <!-- svelte-ignore a11y_autofocus -->
        <input class="code" bind:value={code} inputmode="numeric" pattern="[0-9]{'{6}'}" maxlength="6" autocomplete="one-time-code" required autofocus />
      </label>
      {#if error}<p class="err" role="alert">{error}</p>{/if}
      <button class="btn" type="submit" disabled={busy || code.length !== 6}>
        {busy ? 'Connexion…' : 'Se connecter'}
      </button>
      <button class="btn btn-quiet" type="button" onclick={restart}>Recommencer</button>
      <div class="frise"><span></span><span></span><span></span><span></span></div>
    </form>
  {/if}
</div>

<style>
  .page {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: var(--gutter);
  }
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
  h1 {
    margin: 2px 0 0;
    font-size: 24px;
    font-weight: 500;
    text-wrap: balance;
  }
  .lab {
    margin: 0;
  }
  .aide {
    margin: 0;
    font-size: 14px;
    color: var(--encre-2);
    overflow-wrap: anywhere;
  }
  .aide strong {
    font-weight: 500;
  }
  label {
    display: grid;
    gap: 6px;
  }
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
  input:focus {
    border-color: var(--bleu);
    outline: none;
  }
  .code {
    font-size: 24px;
    font-weight: 500;
    letter-spacing: 0.3em;
    text-align: center;
  }
  .err {
    margin: 0;
    padding: 10px 12px;
    border-radius: 8px;
    background: var(--err-f);
    color: var(--err-e);
    font-size: 14px;
  }
  .btn {
    width: 100%;
  }
</style>
