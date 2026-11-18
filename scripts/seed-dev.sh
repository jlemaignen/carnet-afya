#!/bin/sh
# Développement local UNIQUEMENT : crée un compte de test.
#   participant@exemple.ch (Dr H. Girma, ETH) et formateur@exemple.ch, données fictives du prototype
# Mot de passe de test : demo-carnet-local  (jamais utilisé sur le serveur)
cd "$(dirname "$0")/../server" || exit 1
node --env-file-if-exists=../.env src/tools/seed-demo.ts
