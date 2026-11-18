#!/bin/sh
# Fichier DU SERVEUR (/opt/carnet-afya/receive-deploy.sh), installé à la main une fois.
# Appelé par poll-deploy.sh : lit une archive du code sur l'entrée standard, construit l'image et
# redémarre l'app. Si le build échoue, la version précédente est remise en place.
set -eu
DIR=/opt/carnet-afya
MAX_BYTES=52428800
umask 077
cd "$DIR"

exec 9>"$DIR/.deploy.lock"
flock -n 9 || { echo "Un déploiement est déjà en cours."; exit 1; }

TMP=$(mktemp -d "$DIR/incoming.XXXXXX")
trap 'rm -rf "$TMP"' EXIT

head -c "$MAX_BYTES" | tar -xzf - -C "$TMP" --no-same-owner --no-same-permissions
for f in Dockerfile server/package.json server/src/index.ts web/package.json REVISION; do
  [ -f "$TMP/$f" ] || { echo "Archive refusée : $f manquant."; exit 1; }
done
REV=$(head -c 40 "$TMP/REVISION" | tr -cd '0-9a-f')
echo "Version reçue : $REV"

rm -rf "$DIR/src.previous"
[ -d "$DIR/src" ] && mv "$DIR/src" "$DIR/src.previous"
mv "$TMP" "$DIR/src"
# Lisible par l'utilisateur "node" du conteneur (le dossier parent, lui, reste fermé aux autres).
chmod -R a+rX,go-w "$DIR/src"

restore() {
  docker builder prune -af --filter until=24h >/dev/null 2>&1 || true
  echo "Échec : retour à la version précédente."
  rm -rf "$DIR/src"
  [ -d "$DIR/src.previous" ] && mv "$DIR/src.previous" "$DIR/src"
  exit 1
}

docker network inspect ccag-edge >/dev/null 2>&1 || docker network create ccag-edge >/dev/null
docker compose build || restore

if [ ! -f "$DIR/.env" ]; then
  echo "Image construite, mais $DIR/.env n'existe pas : l'app n'est PAS démarrée."
  exit 1
fi

docker compose up -d || restore
i=0
until docker compose exec -T app wget -qO- http://127.0.0.1:3000/healthz >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 30 ]; then
    echo "L'app ne répond pas après le redémarrage. Derniers logs :"
    docker compose logs --tail 20 app 2>&1 | sed 's/^/  /'
    exit 1
  fi
  sleep 2
done
echo "$REV" > "$DIR/REVISION"
docker image prune -f >/dev/null
# Le cache de construction grossit à chaque version (3 Go en une semaine ont rempli le disque de 8 Go
# le 10.10.2026) : on ne garde que celui des dernières 24 h.
docker builder prune -af --filter until=24h >/dev/null 2>&1 || true
echo "Déployé : $REV"
