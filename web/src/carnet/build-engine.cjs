// Construit engine.js à partir du script du prototype de Lionel (docs/prototype-carnet-afya.html),
// avec les seuls changements nécessaires pour passer des données de démonstration à Supabase.
//   node build-engine.cjs   (depuis web/src/carnet)
const fs = require('fs');
const html = fs.readFileSync('../../../docs/prototype-carnet-afya.html', 'utf8');
let s = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).sort((a, b) => b.length - a.length)[0];

const rep = (from, to) => {
  if (!s.includes(from)) throw new Error('Introuvable : ' + from.slice(0, 90));
  if (s.split(from).length > 2) throw new Error('Plusieurs fois : ' + from.slice(0, 90));
  s = s.replace(from, () => to);
};
const repRe = (re, to) => {
  if (!re.test(s)) throw new Error('Introuvable : ' + re);
  s = s.replace(re, () => to);
};

// Le prototype est une fonction auto-appelée ; ici, son corps est celui de startCarnet.
rep('(function(){\n"use strict";', '');
s = s.replace(/render\(\);\s*\}\)\(\);\s*$/, 'render();\n');

// Données : participants, ateliers et fiches viennent du serveur.
repRe(/const PARTS=\[[\s\S]*?\n\];/, 'const PARTS=view.participants;');
repRe(/const WORKSHOPS=\[[^\n]*\];/, 'const WORKSHOPS=view.workshops;');
repRe(/const APP_URL=[^\n]*;/, 'const APP_URL=location.origin+"/";');
repRe(/const QR_CDN=[^\n]*;/, 'const QR_CDN="/lib/qrcode.min.js";');
repRe(/const CDN=SELF_HOSTED\?\{[^}]*\}:\{[^}]*\};/, 'const CDN={h2c:"/lib/html2canvas.min.js",jspdf:"/lib/jspdf.umd.min.js"};');

// État : langue seule gardée dans le navigateur ; plus d'inscription ni de compte invité ici
// (l'inscription par le lien d'atelier est une page du socle, hors session).
repRe(/const KEY="afya-carnet-demo-v\d+";[\s\S]*?\{const m=\/\^#invite-[^\n]*\n/,
`const KEY="afya-carnet-lang";
const state={lang:"fr",role:view.role,view:view.role==="part"?"home":"overview",param:null,patients:view.patients,filters:{country:"",pid:"",period:"all"},draft:null,saving:false,invite:opts.invite||null,sent:false};
try{const l=localStorage.getItem(KEY);if(LANGS.includes(l))state.lang=l}catch(e){}
function persist(){try{localStorage.setItem(KEY,state.lang)}catch(e){}}
const ME=view.participant||{id:"",name:"",country:"",site:"",last:"",ws:null};
/** Comparaison avec le groupe et réseau AFYA, calculés sur le serveur. */
const GROUP=view.group||{cmp:null,network:{total:0,countries:{},cotm:null}};
/** Enregistre une fiche entière ; le serveur renvoie la version qu'il a gardée. */
async function save(pat){state.saving=true;try{return await opts.save(pat)}finally{state.saving=false}}
function keep(saved){state.patients=state.patients.some(x=>x.code===saved.code)?state.patients.map(x=>x.code===saved.code?saved:x):[saved,...state.patients];return saved}
`);

// Dates : jour local (le prototype passait par l'heure universelle et proposait parfois la veille).
rep('const iso=d=>d.toISOString().slice(0,10);', 'const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");');

// Coquille : la session est celle du socle ; boutons Sécurité, Comptes et Équipe.
rep('const app=document.getElementById("app");', 'const app=root;');
rep(' if(!state.role){app.innerHTML=state.view==="register"?registerView():loginView();bindView();return}\n',
  ' if(opts.mode==="register"){app.innerHTML=state.sent?sentView():registerView();bindView();return}\n');
rep('  <button class="pill-btn" data-act="logout">${t("logout")}</button>',
`  \${opts.isAdmin?\`<button class="pill-btn" data-act="team">\${t("team")}</button><button class="pill-btn" data-act="admin">\${t("accounts")}</button>\`:""}
  <button class="pill-btn" data-act="security">\${t("security")}</button>
  <button class="pill-btn" data-act="logout">\${t("logout")}</button>`);
rep(' <div class="demo-banner"><div class="wrap"><span>${t("demo")}</span><button data-act="reset">${t("reset")}</button></div></div>\n',
  ' ${opts.notice?`<div class="demo-banner"><div class="wrap"><span>${esc(opts.notice)}</span></div></div>`:""}\n');
rep(' if(el.dataset.act==="logout"){state.role=null;state.view="home";persist();render();return}',
` if(el.dataset.act==="logout"){opts.onLogout();return}
 if(el.dataset.act==="security"){opts.onSecurity();return}
 if(el.dataset.act==="admin"){opts.onAdmin();return}
 if(el.dataset.act==="team"){opts.onTeam();return}`);
rep(' if(el.dataset.act==="reset"){state.patients=buildSample();try{localStorage.removeItem(KEY)}catch(_){}render();toast(t("reset"));return}\n', '');

// Réseau AFYA et comparaison avec le groupe : chiffres du serveur (le participant ne reçoit que ses fiches).
repRe(/function networkCard\(\)\{[\s\S]*?\n(?=function pathView)/,
`function networkCard(){const N=GROUP.network;const cs=Object.keys(N.countries);const c=cs.length;const cand=N.cotm;let cm="";
 if(cand){cm=\`<div class="cotm"><div class="small muted">\${t("cotm")}</div><b>\${t("type_"+cand.type)}, \${esc(cand.country)}</b>
   <div class="small">Wexner \${cand.wxPre??"n/a"} › \${cand.wxLast??"?"}\${cand.f8Pre!=null&&cand.f8Last!=null?\`, FIQ8 \${f2(cand.f8Pre)} › \${f2(cand.f8Last)}\`:""}\${cand.spType?\`, \${t("sp_"+cand.spType)}\`:""}</div>
   <div class="small muted">\${tf("cotmBy",{n:esc(cand.name)})}</div></div>\`}
 return\`<section class="card net"><h2>\${t("netTitle")}</h2><p style="margin:4px 0 8px">\${tf("netText",{n:\`<b>\${N.total}</b>\`,c:\`<b>\${c}</b>\`})}</p>
  <div class="chips">\${cs.map(k=>\`<span class="chip">\${esc(k)} \${N.countries[k]}</span>\`).join("")}</div>\${cm}</section>\`}
`);
rep('const me=stats(mine),gr=stats(state.patients);',
  'const me=stats(mine),G=GROUP.cmp,gr=G||{wxPre:null,wxLast:null,m12Pct:null,compPct:null};');
rep('`${f2(f8Mean(state.patients,"pre"))} › ${f2(f8Mean(state.patients,"m12"))}`',
  '`${f2(G?G.f8Pre:null)} › ${f2(G?G.f8M12:null)}`');
rep('${row(t("cmpFu"),pct(me.m12Pct),pct(gr.m12Pct))}${row(t("cmpComp"),pct(me.compPct),pct(gr.compPct))}',
  '${row(t("cmpFu"),pct(me.m12Pct),pct(gr.m12Pct))}${row(t("cmpComp"),pct(me.compPct),G?pct(gr.compPct):"n/a")}');
rep('<p class="small muted" style="margin:6px 0 0">${t("cmpNote")}</p></section>',
  '<p class="small muted" style="margin:6px 0 0">${t("cmpNote")}${G?"":" "+t("cmpMin")}</p></section>');

// Échanges avec le formateur : enregistrés sur le serveur.
rep(' if(!tr&&list.some(m=>m.from==="trainer"&&!m.read)){list.forEach(m=>{if(m.from==="trainer")m.read=true});persist()}',
  ' if(!tr&&list.some(m=>m.from==="trainer"&&!m.read)){opts.readFeedback(p.code).then(d=>{const q=state.patients.find(x=>x.code===p.code);if(q)q.fb=d.fb},()=>{})}');
repRe(/ if\(el\.dataset\.fbsend\|\|el\.dataset\.fbval\|\|el\.dataset\.fbkudos\)\{[\s\S]*?persist\(\);render\(\);return\}/,
` if(el.dataset.fbsend||el.dataset.fbval||el.dataset.fbkudos){const code=el.dataset.fbsend||el.dataset.fbval||el.dataset.fbkudos;
  const kind=el.dataset.fbsend?"msg":el.dataset.fbval?"val":"kudos";const tx=kind==="msg"?(document.getElementById("fb-text").value||"").trim():"";if(kind==="msg"&&!tx)return;
  if(state.saving)return;state.saving=true;
  opts.feedback(code,kind,tx).then(d=>{const q=state.patients.find(x=>x.code===code);if(q)q.fb=d.fb;render()},err=>toast(err.message||t("saveFail"))).finally(()=>{state.saving=false});return}`);

// Nouvelle fiche, intervention, suivi : enregistrés sur le serveur avant d'être affichés.
rep('  state.patients.unshift(pat);persist();state.draft=null;state.prev="patients";state.view="report";state.param=pat.code;render();window.scrollTo(0,0);toast(t("afterSave"))});',
`  if(state.saving)return;
  save(pat).then(saved=>{keep(saved);state.draft=null;state.prev="patients";state.view="report";state.param=saved.code;render();window.scrollTo(0,0);toast(t("afterSave"))},err=>toast(err.message||t("saveFail")))});`);
rep('const p=state.patients.find(x=>x.code===state.param);const g=n=>', 'const p=structuredClone(state.patients.find(x=>x.code===state.param));const g=n=>');
rep('  persist();state.draft=null;state.view="opreport";render();window.scrollTo(0,0);toast(t("opSaved"))});',
`  if(state.saving)return;
  save(p).then(saved=>{keep(saved);state.draft=null;state.view="opreport";render();window.scrollTo(0,0);toast(t("opSaved"))},err=>toast(err.message||t("saveFail")))});`);
rep('const{code,tp}=state.param;const p=state.patients.find(x=>x.code===code);', 'const{code,tp}=state.param;const p=structuredClone(state.patients.find(x=>x.code===code));');
repRe(/p\.comps=readComps\(\);p\.flag=document\.getElementById\("f-flag"\)\.checked;persist\(\);\n\s*state\.prev="patients";state\.view="patient";state\.param=code;render\(\);window\.scrollTo\(0,0\);toast\(t\("visitSaved"\)\)\}\)\}/,
`p.comps=readComps();p.flag=document.getElementById("f-flag").checked;
   if(state.saving)return;
   save(p).then(saved=>{keep(saved);state.prev="patients";state.view="patient";state.param=code;render();window.scrollTo(0,0);toast(t("visitSaved"))},err=>toast(err.message||t("saveFail")))})}`);

// Fiches de démonstration et inscription locale : remplacées par le serveur et la page d'inscription du socle.
repRe(/function buildSample\(\)\{[\s\S]*?\n(?=const KEY=)/, '');
// Inscription par le lien d'atelier (mode "register", sans session) : l'écran de Lionel, envoyé au
// serveur comme demande ; un administrateur la valide et transmet le mot de passe provisoire.
repRe(/ const rf=document\.getElementById\("rform"\);\n[\s\S]*?\n(?= const of=document\.getElementById\("oform"\);)/,
` const rf=document.getElementById("rform");
 if(rf)rf.addEventListener("submit",e=>{e.preventDefault();const v=id=>document.getElementById(id).value.trim();
  const first=v("r-first"),last=v("r-last"),mail=v("r-mail"),country=v("r-country"),hosp=v("r-hosp");
  if(!first||!last||!mail||!country||!hosp||!document.getElementById("r-ok").checked){document.getElementById("r-err").hidden=false;return}
  if(state.saving)return;state.saving=true;
  opts.register({first,last,email:mail,phone:v("r-phone"),country,hospital:hosp,specialty:v("r-spec"),workshop:v("r-ws"),consent:true})
   .then(()=>{state.sent=true;render();window.scrollTo(0,0)},err=>toast(err.message||t("saveFail"))).finally(()=>{state.saving=false})});
`);
rep(' if(el.dataset.act==="register"){state.view="register";state.invite=null;render();return}', '');
// Connexion de démonstration (invité, Google) : la connexion est celle du socle.
repRe(/ if\(el\.dataset\.act==="guest"&&[^\n]*\n if\(el\.dataset\.act==="guest"\)[^\n]*\n if\(el\.dataset\.act==="nologin"\)[^\n]*\n/, '');
repRe(/ if\(el\.dataset\.act==="tologin"\)\{[^\n]*\n/, ' if(el.dataset.act==="tologin"){opts.onLogin();return}\n');
rep('function registerView(){', `function sentView(){return\`<div class="login wrap"><div class="card">
  <div class="brand" style="gap:10px"><img class="brand-logo" style="height:54px" src="\${LOGO}" alt="AFYA Geneva"><span class="brand-name">Carnet <em>AFYA</em></span></div>
  <h1 style="margin:4px 0 0">\${t("regTitle")}</h1><p>\${t("regSent")}</p>
  <button type="button" class="btn ghost block" data-act="tologin">\${t("back")}</button></div></div>\`}
function registerView(){`);

// Toast dans le carnet.
rep('function toast(msg){const el=document.getElementById("toast");', 'function toast(msg){const el=toastEl;');

// Libellés ajoutés, dans les 4 langues.
const add = {
  'Français': 'security:"Sécurité",accounts:"Comptes",team:"Équipe",saveFail:"Enregistrement impossible. Réessayez.",cmpMin:"La comparaison s\'affiche dès que 5 participants ont saisi des patientes.",regSent:"Merci, votre demande est envoyée. Un formateur AFYA la valide et vous transmet votre identifiant et un mot de passe provisoire.",',
  'English': 'security:"Security",accounts:"Accounts",team:"Team",saveFail:"Could not save. Please try again.",cmpMin:"The comparison appears once 5 participants have entered patients.",regSent:"Thank you, your request has been sent. An AFYA trainer will approve it and send you your ID and a temporary password.",',
  'Kiswahili': 'security:"Usalama",accounts:"Akaunti",team:"Timu",saveFail:"Imeshindwa kuhifadhi. Jaribu tena.",cmpMin:"Ulinganisho unaonekana washiriki 5 wakishaingiza wagonjwa.",regSent:"Asante, ombi lako limetumwa. Mkufunzi wa AFYA atalithibitisha na kukutumia kitambulisho chako na nenosiri la muda.",',
  'አማርኛ': 'security:"ደህንነት",accounts:"መለያዎች",team:"ቡድን",saveFail:"ማስቀመጥ አልተቻለም። እንደገና ይሞክሩ።",cmpMin:"ንጽጽሩ የሚታየው 5 ተሳታፊዎች ታካሚዎችን ካስገቡ በኋላ ነው።",regSent:"እናመሰግናለን፣ ጥያቄዎ ተልኳል። የAFYA አሰልጣኝ ያጸድቀዋል፣ መለያ ቁጥርዎንና ጊዜያዊ የይለፍ ቃል ይልክልዎታል።",',
};
for (const [name, extra] of Object.entries(add)) rep(` langName:"${name}",`, ` langName:"${name}",${extra}`);

s = `// Carnet AFYA : moteur d'écrans repris du prototype de Lionel (docs/prototype-carnet-afya.html).
// Le rendu, les règles de calcul et les libellés sont ceux du prototype ; seuls changent la source
// des données (Supabase au lieu du navigateur) et la session (celle du socle).
// GÉNÉRÉ par build-engine.cjs : ne pas modifier à la main.

/**
 * @param {HTMLElement} root
 * @param {{ view: import('../lib/contract.ts').CarnetView, isAdmin: boolean, notice?: string,
 *   save: (p: object) => Promise<object>, feedback: (code: string, kind: string, text: string) => Promise<{fb: object[]}>,
 *   readFeedback: (code: string) => Promise<{fb: object[]}>,
 *   onLogout: () => void, onSecurity: () => void, onAdmin: () => void, onTeam: () => void }} opts
 */
export function startCarnet(root, opts) {
"use strict";
const view = opts.view;
const toastEl = document.createElement("div");
toastEl.className = "toast";
toastEl.hidden = true;
${s}
root.after(toastEl);
return () => toastEl.remove();
}
`;
fs.writeFileSync('engine.js', s);
console.log('engine.js', s.split('\n').length, 'lignes');
