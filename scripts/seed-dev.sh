#!/bin/sh
# Développement local UNIQUEMENT : crée un compte de test.
#   demo@exemple.ch  toutes les rubriques
# Mot de passe de test : demo-carnet-local  (jamais utilisé sur le serveur)
cd "$(dirname "$0")/../server" || exit 1
printf 'demo-carnet-local\n' | node --env-file-if-exists=../.env src/tools/users.ts add demo@exemple.ch "Démo locale" all
