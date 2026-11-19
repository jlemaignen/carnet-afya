<script lang="ts">
  import { SECTIONS, SECTION_LABELS } from '../lib/contract.ts';
  import { api, ApiError, type AdminUser, type MeView, type Section } from '../lib/api.ts';

  let { me, onClose, onSecurite }: { me: MeView; onClose: () => void; onSecurite: () => void } = $props();

  let users = $state<AdminUser[]>([]);
  let loading = $state(true);
  let error = $state('');
  let besoinTotp = $state(false);
  let busy = $state(false);

  // Mot de passe provisoire à transmettre : affiché une seule fois, jamais relisible ensuite.
  let provisoire = $state<{ email: string; password: string; copie: boolean } | null>(null);

  let ajout = $state(false);
  let email = $state('');
  let nom = $state('');
  let choix = $state<Section[]>([]);
  let edition = $state<{ id: string; sections: Section[] } | null>(null);
  // Changement de rôle en attente du code de l'application d'authentification.
  let role = $state<{ user: AdminUser; admin: boolean; code: string } | null>(null);

  function fail(err: unknown) {
    if (err instanceof ApiError && err.code === 'totp_required') besoinTotp = true;
    error = err instanceof ApiError ? err.message : 'Une erreur est survenue.';
  }

  async function charger() {
    loading = true;
    error = '';
    try {
      users = await api.adminUsers();
    } catch (err) {
      fail(err);
    } finally {
      loading = false;
    }
  }
  charger();

  async function run(fn: () => Promise<void>) {
    if (busy) return;
    busy = true;
    error = '';
    try {
      await fn();
    } catch (err) {
      fail(err);
    } finally {
      busy = false;
    }
  }

  const remplace = (u: AdminUser): void => {
    users = users.map((x) => (x.id === u.id ? u : x));
  };
  const bascule = (list: Section[], s: Section): Section[] => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]);

  function creer(e: SubmitEvent) {
    e.preventDefault();
    run(async () => {
      const r = await api.adminCreate(email.trim(), nom.trim(), choix);
      users = [...users, r.user].sort((a, b) => a.email.localeCompare(b.email));
      provisoire = { email: r.user.email, password: r.temporaryPassword, copie: false };
      ajout = false;
      email = '';
      nom = '';
      choix = [];
    });
  }

  const enregistrerRubriques = () =>
    run(async () => {
      if (!edition) return;
      const soi = users.find((x) => x.id === edition!.id)?.email === me.email;
      remplace(await api.adminUpdate(edition.id, { sections: edition.sections }));
      edition = null;
      // Ses propres rubriques : on recharge pour que le dashboard les affiche aussitôt.
      if (soi) location.reload();
    });

  const activer = (u: AdminUser, disabled: boolean) => {
    if (disabled && !confirm(`Désactiver le compte de ${u.displayName} ? La personne ne pourra plus se connecter.`)) return;
    run(async () => remplace(await api.adminUpdate(u.id, { disabled })));
  };

  const reinitialiser = (u: AdminUser) => {
    if (!confirm(`Réinitialiser le mot de passe de ${u.displayName} ? Son mot de passe actuel ne fonctionnera plus.`)) return;
    run(async () => {
      const r = await api.adminResetPassword(u.id);
      remplace(r.user);
      provisoire = { email: r.user.email, password: r.temporaryPassword, copie: false };
    });
  };

  const retirerTotp = (u: AdminUser) => {
    if (!confirm(`Retirer l'application d'authentification de ${u.displayName} ? À faire seulement si la personne a perdu son téléphone.`)) return;
    run(async () => remplace(await api.adminResetTotp(u.id)));
  };

  /** Place le curseur dans le champ dès qu'il apparaît. */
  const curseur = (el: HTMLInputElement) => el.focus();

  function confirmerRole(e: SubmitEvent) {
    e.preventDefault();
    run(async () => {
      if (!role) return;
      try {
        remplace(await api.adminSetRole(role.user.id, role.admin, role.code));
        role = null;
      } catch (err) {
        if (role) role.code = '';
        throw err;
      }
    });
  }

  async function copier() {
    if (!provisoire) return;
    try {
      await navigator.clipboard.writeText(provisoire.password);
      provisoire.copie = true;
    } catch {
      /* le mot de passe reste affiché : copie à la main */
    }
  }

  const dateFr = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('.') : 'jamais');
</script>

<section class="panneau" aria-label="Gestion des comptes">
  <div class="tete">
    <h2>Comptes</h2>
    <div class="ligne">
      {#if !besoinTotp && !ajout}<button class="bt fort" onclick={() => (ajout = true)}>Ajouter une personne</button>{/if}
      <button class="bt" onclick={onClose}>Fermer</button>
    </div>
  </div>

  {#if error}<p class="err" role="alert">{error}</p>{/if}

  {#if besoinTotp}
    <p>La gestion des comptes n'est ouverte qu'aux administrateurs dont l'application d'authentification est activée.</p>
    <button class="bt fort" onclick={onSecurite}>Ouvrir Sécurité</button>
  {:else}
    {#if provisoire}
      <div class="provisoire" role="status">
        <p><strong>Mot de passe provisoire pour {provisoire.email}</strong></p>
        <p class="mdp"><code>{provisoire.password}</code>
          <button class="bt" onclick={copier}>{provisoire.copie ? 'Copié' : 'Copier'}</button>
        </p>
        <p class="note">Transmettez-le à la personne par un canal sûr (de vive voix, ou séparément de l'adresse du site). Il ne sera plus affiché. Elle devra choisir son propre mot de passe à la première connexion.</p>
        <button class="bt" onclick={() => (provisoire = null)}>C'est noté, masquer</button>
      </div>
    {/if}

    {#if role}
      <form class="role" onsubmit={confirmerRole}>
        {#if role.admin}
          <p><strong>Nommer {role.user.displayName} administrateur ?</strong> Cette personne pourra créer des comptes, ouvrir toutes les rubriques à qui elle veut et nommer d'autres administrateurs. Elle devra activer son application d'authentification pour agir.</p>
        {:else}
          <p><strong>Retirer le rôle administrateur à {role.user.displayName} ?</strong> Son compte reste actif avec ses rubriques.</p>
        {/if}
        <div class="ligne">
          <input class="code" use:curseur bind:value={role.code} inputmode="numeric" maxlength="6" autocomplete="one-time-code" aria-label="Code à 6 chiffres de votre application d'authentification" placeholder="Code" />
          <button class="bt fort" type="submit" disabled={busy || role.code.length !== 6}>Confirmer</button>
          <button class="bt" type="button" onclick={() => (role = null)}>Annuler</button>
        </div>
        <p class="note">Saisissez un code de votre application d'authentification pour confirmer.</p>
      </form>
    {/if}

    {#if ajout}
      <form class="ajout" onsubmit={creer}>
        <label><span class="lab">Adresse email</span>
          <!-- svelte-ignore a11y_autofocus -->
          <input type="email" bind:value={email} required autocomplete="off" autocapitalize="none" spellcheck="false" autofocus />
        </label>
        <label><span class="lab">Nom affiché</span>
          <input bind:value={nom} required maxlength="80" autocomplete="off" />
        </label>
        <fieldset>
          <legend class="lab">Rubriques visibles</legend>
          {#each SECTIONS as s (s)}
            <label class="coche"><input type="checkbox" checked={choix.includes(s)} onchange={() => (choix = bascule(choix, s))} />{SECTION_LABELS[s]}</label>
          {/each}
        </fieldset>
        <div class="ligne">
          <button class="bt fort" type="submit" disabled={busy || !email || !nom.trim() || !choix.length}>Créer le compte</button>
          <button class="bt" type="button" onclick={() => (ajout = false)}>Annuler</button>
        </div>
      </form>
    {/if}

    {#if loading}
      <p aria-busy="true">Chargement…</p>
    {:else}
      <div class="tbl">
        <table>
          <thead><tr><th>Personne</th><th>Rubriques</th><th>État</th><th>Dernière connexion</th><th></th></tr></thead>
          <tbody>
            {#each users as u (u.id)}
              <tr class:inactif={u.disabled}>
                <td><strong>{u.displayName}</strong><span class="sous">{u.email}</span></td>
                <td class="rub">
                  {#if edition?.id === u.id}
                    {#each SECTIONS as s (s)}
                      <label class="coche"><input type="checkbox" checked={edition.sections.includes(s)} onchange={() => edition && (edition.sections = bascule(edition.sections, s))} />{SECTION_LABELS[s]}</label>
                    {/each}
                    <div class="ligne">
                      <button class="bt fort mini" disabled={busy} onclick={enregistrerRubriques}>Enregistrer</button>
                      <button class="bt mini" onclick={() => (edition = null)}>Annuler</button>
                    </div>
                  {:else if u.sections.length === SECTIONS.length}
                    Toutes
                  {:else}
                    {u.sections.map((s) => SECTION_LABELS[s]).join(', ') || 'Aucune'}
                  {/if}
                </td>
                <td>
                  {#if u.isAdmin}<span class="pill p-bu">Administrateur</span>{/if}
                  {#if u.disabled}<span class="pill p-warn">Désactivé</span>{/if}
                  {#if u.mustChangePassword}<span class="pill p-warn">Mot de passe provisoire</span>{/if}
                  <span class="pill {u.totpEnabled ? 'p-ok' : 'p-gris'}">{u.totpEnabled ? 'Application activée' : 'Sans application'}</span>
                </td>
                <td>{dateFr(u.lastLoginAt)}</td>
                <td class="actions">
                  {#if u.isAdmin}
                    {#if u.email === me.email}
                      <button class="bt mini" disabled={busy} onclick={() => (edition = { id: u.id, sections: [...u.sections] })}>Mes rubriques</button>
                    {:else}
                      <button class="bt mini" disabled={busy} onclick={() => (role = { user: u, admin: false, code: '' })}>Retirer le rôle administrateur</button>
                    {/if}
                  {:else}
                    <button class="bt mini" disabled={busy} onclick={() => (edition = { id: u.id, sections: [...u.sections] })}>Rubriques</button>
                    <button class="bt mini" disabled={busy} onclick={() => reinitialiser(u)}>Nouveau mot de passe</button>
                    {#if u.totpEnabled}<button class="bt mini" disabled={busy} onclick={() => retirerTotp(u)}>Retirer l'application</button>{/if}
                    <button class="bt mini" disabled={busy} onclick={() => activer(u, !u.disabled)}>{u.disabled ? 'Réactiver' : 'Désactiver'}</button>
                    {#if !u.disabled}<button class="bt mini" disabled={busy} onclick={() => (role = { user: u, admin: true, code: '' })}>Nommer administrateur</button>{/if}
                  {/if}
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
      <p class="note">Les comptes ne sont jamais supprimés ici : un compte désactivé ne peut plus se connecter et garde son historique. Chaque action est notée au journal avec votre nom.</p>
    {/if}
  {/if}
</section>

<style>
  .panneau {
    background: var(--carte); border: 1px solid var(--bleu); border-radius: 14px; box-shadow: var(--ombre);
    padding: 16px 18px; display: grid; gap: 14px; font-size: 14px;
  }
  .tete { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.11em; text-transform: uppercase; color: var(--encre-3); }
  p { margin: 0; color: var(--encre-2); max-width: 80ch; }
  .ligne { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  .bt {
    font-size: 13px; padding: 8px 14px; border-radius: 8px;
    border: 1px solid var(--trait); background: var(--carte); color: var(--encre-2);
  }
  .bt.fort { background: var(--bleu); border-color: var(--bleu); color: #fff; font-weight: 500; }
  .bt.mini { font-size: 12px; padding: 5px 10px; }
  .bt:disabled { opacity: 0.5; cursor: default; }
  .err { padding: 10px 12px; border-radius: 8px; background: var(--err-f); color: var(--err-e); }
  .provisoire { background: var(--warn-f); border-radius: 10px; padding: 14px 16px; display: grid; gap: 8px; justify-items: start; }
  .provisoire p { color: var(--warn-e); }
  .mdp { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; }
  code { font-family: ui-monospace, monospace; font-size: 18px; letter-spacing: 0.04em; color: var(--encre); background: var(--carte); padding: 6px 12px; border-radius: 8px; user-select: all; }
  .note { font-size: 12px; color: var(--encre-3); }
  .provisoire .note { color: var(--warn-e); }
  .role { display: grid; gap: 10px; padding: 14px 16px; background: var(--bu-f); border-radius: 10px; }
  .role p { color: var(--bu-e); }
  .role .code { width: 130px; min-height: 38px; padding: 0 12px; border: 1px solid var(--trait); border-radius: 8px; background: var(--carte); font-size: 18px; font-weight: 500; letter-spacing: 0.2em; text-align: center; }
  .ajout { display: grid; gap: 12px; padding: 14px 16px; background: var(--carte-2); border-radius: 10px; max-width: 560px; }
  .ajout label:not(.coche) { display: grid; gap: 5px; }
  .ajout input:not([type='checkbox']) { min-height: 40px; padding: 0 12px; border: 1px solid var(--trait); border-radius: 8px; background: var(--carte); font-size: 15px; }
  fieldset { border: 0; padding: 0; margin: 0; display: flex; flex-wrap: wrap; gap: 6px 16px; }
  legend { padding: 0; margin-bottom: 6px; }
  .coche { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--encre-2); margin-right: 12px; }
  .coche input { accent-color: var(--bleu); }
  .tbl { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-weight: 500; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--encre-3); padding: 9px 10px; border-bottom: 1px solid var(--trait); white-space: nowrap; }
  td { padding: 10px; border-bottom: 1px solid var(--trait-2); vertical-align: top; }
  td strong { font-weight: 500; display: block; }
  .sous { display: block; font-size: 12px; color: var(--encre-3); }
  .rub { min-width: 200px; max-width: 360px; }
  .inactif td:first-child, .inactif .rub { opacity: 0.55; }
  .pill { margin: 0 4px 4px 0; }
  .p-gris { background: var(--trait-2); color: var(--encre-3); }
  .actions { text-align: right; min-width: 230px; }
  .actions .bt { margin: 0 0 4px 4px; }
  @media print {
    .panneau { display: none; }
  }
</style>
