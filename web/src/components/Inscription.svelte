<script lang="ts">
  import { onDestroy } from 'svelte';
  import { api } from '../lib/api.ts';
  import { startCarnet } from '../carnet/engine.js';
  import '../carnet/carnet.css';

  // Page d'inscription ouverte par le lien ou le QR code d'un atelier (#invite-<atelier>), sans compte :
  // l'écran du prototype, envoyé comme demande que l'équipe AFYA valide.
  let { invite, onLogin }: { invite: string | null; onLogin: () => void } = $props();

  let root = $state<HTMLElement | null>(null);
  let error = $state('');
  let stop: (() => void) | null = null;

  async function charger(el: HTMLElement) {
    try {
      const workshops = await api.workshops();
      const nope = () => Promise.reject(new Error(''));
      stop = startCarnet(el, {
        view: { role: 'part', participant: null, participants: [], patients: [], workshops, group: null },
        isAdmin: false,
        mode: 'register',
        invite,
        save: nope,
        feedback: nope,
        readFeedback: nope,
        register: (r) => api.register(r),
        onLogout: onLogin,
        onSecurity: () => {},
        onAdmin: () => {},
        onTeam: () => {},
        onLogin,
      });
    } catch {
      error = 'Pas de connexion. Vérifiez le réseau puis réessayez.';
    }
  }

  $effect(() => {
    if (root && !stop && !error) charger(root);
  });
  onDestroy(() => stop?.());
</script>

<div class="afya">
  {#if error}
    <p class="erreur" role="alert">{error}</p>
  {:else}
    <div bind:this={root}></div>
  {/if}
</div>

<style>
  .afya { min-height: 100dvh; }
  .erreur { max-width: 420px; margin: 20vh auto 0; padding: 0 16px; }
</style>
