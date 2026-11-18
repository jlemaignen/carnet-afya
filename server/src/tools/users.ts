// Gestion des comptes nominatifs (un compte par personne, identifié par son adresse email).
//
//   node src/tools/users.ts list
//   node src/tools/users.ts add <email> "<Nom affiché>" <rubriques>   (mot de passe demandé, non affiché)
//   node src/tools/users.ts sections <email> <rubriques>              (effet immédiat)
//   node src/tools/users.ts password <email>                          (coupe les sessions ouvertes)
//   node src/tools/users.ts totp-reset <email>                        (retire l'application d'authentification : téléphone perdu)
//   node src/tools/users.ts admin <email> on|off                      (administrateur : gère les comptes des autres depuis l'app)
//   node src/tools/users.ts disable <email> | enable <email>
//   node src/tools/users.ts delete <email>                            (supprime le compte, le journal reste)
//   node src/tools/users.ts journal                                   (50 derniers événements)
//
// <rubriques> : liste séparée par des virgules (voir SECTIONS dans contract.ts) ou "all" pour tout.
// Sur le serveur : docker compose exec app node src/tools/users.ts add prenom.nom@exemple.ch "Prénom Nom" all
import { stdin, stdout } from 'node:process';
import { MIN_PASSWORD_LENGTH, hashPassword } from '../auth.ts';
import { Repository, userSections } from '../db.ts';
import { parseSections } from '../sections.ts';

const repo = new Repository(process.env.DB_PATH ?? './data/carnet-afya.db');
const [cmd, email, arg2, arg3] = process.argv.slice(2);

/** Lecture du mot de passe sans écho dans le terminal. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!stdin.isTTY) {
      let data = '';
      stdin.setEncoding('utf8');
      stdin.on('data', (c) => (data += c));
      stdin.on('end', () => resolve(data.split('\n')[0]));
      return;
    }
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let value = '';
    const onData = (ch: string) => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.pause();
        stdin.off('data', onData);
        stdout.write('\n');
        resolve(value);
      } else if (ch === '\u0003') {
        stdin.setRawMode(false);
        reject(new Error('annulé'));
      } else if (ch === '\u007f') {
        value = value.slice(0, -1);
      } else {
        value += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function newPassword(): Promise<string> {
  const p1 = await askHidden('Mot de passe : ');
  if (p1.length < MIN_PASSWORD_LENGTH) throw new Error(`Au moins ${MIN_PASSWORD_LENGTH} caractères.`);
  if (stdin.isTTY) {
    const p2 = await askHidden('Confirmer : ');
    if (p1 !== p2) throw new Error('Les deux saisies diffèrent.');
  }
  return hashPassword(p1);
}

function need(e: string | undefined) {
  if (!e) throw new Error('Adresse email manquante.');
  const row = repo.findUserByEmail(e);
  if (!row) throw new Error(`Compte inconnu : ${e}`);
  return row;
}

try {
  switch (cmd) {
    case 'list':
      console.table(
        repo.listUsers().map((u) => ({
          email: u.email, nom: u.display_name, rubriques: userSections(u).join(','), actif: !u.disabled, admin: u.is_admin ? 'oui' : 'non', authentificateur: u.totp_secret ? 'oui' : 'non', 'mot de passe provisoire': u.must_change_password ? 'oui' : 'non', 'dernière connexion': u.last_login_at ?? '',
        })),
      );
      break;
    case 'add': {
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Adresse email invalide.');
      if (!arg2) throw new Error('Nom affiché manquant.');
      if (!arg3) throw new Error('Rubriques manquantes (ex. all).');
      const sections = parseSections(arg3);
      if (repo.findUserByEmail(email)) throw new Error('Ce compte existe déjà.');
      repo.createUser(email.toLowerCase(), arg2, await newPassword(), sections, true);
      console.log(`Compte ${email} créé, rubriques : ${sections.join(', ')}. Mot de passe provisoire : à changer à la première connexion.`);
      break;
    }
    case 'sections': {
      const u = need(email);
      if (!arg2) throw new Error('Rubriques manquantes (ex. all).');
      const sections = parseSections(arg2);
      repo.setSections(u.id, sections);
      console.log(`Rubriques de ${u.email} : ${sections.join(', ') || 'aucune'}.`);
      break;
    }
    case 'password': {
      const u = need(email);
      repo.setPassword(u.id, await newPassword(), Date.now(), true);
      repo.log('password_reset', u.id);
      console.log(`Mot de passe de ${u.email} réinitialisé, sessions ouvertes coupées. Il est provisoire : à changer à la prochaine connexion.`);
      break;
    }
    case 'admin': {
      const u = need(email);
      if (arg2 !== 'on' && arg2 !== 'off') throw new Error('Précisez on ou off.');
      repo.setAdmin(u.id, arg2 === 'on');
      repo.log(arg2 === 'on' ? 'admin_granted' : 'admin_revoked', u.id);
      console.log(arg2 === 'on'
        ? `${u.email} est administrateur. La gestion des comptes exige que son application d'authentification soit activée.`
        : `${u.email} n'est plus administrateur.`);
      break;
    }
    case 'totp-reset': {
      const u = need(email);
      repo.clearTotp(u.id);
      repo.log('totp_reset', u.id);
      console.log(`Application d'authentification retirée pour ${u.email} : connexion par mot de passe seul jusqu'à réactivation.`);
      break;
    }
    case 'disable':
    case 'enable': {
      const u = need(email);
      repo.setDisabled(u.id, cmd === 'disable');
      console.log(`Compte ${u.email} ${cmd === 'disable' ? 'désactivé' : 'réactivé'}.`);
      break;
    }
    case 'delete': {
      const u = need(email);
      repo.deleteUser(u.id);
      console.log(`Compte ${u.email} supprimé.`);
      break;
    }
    case 'journal':
      console.table(repo.recentEvents());
      break;
    default:
      console.log('Usage : users.ts list | add <email> "<Nom>" <rubriques> | sections <email> <rubriques> | password <email> | totp-reset <email> | admin <email> on|off | disable <email> | enable <email> | delete <email> | journal');
  }
} catch (e) {
  console.error((e as Error).message);
  process.exitCode = 1;
}
