<script lang="ts">
  import { api, ApiError, type AccueilView, type MeView } from '../lib/api.ts';
  import Brand from './Brand.svelte';
  import Admin from './Admin.svelte';
  import Security from './Security.svelte';
  import { langue, t, type Langue } from '../lib/i18n.svelte.ts';
  const LANGUES: { l: Langue; nom: string }[] = [{ l: 'fr', nom: 'Français' }, { l: 'de', nom: 'Deutsch' }, { l: 'en', nom: 'English' }];

  let { me, onLogout, onMe }: { me: MeView; onLogout: () => void; onMe: (me: MeView) => void } = $props();

  let securite = $state(false);
  let comptes = $state(false);
  let data = $state<AccueilView | null>(null);
  let loading = $state(true);
  let error = $state('');

  async function charger() {
    loading = true;
    error = '';
    try {
      data = await api.accueil();
    } catch (err) {
      error = err instanceof ApiError ? err.message : t('Une erreur est survenue.');
    } finally {
      loading = false;
    }
  }
  charger();
</script>

<div class="page">
  <header class="top">
    <div class="marque">
      <Brand height={30} />
      <div>
        <h1>{t('Carnet AFYA')}</h1>
        <p class="sub">{t('Tableau de bord')}</p>
      </div>
    </div>
    <div class="reglages">
      <div class="langues" role="group" aria-label={t('Langue')}>
        {#each LANGUES as x (x.l)}
          <button class="drapeau" class:actif={langue.v === x.l} title={x.nom} aria-label={x.nom} aria-pressed={langue.v === x.l} onclick={() => (langue.v = x.l)}>
            {#if x.l === 'fr'}
              <svg viewBox="0 0 3 2" aria-hidden="true"><rect width="1" height="2" fill="#0055A4" /><rect x="1" width="1" height="2" fill="#FFFFFF" /><rect x="2" width="1" height="2" fill="#EF4135" /></svg>
            {:else if x.l === 'de'}
              <svg viewBox="0 0 5 3" aria-hidden="true"><rect width="5" height="1" fill="#000000" /><rect y="1" width="5" height="1" fill="#DD0000" /><rect y="2" width="5" height="1" fill="#FFCE00" /></svg>
            {:else}
              <svg viewBox="0 0 60 30" aria-hidden="true"><clipPath id="uk-s"><path d="M0,0 v30 h60 v-30 z" /></clipPath><clipPath id="uk-t"><path d="M30,15 h30 v15 z v15 h-30 z h-30 v-15 z v-15 h30 z" /></clipPath><g clip-path="url(#uk-s)"><path d="M0,0 v30 h60 v-30 z" fill="#012169" /><path d="M0,0 L60,30 M60,0 L0,30" stroke="#FFFFFF" stroke-width="6" /><path d="M0,0 L60,30 M60,0 L0,30" clip-path="url(#uk-t)" stroke="#C8102E" stroke-width="4" /><path d="M30,0 v30 M0,15 h60" stroke="#FFFFFF" stroke-width="10" /><path d="M30,0 v30 M0,15 h60" stroke="#C8102E" stroke-width="6" /></g></svg>
            {/if}
          </button>
        {/each}
      </div>
      <div class="compte">
        <span>{me.displayName}</span>
        {#if me.isAdmin}<button class="bt" onclick={() => (comptes = true)}>{t('Comptes')}</button>{/if}
        <button class="bt" class:alerte={!me.totpEnabled} onclick={() => (securite = true)}>{t('Sécurité')}</button>
        <button class="bt" onclick={onLogout}>{t('Se déconnecter')}</button>
      </div>
    </div>
  </header>

  {#if securite}
    <Security {me} {onMe} onClose={() => (securite = false)} />
  {/if}

  {#if comptes && me.isAdmin}
    <Admin {me} onClose={() => (comptes = false)} onSecurite={() => { comptes = false; securite = true; }} />
  {/if}

  {#if error}
    <p class="err" role="alert">{error}</p>
  {:else if loading}
    <p class="vide" aria-busy="true">{t('Chargement…')}</p>
  {:else if data}
    <section class="carte">
      <h3>{t('Carnet AFYA')}</h3>
      <p class="vide-grand">{t('Le contenu du tableau de bord sera bientôt disponible.')}</p>
    </section>
  {/if}
</div>

<style>
  .page {
    --warn-c: #c47a1e;
    max-width: 1560px;
    margin: 0 auto;
    padding: 22px var(--gutter) 40px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .top { display: flex; justify-content: space-between; align-items: flex-end; gap: 20px; flex-wrap: wrap; }
  .marque { display: flex; align-items: center; gap: 18px; flex-wrap: wrap; }
  h1 { font-size: 26px; font-weight: 500; letter-spacing: -0.025em; margin: 0; line-height: 1.12; text-transform: uppercase; }
  .sub { font-size: 13px; color: var(--encre-3); margin: 4px 0 0; }
  .reglages { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; }
  .bt {
    font-size: 13px; padding: 8px 14px; border-radius: 8px;
    border: 1px solid var(--trait); background: var(--carte); color: var(--encre-2);
  }
  .bt:hover { border-color: var(--taupe); }
  .alerte { border-color: var(--warn-c); color: var(--warn-e); background: var(--warn-f); }
  .compte { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--encre-2); margin-left: 6px; flex-wrap: wrap; }
  .err { margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--err-f); color: var(--err-e); font-size: 14px; }
  .carte { background: var(--carte); border: 1px solid var(--trait); border-radius: 14px; box-shadow: var(--ombre); overflow: hidden; min-width: 0; }
  h3 {
    font-size: 11px; font-weight: 600; letter-spacing: 0.11em; text-transform: uppercase; color: var(--encre-3);
    margin: 0; padding: 15px 18px 12px; display: flex; align-items: center; gap: 9px; border-bottom: 1px solid var(--trait-2);
  }
  h3::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--cyan); flex: none; }
  .vide-grand { font-size: 14px; color: var(--encre-3); margin: 0; padding: 48px 18px; text-align: center; }
  .vide { margin: 30px 0; text-align: center; font-size: 13px; color: var(--encre-3); }
  .langues { display: inline-flex; gap: 4px; align-items: center; }
  .drapeau { width: 26px; height: 18px; padding: 0; border: 1px solid var(--trait); border-radius: 3px; overflow: hidden; cursor: pointer; background: none; opacity: 0.55; display: inline-flex; }
  .drapeau svg { width: 100%; height: 100%; display: block; }
  .drapeau.actif { opacity: 1; outline: 2px solid var(--bleu); outline-offset: 1px; }
  .drapeau:hover { opacity: 1; }
  @media (max-width: 760px) {
    h1 { font-size: 22px; }
  }
</style>
