<script lang="ts">
  import { api, onPasswordRecovery, setUnauthorizedHandler, type MeView } from './lib/api.ts';
  import Brand from './components/Brand.svelte';
  import ChangePassword from './components/ChangePassword.svelte';
  import Carnet from './components/Carnet.svelte';
  import Login from './components/Login.svelte';
  import ResetPassword from './components/ResetPassword.svelte';

  // Lien « Mot de passe oublié » reçu par e-mail : Supabase ouvre une session de récupération et
  // retire le jeton de la barre d'adresse ; on affiche alors le choix du nouveau mot de passe.
  let recuperation = $state(false);
  onPasswordRecovery(() => (recuperation = true));

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

{#if recuperation}
  <ResetPassword token="" onDone={() => { recuperation = false; me = null; }} />
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
  <Carnet {me} onLogout={logout} onMe={(m) => (me = m)} />
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
