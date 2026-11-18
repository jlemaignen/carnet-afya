<script lang="ts">
  import { api, setUnauthorizedHandler, type MeView } from './lib/api.ts';
  import Brand from './components/Brand.svelte';
  import ChangePassword from './components/ChangePassword.svelte';
  import Dashboard from './components/Dashboard.svelte';
  import Login from './components/Login.svelte';
  import ResetPassword from './components/ResetPassword.svelte';

  // Lien « Mot de passe oublié » : le jeton arrive après le #, on le retire aussitôt de la barre
  // d'adresse (historique, partage d'écran).
  let resetToken = $state<string | null>(null);
  function lireLien() {
    const m = location.hash.match(/^#reinitialisation=([A-Za-z0-9_-]{20,100})$/);
    if (m) {
      resetToken = m[1];
      history.replaceState(null, '', location.pathname + location.search);
    }
  }
  lireLien();
  // Lien ouvert alors que l'app est déjà affichée dans cet onglet : seule la fin de l'adresse change.
  window.addEventListener('hashchange', lireLien);

  let me = $state<MeView | null>(null);
  let loading = $state(true);

  setUnauthorizedHandler(() => (me = null));

  api
    .me()
    .then((m) => (me = m))
    .catch(() => (me = null))
    .finally(() => (loading = false));

  async function logout() {
    await api.logout().catch(() => {});
    me = null;
  }
</script>

{#if resetToken}
  <ResetPassword token={resetToken} onDone={() => (resetToken = null)} />
{:else if loading}
  <div class="center" aria-busy="true"><Brand height={34} /></div>
{:else if me && me.mustChangePassword}
  <div class="center">
    <section class="carte-mdp" aria-label="Choix du mot de passe">
      <Brand height={30} />
      <h1>Choisissez votre mot de passe</h1>
      <ChangePassword impose onMe={(m) => (me = m)} />
      <button class="btn btn-quiet" type="button" onclick={logout}>Se déconnecter</button>
    </section>
  </div>
{:else if me}
  <Dashboard {me} onLogout={logout} onMe={(m) => (me = m)} />
{:else}
  <Login onLogin={(m) => (me = m)} />
{/if}

<style>
  .center {
    min-height: 100dvh;
    display: grid;
    place-items: center;
    padding: var(--gutter, 16px);
  }
  .carte-mdp {
    width: min(420px, 100%);
    background: var(--carte);
    border-radius: 14px;
    box-shadow: var(--ombre);
    padding: 28px 24px 20px;
    display: grid;
    gap: 18px;
  }
  .carte-mdp h1 { margin: 0; font-size: 22px; font-weight: 500; }
  .carte-mdp .btn { width: 100%; }
</style>
