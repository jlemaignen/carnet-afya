<script lang="ts">
  import { api, ApiError, type AcceptResult, type ParticipantRow, type Registration } from '../lib/api.ts';
  import type { Workshop } from '../lib/contract.ts';

  // Équipe pédagogique : demandes d'inscription venues du lien d'atelier, certification de l'atelier
  // suivi par chaque participant, et liste des ateliers proposés à l'inscription.
  let { onClose, onSecurite }: { onClose: () => void; onSecurite: () => void } = $props();

  let demandes = $state<Registration[]>([]);
  let participants = $state<ParticipantRow[]>([]);
  let ateliers = $state<Workshop[]>([]);
  let loading = $state(true);
  let error = $state('');
  let besoinTotp = $state(false);
  let busy = $state(false);

  // Compte créé : identifiant et mot de passe provisoire affichés une seule fois.
  let cree = $state<(AcceptResult & { email: string; copie: boolean }) | null>(null);
  let certif = $state<{ id: string; date: string; place: string } | null>(null);
  let atelier = $state<Workshop | null>(null);

  function fail(err: unknown) {
    if (err instanceof ApiError && err.code === 'totp_required') besoinTotp = true;
    error = err instanceof ApiError ? err.message : 'Une erreur est survenue.';
  }

  async function charger() {
    loading = true;
    error = '';
    try {
      [demandes, participants, ateliers] = await Promise.all([api.adminRegistrations(), api.adminParticipants(), api.workshops(true)]);
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

  const nomAtelier = (id: string | null) => {
    const w = ateliers.find((x) => x.id === id);
    return w ? `${w.place}, ${moisFr(w.date)}` : id ?? '';
  };
  const moisFr = (ym: string) => (/^\d{4}-\d{2}$/.test(ym) ? ym.slice(5) + '.' + ym.slice(0, 4) : ym);
  const dateFr = (iso: string) => iso.slice(0, 10).split('-').reverse().join('.');

  function valider(r: Registration) {
    if (!confirm(`Créer le compte de ${r.first_name} ${r.last_name} (${r.email}) ?`)) return;
    run(async () => {
      const res = await api.adminAcceptRegistration(r.id);
      cree = { ...res, email: r.email, copie: false };
      await charger();
    });
  }

  function refuser(r: Registration) {
    if (!confirm(`Refuser la demande de ${r.first_name} ${r.last_name} ? Aucun compte ne sera créé.`)) return;
    run(async () => {
      await api.adminRejectRegistration(r.id);
      demandes = demandes.filter((x) => x.id !== r.id);
    });
  }

  function certifier(p: ParticipantRow) {
    const w = ateliers.find((x) => x.id === p.workshop_id);
    certif = { id: p.id, date: w?.date ?? new Date().toISOString().slice(0, 7), place: w?.place ?? '' };
  }

  function enregistrerCertif(e: SubmitEvent) {
    e.preventDefault();
    const c = certif;
    if (!c) return;
    run(async () => {
      await api.adminSetWs(c.id, { date: c.date, place: c.place });
      participants = participants.map((p) => (p.id === c.id ? { ...p, ws: { date: c.date, place: c.place.trim() } } : p));
      certif = null;
    });
  }

  function retirerCertif(p: ParticipantRow) {
    if (!confirm(`Retirer la certification d'atelier de ${p.name} ?`)) return;
    run(async () => {
      await api.adminSetWs(p.id, null);
      participants = participants.map((x) => (x.id === p.id ? { ...x, ws: null } : x));
    });
  }

  function enregistrerAtelier(e: SubmitEvent) {
    e.preventDefault();
    const w = atelier;
    if (!w) return;
    run(async () => {
      await api.adminSaveWorkshop(w);
      atelier = null;
      ateliers = await api.workshops(true);
    });
  }

  async function copier() {
    if (!cree) return;
    try {
      await navigator.clipboard.writeText(cree.temporaryPassword);
      cree.copie = true;
    } catch {
      /* le mot de passe reste affiché : copie à la main */
    }
  }
</script>

<section class="panneau" aria-label="Équipe pédagogique">
  <div class="tete">
    <h2>Équipe</h2>
    <div class="ligne">
      <button class="bt" onclick={charger} disabled={loading}>Actualiser</button>
      <button class="bt" onclick={onClose}>Fermer</button>
    </div>
  </div>

  {#if error}<p class="err" role="alert">{error}</p>{/if}

  {#if besoinTotp}
    <p>L'équipe n'est gérée que par les administrateurs dont l'application d'authentification est activée.</p>
    <button class="bt fort" onclick={onSecurite}>Ouvrir Sécurité</button>
  {:else if loading}
    <p aria-busy="true">Chargement…</p>
  {:else}
    {#if cree}
      <div class="provisoire" role="status">
        <p><strong>Compte créé pour {cree.email}</strong></p>
        <p>Identifiant AFYA : <strong>{cree.participantId}</strong>. Numéro des patientes : <strong>{cree.codePrefix}_001</strong>, puis 002, 003…</p>
        <p class="mdp"><code>{cree.temporaryPassword}</code>
          <button class="bt" onclick={copier}>{cree.copie ? 'Copié' : 'Copier'}</button>
        </p>
        <p class="note">Transmettez le mot de passe provisoire par un canal sûr, séparément de l'adresse du site. Il ne sera plus affiché. La personne choisira le sien à la première connexion.</p>
        <button class="bt" onclick={() => (cree = null)}>C'est noté, masquer</button>
      </div>
    {/if}

    <h3>Demandes d'inscription <span class="compte">{demandes.length}</span></h3>
    {#if demandes.length === 0}
      <p class="note">Aucune demande en attente. Les demandes arrivent par le lien ou le QR code d'atelier (rubrique Participants, bouton Inviter).</p>
    {:else}
      <div class="tbl">
        <table>
          <thead><tr><th>Demande</th><th>Pays, hôpital</th><th>Atelier</th><th></th></tr></thead>
          <tbody>
            {#each demandes as r (r.id)}
              <tr>
                <td><strong>{r.first_name} {r.last_name}</strong><span class="sous">{r.email}{r.phone ? `, ${r.phone}` : ''}</span><span class="sous">reçue le {dateFr(r.created_at)}</span></td>
                <td>{r.country}<span class="sous">{r.hospital}</span></td>
                <td>{nomAtelier(r.workshop_id) || 'non précisé'}</td>
                <td class="actions">
                  <button class="bt fort mini" disabled={busy} onclick={() => valider(r)}>Valider</button>
                  <button class="bt mini" disabled={busy} onclick={() => refuser(r)}>Refuser</button>
                </td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}

    <h3>Participants <span class="compte">{participants.length}</span></h3>
    {#if certif}
      <form class="ajout" onsubmit={enregistrerCertif}>
        <p><strong>Certifier l'atelier suivi par {participants.find((p) => p.id === certif!.id)?.name}</strong></p>
        <div class="ligne">
          <label>Mois <input type="month" bind:value={certif.date} required /></label>
          <label>Lieu <input type="text" bind:value={certif.place} required maxlength="80" /></label>
        </div>
        <div class="ligne">
          <button class="bt fort" type="submit" disabled={busy || !certif.place.trim() || !certif.date}>Certifier</button>
          <button class="bt" type="button" onclick={() => (certif = null)}>Annuler</button>
        </div>
      </form>
    {/if}
    <div class="tbl">
      <table>
        <thead><tr><th>Participant</th><th>Pays, hôpital</th><th>Numéro des patientes</th><th>Atelier certifié</th><th></th></tr></thead>
        <tbody>
          {#each participants as p (p.id)}
            <tr>
              <td><strong>{p.name}</strong><span class="sous">{p.id}</span>{#if p.email}<span class="sous">{p.email}</span>{/if}</td>
              <td>{p.country}<span class="sous">{p.site}</span></td>
              <td>{p.code_key ? `${p.country}_${p.code_key}_001` : 'à définir'}</td>
              <td>{p.ws ? `${p.ws.place}, ${moisFr(p.ws.date)}` : 'non'}{#if !p.ws && p.workshop_id}<span class="sous">inscrit à {nomAtelier(p.workshop_id)}</span>{/if}</td>
              <td class="actions">
                {#if p.ws}
                  <button class="bt mini" disabled={busy} onclick={() => retirerCertif(p)}>Retirer</button>
                {:else}
                  <button class="bt fort mini" disabled={busy} onclick={() => certifier(p)}>Certifier</button>
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>

    <div class="tete">
      <h3>Ateliers</h3>
      {#if !atelier}<button class="bt" onclick={() => (atelier = { id: '', place: '', date: new Date().toISOString().slice(0, 7), active: true })}>Ajouter un atelier</button>{/if}
    </div>
    {#if atelier}
      <form class="ajout" onsubmit={enregistrerAtelier}>
        <div class="ligne">
          <label>Identifiant <input type="text" bind:value={atelier.id} required pattern="[a-z0-9-]{'{'}3,60{'}'}" placeholder="mwanza-2026-11" /></label>
          <label>Lieu <input type="text" bind:value={atelier.place} required maxlength="80" /></label>
          <label>Mois <input type="month" bind:value={atelier.date} required /></label>
        </div>
        <label class="coche"><input type="checkbox" bind:checked={atelier.active} /> Proposé à l'inscription</label>
        <div class="ligne">
          <button class="bt fort" type="submit" disabled={busy}>Enregistrer</button>
          <button class="bt" type="button" onclick={() => (atelier = null)}>Annuler</button>
        </div>
      </form>
    {/if}
    <p class="note">Seuls les ateliers proposés à l'inscription apparaissent dans le formulaire du lien d'atelier.</p>
    <div class="tbl">
      <table>
        <thead><tr><th>Atelier</th><th>Identifiant</th><th></th></tr></thead>
        <tbody>
          {#each ateliers as w (w.id)}
            <tr>
              <td><strong>{w.place}</strong><span class="sous">{moisFr(w.date)}</span></td>
              <td>{w.id}</td>
              <td class="actions"><button class="bt mini" disabled={busy} onclick={() => (atelier = { ...w })}>Modifier</button></td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</section>

<style>
  .panneau {
    background: var(--carte); border: 1px solid var(--bleu); border-radius: 14px; box-shadow: var(--ombre);
    padding: 16px 18px; display: grid; gap: 14px; font-size: 14px;
  }
  .tete { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  h2 { margin: 0; font-size: 11px; font-weight: 600; letter-spacing: 0.11em; text-transform: uppercase; color: var(--encre-3); }
  h3 { margin: 8px 0 0; font-size: 15px; font-weight: 500; }
  .compte { font-size: 12px; color: var(--encre-3); font-weight: 400; margin-left: 4px; }
  p { margin: 0; color: var(--encre-2); max-width: 80ch; }
  .ligne { display: flex; gap: 8px; flex-wrap: wrap; align-items: end; }
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
  .ajout { display: grid; gap: 12px; padding: 14px 16px; background: var(--carte-2); border-radius: 10px; max-width: 640px; }
  .ajout label:not(.coche) { display: grid; gap: 5px; font-size: 13px; }
  .ajout input:not([type='checkbox']) { min-height: 40px; padding: 0 12px; border: 1px solid var(--trait); border-radius: 8px; background: var(--carte); font-size: 15px; }
  .coche { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; color: var(--encre-2); }
  .coche input { accent-color: var(--bleu); }
  .tbl { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { text-align: left; font-weight: 500; font-size: 10.5px; letter-spacing: 0.06em; text-transform: uppercase; color: var(--encre-3); padding: 9px 10px; border-bottom: 1px solid var(--trait); white-space: nowrap; }
  td { padding: 10px; border-bottom: 1px solid var(--trait-2); vertical-align: top; }
  td strong { font-weight: 500; display: block; }
  .sous { display: block; font-size: 12px; color: var(--encre-3); }
  .actions { text-align: right; min-width: 150px; }
  .actions .bt { margin: 0 0 4px 4px; }
  @media print {
    .panneau { display: none; }
  }
</style>
