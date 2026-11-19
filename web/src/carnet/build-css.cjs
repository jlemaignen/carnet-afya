// Construit carnet.css à partir des feuilles de style du prototype (docs/prototype-carnet-afya.html) :
// chaque sélecteur est limité à .afya, pour que le socle (connexion, sécurité, comptes) garde les siennes.
//   node build-css.cjs   (depuis web/src/carnet)
const fs = require('fs');
const html = fs.readFileSync('../../../docs/prototype-carnet-afya.html', 'utf8');
// La plus grande feuille est celle de l'app ; la première n'est qu'une remise à zéro de l'outil de Lionel.
const css = [...html.matchAll(/<style>([\s\S]*?)<\/style>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];

/** body, html, :root sont l'élément .afya ; tout le reste devient un descendant de .afya. */
function scopeSelector(sel) {
  return sel
    .split(',')
    .map((s) => {
      s = s.trim();
      if (!s) return s;
      if (/^:root\b/.test(s)) return s; // variables de couleur : gardées globales (mêmes valeurs que le socle)
      if (/^(html|body)\b/.test(s)) return s.replace(/^(html|body)/, '.afya');
      if (s === '*') return '.afya, .afya *';
      return '.afya ' + s;
    })
    .join(',');
}

/** Parcourt les blocs { } ; les @media et @supports sont parcourus, @keyframes et @font-face laissés tels quels. */
function scope(text) {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const open = text.indexOf('{', i);
    if (open < 0) {
      out += text.slice(i);
      break;
    }
    const head = text.slice(i, open);
    const prelude = head.trim();
    // fin du bloc correspondant
    let depth = 1;
    let j = open + 1;
    while (j < text.length && depth) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') depth--;
      j++;
    }
    const body = text.slice(open + 1, j - 1);
    const lead = head.slice(0, head.length - head.trimStart().length);
    if (prelude.startsWith('@media') || prelude.startsWith('@supports')) out += `${lead}${prelude}{${scope(body)}}`;
    else if (prelude.startsWith('@')) out += `${lead}${prelude}{${body}}`;
    else out += `${lead}${scopeSelector(prelude)}{${body}}`;
    i = j;
  }
  return out;
}

// Commentaires retirés avant découpage (ils peuvent contenir des virgules ou des accolades).
const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
const out =
  '/* CSS du prototype Carnet AFYA (docs/prototype-carnet-afya.html), limitée à .afya.\n' +
  '   Générée par build-css.cjs : ne pas modifier à la main. */\n' +
  scope(clean).replace(/\n{3,}/g, '\n\n') +
  '\n';
fs.writeFileSync('carnet.css', out);
console.log('carnet.css', out.split('\n').length, 'lignes');
