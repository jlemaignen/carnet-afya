# Carnet AFYA

Carnet de bord chirurgical des participants AFYA : sphinctéroplastie et cure de fistule
recto-vaginale (FRV). Chaque participant saisit ses patientes opérées, leurs difficultés et
complications, puis les suivis à 1, 6 et 12 mois (score de Wexner, qualité de vie FIQL, santé
sexuelle). Les formateurs voient l'ensemble, les cas signalés « à discuter » et exportent les
données pour l'analyse.

**Pas de Salesforce.** Les patientes AFYA ne sont pas des patientes du CCA. Aucune identité n'est
saisie : chaque patiente n'est connue que par un code (`ETH-2024-01-P001`), avec son âge et sa
parité.

## Architecture (depuis le 19.11.2026)

```
Navigateur ── Cloudflare Pages (interface Svelte, fichiers statiques)
     │
     └──────── Supabase, région Zurich (projet carnet-afya)
                 ├─ Auth : comptes, mot de passe, application d'authentification (TOTP)
                 ├─ Postgres : profiles, participants, patients, events (règles d'accès RLS)
                 └─ Edge Function carnet-api : seules écritures (fiches, comptes)
Cloudflare Worker (keepalive/) ── réveil quotidien du projet gratuit
```

- `web/` : Svelte 5 + Vite, aux couleurs AFYA. Les écrans du carnet viennent du prototype
  (`web/src/carnet/`). `web/src/lib/api.ts` parle à Supabase.
- `supabase/schema.sql` : tables, règles d'accès, fonctions. À coller dans SQL Editor (rejouable).
- `supabase/functions/carnet-api/` : la fonction serveur. `rules.ts` valide chaque fiche (champs
  inconnus écartés, valeurs bornées), `index.ts` vérifie le compte appelant, écrit avec la clé de
  service et gère les comptes. `scripts/bundle-function.mjs` en fait un seul fichier,
  `supabase/carnet-api.bundle.ts`, à coller dans l'éditeur de Supabase.
- `keepalive/worker.js` : Worker Cloudflare à déclencher chaque jour (cron `0 6 * * *`).

L'ancien serveur (Fastify, SQLite, Docker sur le serveur du CCA) est retiré : il reste dans
l'historique Git (commit 5563a71).

## Rôles

| Rôle | Voit | Fait |
|---|---|---|
| Participant | ses propres patientes | saisit les fiches et les suivis, signale un cas « à discuter » |
| Formateur | tous les participants, filtres pays, participant, période | revoit les cas signalés, suit les retards, exporte le CSV |
| Administrateur | comme le formateur | gère les comptes (bouton Comptes) |

Le filtrage se fait dans la base (RLS) : un participant ne reçoit jamais les fiches d'un autre,
même en interrogeant Supabase directement. Aucune écriture n'est possible depuis le navigateur :
tout passe par `carnet-api`, qui refuse un code hors du carnet du compte.

## Sécurité

- Compte nominatif, mot de passe de 12 caractères au moins (réglage Supabase Auth), mot de passe
  provisoire à changer à la première connexion.
- Application d'authentification facultative pour tous, **obligatoire pour gérer les comptes** :
  la fonction exige une session confirmée par le code (`aal2`), et un code saisi à l'instant pour
  donner ou retirer le rôle administrateur.
- Compte désactivé : banni dans Supabase Auth et exclu par les règles d'accès.
- Inscriptions libres fermées : seuls les administrateurs créent des comptes.
- En-têtes de sécurité (CSP, HSTS…) servis par Cloudflare (`web/public/_headers`).
- Journal des écritures et des actions d'administration : table `events` (lisible dans Supabase).

## Mise en ligne (une fois)

1. **Supabase, SQL Editor** : coller `supabase/schema.sql`, Run.
2. **Supabase, Edge Functions** : Deploy a new function, Via Editor, nom `carnet-api`, coller
   `supabase/carnet-api.bundle.ts`, Deploy.
3. **Premier administrateur** : Authentication, Users, Add user, Create new user (adresse, mot de
   passe, Auto Confirm). Puis SQL Editor :
   `update profiles set is_admin = true, sections = '{formateur}' where email = 'prenom.nom@…';`
4. **Cloudflare Pages** : Workers & Pages, Create, Pages, Connect to Git, dépôt `carnet-afya`,
   branche `main`, Framework preset « Svelte » ou aucun, Build command `npm run build`, Build output
   `dist`, Root directory `web`. Variable `NODE_VERSION` = `24`.
5. **Supabase, Authentication, URL Configuration** : Site URL et Redirect URLs = l'adresse
   Cloudflare (`https://carnet-afya.pages.dev`).
6. **Cloudflare Workers** : Create Worker, coller `keepalive/worker.js`, Deploy, puis Settings,
   Triggers, Cron `0 6 * * *`.

Ensuite : chaque push sur `main` met l'interface à jour (Cloudflare). Une modification de la
fonction se redéploie en recollant le fichier généré.

## Participants

Les identifiants AFYA se gèrent dans Supabase, Table Editor, table `participants` : `id`
(`AFYA / ETH / 2024 / 01`), nom, pays, site, et `user_id` = le compte du participant (liste
déroulante). Un compte participant non rattaché voit un message l'invitant à contacter un formateur.

## Développement

```bash
cd web && npm install && npm run dev        # http://localhost:5173, sur le projet Supabase
node --test supabase/functions/carnet-api/rules.test.ts
node scripts/bundle-function.mjs            # après toute modification de la fonction
```

## Points à trancher

- **Données de santé** pseudonymisées chez Supabase (Zurich) : accord d'AFYA, DPA signé.
- **FIQL** : la traduction française est une traduction de travail, à remplacer par la version
  validée (note déjà affichée).
- **Connexion Google** : affichée dans le prototype, non proposée.
- **Adresse** : `carnet-afya.pages.dev`, ou un domaine AFYA.
