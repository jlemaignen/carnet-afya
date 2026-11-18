#!/bin/sh
# Fichier DU SERVEUR (/opt/carnet-afya/poll-deploy.sh), lancé chaque minute par systemd
# (carnet-afya-deploy.timer). Le serveur va chercher lui-même : aucun port n'est ouvert pour GitHub.
#
# GitHub Actions avance la branche "production" seulement quand les tests de main ont réussi.
# Ici : si cette branche a bougé, on télécharge cette version (clé SSH en LECTURE SEULE sur ce seul
# dépôt) et on la passe à receive-deploy.sh, qui construit l'image et redémarre l'app.
set -eu
DIR=/opt/carnet-afya
REMOTE=git@github.com:cca-it/dashboard-carnet-afya.git
BRANCH=production
export GIT_SSH_COMMAND="ssh -i $HOME/.ssh/carnet_afya_deploy -o IdentitiesOnly=yes -o BatchMode=yes -o StrictHostKeyChecking=yes -o UserKnownHostsFile=$DIR/github_known_hosts"
umask 077
cd "$DIR"

exec 8>"$DIR/.poll.lock"
flock -n 8 || exit 0

NEW=$(git ls-remote "$REMOTE" "refs/heads/$BRANCH" | cut -f1)
[ -n "$NEW" ] || exit 0
[ "$NEW" = "$(cat "$DIR/REVISION.seen" 2>/dev/null || true)" ] && exit 0

echo "$(date '+%F %T') nouvelle version $NEW"
[ -d "$DIR/repo.git" ] || git init -q --bare "$DIR/repo.git"
git --git-dir="$DIR/repo.git" fetch -q --depth 1 "$REMOTE" "$NEW"

TMP=$(mktemp -d "$DIR/checkout.XXXXXX")
trap 'rm -rf "$TMP"' EXIT
git --git-dir="$DIR/repo.git" archive "$NEW" | tar -x -C "$TMP"
echo "$NEW" > "$TMP/REVISION"
# Notée comme vue avant le build : une version qui échoue n'est pas reconstruite chaque minute.
echo "$NEW" > "$DIR/REVISION.seen"

if tar -czf - -C "$TMP" . | "$DIR/receive-deploy.sh"; then
  echo "$(date '+%F %T') OK $NEW"
else
  echo "$(date '+%F %T') ECHEC $NEW"
  exit 1
fi
