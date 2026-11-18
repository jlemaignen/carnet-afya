<script lang="ts">
  import { renderSVG } from 'uqr';
  import { api, ApiError, type MeView } from '../lib/api.ts';
  import ChangePassword from './ChangePassword.svelte';

  let { me, onMe, onClose }: { me: MeView; onMe: (me: MeView) => void; onClose: () => void } = $props();

  let setup = $state<{ secret: string; qr: string } | null>(null);
  let retrait = $state(false);
  let code = $state('');
  let error = $state('');
  let busy = $state(false);

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
    } catch (err) {
      error = err instanceof ApiError ? err.message : 'Une erreur est survenue.';
    } finally {
      code = '';
      busy = false;
    }
  }

  const commencer = () =>
    run(async () => {
      const r = await api.totpSetup();
      // Le QR code est dessiné dans le navigateur : le secret ne passe par aucun service externe.
      setup = { secret: r.secret.replace(/(.{4})/g, '$1 ').trim(), qr: `data:image/svg+xml;utf8,${encodeURIComponent(renderSVG(r.uri, { border: 2 }))}` };
    });

  function valider(e: SubmitEvent) {
    e.preventDefault();
    run(async () => {
      onMe(setup ? await api.totpEnable(code) : await api.totpDisable(code));
      setup = null;
      retrait = false;
    });
  }
</script>

<section class="panneau" aria-label="Sécurité du compte">
  <div class="tete">
    <h2>Sécurité du compte</h2>
    <button class="bt" onclick={onClose}>Fermer</button>
  </div>

  {#if me.totpEnabled && !retrait}
    <p><span class="pill p-ok">Activée</span> Un code de votre application d'authentification est demandé à chaque connexion.</p>
    <button class="bt" onclick={() => (retrait = true)}>Désactiver</button>
  {:else if me.totpEnabled}
    <form onsubmit={valider}>
      <p>Pour désactiver, saisissez un code de votre application.</p>
      <div class="ligne">
        <!-- svelte-ignore a11y_autofocus -->
        <input class="code" bind:value={code} inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="Code à 6 chiffres" autofocus />
        <button class="bt fort" type="submit" disabled={busy || code.length !== 6}>Désactiver</button>
        <button class="bt" type="button" onclick={() => (retrait = false)}>Annuler</button>
      </div>
    </form>
  {:else if !setup}
    <p><span class="pill p-warn">Non activée</span> Votre compte est protégé par le mot de passe seul. Vous pouvez ajouter un code à usage unique, généré par une application d'authentification sur votre téléphone (Google Authenticator, Microsoft Authenticator, 1Password…).</p>
    <button class="bt fort" disabled={busy} onclick={commencer}>Activer l'application d'authentification</button>
  {:else}
    <form class="activation" onsubmit={valider}>
      <img src={setup.qr} alt="QR code à scanner avec l'application d'authentification" width="190" height="190" />
      <div>
        <p><strong>1.</strong> Scannez ce QR code avec votre application, ou saisissez la clé : <code>{setup.secret}</code></p>
        <p><strong>2.</strong> Saisissez le code à 6 chiffres qu'elle affiche.</p>
        <div class="ligne">
          <!-- svelte-ignore a11y_autofocus -->
          <input class="code" bind:value={code} inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="Code à 6 chiffres" autofocus />
          <button class="bt fort" type="submit" disabled={busy || code.length !== 6}>Activer</button>
          <button class="bt" type="button" onclick={() => (setup = null)}>Annuler</button>
        </div>
        <p class="note">En cas de perte du téléphone, le CCAG peut retirer l'application de votre compte.</p>
      </div>
    </form>
  {/if}

  {#if error}<p class="err" role="alert">{error}</p>{/if}

  <div class="bloc-mdp">
    <h3>Mot de passe</h3>
    <ChangePassword {onMe} />
  </div>
</section>

<style>
  .panneau {
    background: var(--carte); border: 1px solid var(--bleu); border-radius: 14px; box-shadow: var(--ombre);
    padding: 16px 18px; display: grid; gap: 12px; font-size: 14px;
  }
  .tete { display: flex; justify-content: space-between; align-items: center; }
  h2 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.11em; text-transform: uppercase; color: var(--encre-3); }
  p { margin: 0 0 8px; color: var(--encre-2); max-width: 75ch; }
  .pill { margin-right: 6px; }
  .bt {
    font-size: 13px; padding: 8px 14px; border-radius: 8px; justify-self: start;
    border: 1px solid var(--trait); background: var(--carte); color: var(--encre-2);
  }
  .bt.fort { background: var(--bleu); border-color: var(--bleu); color: #fff; font-weight: 500; }
  .bt:disabled { opacity: 0.5; cursor: default; }
  .activation { display: flex; gap: 20px; flex-wrap: wrap; align-items: flex-start; }
  img { border-radius: 8px; border: 1px solid var(--trait); background: #fff; }
  code { font-family: ui-monospace, monospace; font-size: 13px; color: var(--encre); word-break: break-all; }
  .ligne { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
  .code {
    width: 150px; min-height: 40px; padding: 0 12px; border: 1px solid var(--trait); border-radius: 8px;
    background: var(--carte-2); font-size: 20px; font-weight: 500; letter-spacing: 0.25em; text-align: center;
  }
  .note { font-size: 12px; color: var(--encre-3); }
  .bloc-mdp { border-top: 1px solid var(--trait); padding-top: 12px; display: grid; gap: 10px; max-width: 420px; }
  h3 { margin: 0; font-size: 13px; font-weight: 500; color: var(--encre); }
  .err { margin: 0; padding: 10px 12px; border-radius: 8px; background: var(--err-f); color: var(--err-e); }
  @media print {
    .panneau { display: none; }
  }
</style>
