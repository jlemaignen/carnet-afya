# Carnet AFYA

Carnet de bord chirurgical des participants AFYA : sphinctéroplastie et cure de fistule
recto-vaginale (FRV). Chaque participant saisit ses patientes opérées, leurs difficultés et
complications, puis les suivis à 1, 6 et 12 mois (score de Wexner, qualité de vie FIQL, santé
sexuelle). Les formateurs voient l'ensemble, les cas signalés « à discuter » et exportent les
données pour l'analyse.

Même socle que les autres apps du CCA (dépôt `cca-it/dashboard-comite-medical`, lui-même issu de
`cca-it/dashboard-comite`) : comptes nominatifs, application d'authentification facultative,
administrateurs, mot de passe oublié par e-mail, déploiement continu.

**Pas de Salesforce.** Les patientes AFYA ne sont pas des patientes du CCA. Aucune identité n'est
saisie : chaque patiente n'est connue que par un code (`ETH-2024-01-P001`), avec son âge et sa
parité.

## État au 18.11.2026

- **Socle** repris tel quel de `main` (commit 70b94c1) : comptes, sécurité, administration,
  déploiement. Les noms sont passés de « comité médical » à « carnet-afya ».
- **Front** : le prototype validé est conservé à l'identique dans
  `docs/prototype-carnet-afya.html`, avec ses données fictives. C'est la référence visuelle :
  le front Svelte doit le reproduire au pixel près (mêmes couleurs, polices, écrans).
- **Pas encore fait** : le portage des écrans en Svelte, l'API des patientes et la base. Le front
  Svelte actuel est encore celui du socle (connexion, comptes, accueil vide).

## Architecture

```
Navigateur -- https://<domaine> --> Caddy (partagé, /opt/ccag-auto-planning) --> app (Fastify + Svelte)
```

- `server/` : Node 24 + Fastify, TypeScript exécuté directement. SQLite (`node:sqlite`) pour les
  comptes, le journal et le carnet.
- `web/` : Svelte 5 + Vite, aux couleurs AFYA (bleu `#194a6f`, rose `#d06397`), polices Space
  Grotesk et Atkinson Hyperlegible, français et anglais.

## Rôles

| Rôle | Voit | Fait |
|---|---|---|
| Participant | ses propres patientes | saisit les fiches et les suivis, signale un cas « à discuter » |
| Formateur | tous les participants, filtres pays, participant, période | revoit les cas signalés, suit les retards, exporte le CSV |
| Administrateur | comme le formateur | gère les comptes (socle) et rattache chaque participant à son identifiant AFYA |

Le filtrage se fait sur le serveur : un participant ne reçoit jamais les fiches d'un autre.

## Données (à construire)

Reprises du prototype, une table par objet :

- `participants` : identifiant AFYA (`AFYA / ETH / 2024 / 01`), nom, pays, site, compte lié.
- `patients` : code, participant, âge, parité, hôpital, date, type (`SP`, `RVF`, `BOTH`),
  origine, difficultés peropératoires, précisions, cas à discuter.
- `complications` : patiente, type, date, grade de Clavien-Dindo.
- `visits` : patiente, temps (`pre`, `d30`, `m6`, `m12`), 5 items de Wexner, réponses FIQL,
  santé sexuelle, continence, statut (revue ou perdue de vue).

Les échéances (1 mois = 30 j, 6 mois = 182 j, 12 mois = 365 j, « en retard » au-delà de 30 j) et
les scores (Wexner total, quatre échelles FIQL) sont calculés sur le serveur avec les mêmes règles
que le prototype, pour que l'export et les écrans donnent les mêmes chiffres.

## API (à construire)

| Méthode | Route | Rôle |
|---|---|---|
| GET | `/api/carnet/patients` | participant : les siennes ; formateur : toutes, filtrées |
| POST, PUT | `/api/carnet/patients/:code` | participant propriétaire |
| PUT | `/api/carnet/patients/:code/visits/:tp` | participant propriétaire |
| GET | `/api/carnet/stats` | KPI, Wexner par temps, FIQL, répartition, activité par trimestre |
| GET | `/api/carnet/export.csv` | formateur, une ligne par patiente, variables stables |

## Points à trancher avant la mise en ligne

- **Hébergement et responsable des données** : le serveur `ccag-equipe` appartient au CCA. Des
  données de santé pseudonymisées de patientes AFYA y seraient stockées : à valider avec AFYA
  (qui est responsable, quel accord).
- **FIQL** : la traduction française est une traduction de travail, à remplacer par la version
  validée (note déjà affichée dans le prototype).
- **Polices** : la politique de sécurité interdit toute ressource externe. Space Grotesk et
  Atkinson Hyperlegible doivent être servies par l'app, pas par Google Fonts.
- **Connexion Google** : le prototype l'affiche, le socle ne la propose pas. À retirer ou à ajouter.
- **Domaine** : par exemple `carnet.afya-geneva.org` ou un sous-domaine du CCA.

## Sécurité

- Compte nominatif (adresse email), mot de passe **argon2id**, 12 caractères minimum.
- Second facteur FACULTATIF : application d'authentification (TOTP, RFC 6238), activée par la
  personne depuis le bouton « Sécurité ». Une fois activée, le mot de passe seul n'ouvre plus de
  session. Code à usage unique (anti-rejeu), 5 essais, lié par cookie au navigateur qui a saisi le
  mot de passe. Secret chiffré en base (AES-256-GCM, clé dérivée de `SESSION_SECRET` : changer
  `SESSION_SECRET` oblige tout le monde à réactiver). Téléphone perdu : `users.ts totp-reset`.
- Cookie de session signé HMAC, `__Host-`, httpOnly, Secure, SameSite=Strict, 8 h. Le compte est
  relu à chaque requête : désactivation ou nouveau mot de passe coupent les sessions ouvertes.
- 10 tentatives par minute et par IP, verrou de 15 min par compte après 8 échecs, même message
  pour compte inconnu et mauvais mot de passe.
- CSP stricte sans ressource externe, HSTS, `Referrer-Policy: no-referrer`.
- Journal : connexions, échecs, activations du second facteur, consultations (`users.ts journal`).
- Mot de passe oublié (si un envoi d'e-mails est configuré, voir `MAIL_TRANSPORT`) : lien à usage
  unique valable 30 minutes, envoyé à l'adresse du compte. Même réponse que le compte existe ou non,
  au plus 3 demandes par heure et par compte, une nouvelle demande annule la précédente. Seule
  l'empreinte SHA-256 du jeton est gardée en base, et le jeton voyage après le `#` de l'adresse
  (absent des journaux du serveur et du proxy). Si l'application d'authentification est activée, son
  code reste exigé. Le nouveau mot de passe coupe toutes les sessions. Sans envoi d'e-mails, le lien
  n'est pas proposé et un administrateur réinitialise depuis la fenêtre Comptes.

## Développement

```bash
cp .env.example .env   # puis SESSION_SECRET (openssl rand -base64 48)
cd server && npm install && npm test
cd ../web && npm install && npm run build
cd .. && sh scripts/seed-dev.sh     # compte de test, voir le script
cd server && npm run dev            # http://localhost:3030
```

## Comptes

```bash
docker compose exec app node src/tools/users.ts add prenom.nom@exemple.ch "Prénom Nom" all
docker compose exec app node src/tools/users.ts list | password | totp-reset | disable | enable | delete | journal
```

### Administrateurs

Un administrateur gère les comptes des autres depuis l'app (bouton « Comptes ») : ajouter une
personne, choisir ses rubriques, désactiver ou réactiver, donner un nouveau mot de passe provisoire,
retirer l'application d'authentification (téléphone perdu).

- Un administrateur peut nommer un autre administrateur ou lui retirer le rôle, en confirmant par un
  code de son application d'authentification saisi à l'instant. Personne ne retire son propre rôle.
  Le premier administrateur se nomme sur le serveur : `users.ts admin <email> on|off`.
- Les autres actions sont sans effet sur un compte administrateur : il faut d'abord lui retirer le rôle.
  Seule exception : un administrateur choisit ses propres rubriques (bouton « Mes rubriques »).
- La gestion des comptes exige que l'application d'authentification de l'administrateur soit activée.
- Aucun mot de passe n'est choisi par l'administrateur : le serveur en tire un provisoire, affiché
  une seule fois, que la personne remplace à sa première connexion.
- Pas de suppression depuis l'app (désactivation seulement). Chaque action est au journal avec son auteur.

## Mise en production

Serveur `ccag-equipe` (une seule fois) :

1. `/opt/carnet-afya/` : y copier les fichiers de `deploy/server/`, puis créer `.env`
   (`PUBLIC_BASE_URL`, `SESSION_SECRET`), en `chmod 600`. Pour « Mot de passe oublié » :
   `MAIL_TRANSPORT=smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM`.
2. Clé SSH `~/.ssh/carnet_afya_deploy` ajoutée au dépôt GitHub comme *deploy key* en lecture
   seule, `carnet-afya-deploy.service` et `.timer` dans `/etc/systemd/system/`, timer activé.
3. DNS du domaine choisi vers 16.18.191.10 et bloc dans le Caddyfile de `/opt/ccag-auto-planning` :
   ```
   {$CARNET_AFYA_DOMAIN} {
   	encode zstd gzip
   	reverse_proxy carnet-afya-app:3000
   }
   ```

## Déploiement continu

Le pare-feu AWS ne laisse pas GitHub joindre le serveur : c'est le serveur qui va chercher.

1. Un push sur `main` lance `.github/workflows/deploy.yml` : tests du serveur et du front.
2. S'ils réussissent, le workflow avance la branche `production` sur ce commit.
3. Chaque minute, le serveur compare cette branche à la dernière version vue
   (`deploy/server/poll-deploy.sh`), télécharge le code, construit l'image et redémarre l'app.

Si le build échoue, la version précédente est remise en place. Le résultat est dans
`/opt/carnet-afya/deploy.log` sur le serveur (GitHub, lui, ne voit que les tests).
Le `docker-compose.yml` et le `.env` restent sur le serveur et ne viennent jamais du dépôt.
