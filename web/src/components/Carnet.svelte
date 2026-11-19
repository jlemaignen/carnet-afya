<script lang="ts">
  import { onDestroy } from 'svelte';
  import { api, ApiError, type MeView } from '../lib/api.ts';
  import Admin from './Admin.svelte';
  import Equipe from './Equipe.svelte';
  import Security from './Security.svelte';
  import { startCarnet } from '../carnet/engine.js';
  import '../carnet/carnet.css';

  let { me, onLogout, onMe }: { me: MeView; onLogout: () => void; onMe: (me: MeView) => void } = $props();

  let securite = $state(false);
  let comptes = $state(false);
  let equipe = $state(false);
  let error = $state('');
  let root = $state<HTMLElement | null>(null);
  let stop: (() => void) | null = null;

  // Le moteur du prototype dessine lui-même ses écrans dans root ; Svelte garde la session,
  // la sécurité, les comptes et l'équipe (composants du socle).
  async function charger(el: HTMLElement) {
    try {
      const view = await api.carnet();
      stop = startCarnet(el, {
        view,
        isAdmin: me.isAdmin,
        notice: me.totpEnabled ? '' : "Protégez votre compte : activez l'application d'authentification (bouton Sécurité).",
        save: (p: { code: string }) => api.savePatient(p.code, p),
        feedback: (code, kind, text) => api.feedback(code, kind, text),
        readFeedback: (code) => api.readFeedback(code),
        register: () => Promise.reject(new Error('')),
        onLogout,
        onSecurity: () => (securite = true),
        onAdmin: () => ((comptes = true), (equipe = false)),
        onTeam: () => ((equipe = true), (comptes = false)),
        onLogin: () => {},
      });
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Une erreur est survenue.';
    }
  }

  $effect(() => {
    if (root && !stop && !error) charger(root);
  });
  onDestroy(() => stop?.());
</script>

<div class="afya">
  {#if error}
    <div class="erreur" role="alert">
      <p>{error}</p>
      <button class="btn" type="button" onclick={onLogout}>Se déconnecter</button>
    </div>
  {:else}
    <div bind:this={root}></div>
  {/if}
</div>

{#if securite}
  <Security {me} {onMe} onClose={() => (securite = false)} />
{/if}
{#if comptes && me.isAdmin}
  <Admin {me} onClose={() => (comptes = false)} onSecurite={() => { comptes = false; securite = true; }} />
{/if}
{#if equipe && me.isAdmin}
  <Equipe onClose={() => (equipe = false)} onSecurite={() => { equipe = false; securite = true; }} />
{/if}

<style>
  .afya { min-height: 100dvh; }
  .erreur { max-width: 420px; margin: 20vh auto 0; padding: 0 16px; display: grid; gap: 12px; }
</style>
