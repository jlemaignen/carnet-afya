// Construit engine.js à partir du script du prototype (engine.body.js), avec les seuls
// changements nécessaires pour passer des données de démonstration à l'API.
const fs = require('fs');
let s = fs.readFileSync('engine.body.js', 'utf8');
const rep = (from, to) => {
  if (!s.includes(from)) throw new Error('Introuvable : ' + from.slice(0, 80));
  s = s.split(from).join(to);
};

// État : données reçues du serveur, langue seule gardée dans le navigateur.
rep(`const KEY="afya-carnet-demo-v2";
const state={lang:"fr",role:null,view:"home",param:null,patients:buildSample(),filters:{country:"",pid:"",period:"all"},draft:null};
try{const s=JSON.parse(localStorage.getItem(KEY)||"null");if(s&&s.patients){state.patients=s.patients;state.lang=s.lang||"fr"}}catch(e){}
function persist(){try{localStorage.setItem(KEY,JSON.stringify({patients:state.patients,lang:state.lang}))}catch(e){}}
const ME=PARTS[0];`,
`const KEY="afya-carnet-lang";
const state={lang:"fr",role:view.role,view:view.role==="part"?"home":"overview",param:null,patients:view.patients,filters:{country:"",pid:"",period:"all"},draft:null,saving:false};
try{const l=localStorage.getItem(KEY);if(l==="fr"||l==="en")state.lang=l}catch(e){}
function persist(){try{localStorage.setItem(KEY,state.lang)}catch(e){}}
const PARTS=view.participants;
const ME=view.participant||{id:"",name:"",country:"",site:""};
/** Enregistre une fiche entière ; le serveur renvoie la version qu'il a gardée. */
async function save(pat){state.saving=true;try{return await opts.save(pat)}finally{state.saving=false}}`);

// Coquille : logo servi par l'app, pas de bandeau de démo, boutons du compte.
rep(`const app=document.getElementById("app");`, `const app=root;`);
rep(` if(!state.role){app.innerHTML=loginView();return}\n`, ``);
rep(`<img class="brand-logo" src="DATAURI" alt="AFYA Geneva">`, `<img class="brand-logo" src="/logo-afya.png" alt="AFYA Geneva">`);
rep(`<span class="small muted">\${state.role==="part"?esc(ME.id):(state.lang==="fr"?"Formateur":"Trainer")}</span>`,
    `<span class="small muted">\${state.role==="part"?esc(ME.id):(state.lang==="fr"?"Formateur":"Trainer")}</span>`);
rep(`  <button class="pill-btn" data-act="logout">\${t("logout")}</button>`,
    `  \${opts.isAdmin?\`<button class="pill-btn" data-act="admin">\${t("accounts")}</button>\`:""}
  <button class="pill-btn" data-act="security">\${t("security")}</button>
  <button class="pill-btn" data-act="logout">\${t("logout")}</button>`);
rep(` <div class="demo-banner"><div class="wrap"><span>\${t("demo")}</span><button data-act="reset">\${t("reset")}</button></div></div>\n`, ``);
rep(` <main>`, ` \${opts.notice?\`<div class="demo-banner"><div class="wrap"><span>\${esc(opts.notice)}</span></div></div>\`:""}\n <main>`);

// Événements : plus de compte invité ni de démo, la session est celle du socle.
rep(` if(el.dataset.act==="guest"){state.role=el.dataset.role;state.view=state.role==="part"?"home":"overview";render();return}
 if(el.dataset.act==="nologin"){document.getElementById("lg-note").hidden=false;return}
 if(el.dataset.act==="logout"){state.role=null;render();return}
 if(el.dataset.act==="reset"){state.patients=buildSample();try{localStorage.removeItem(KEY)}catch(_){}render();toast(t("reset"));return}`,
` if(el.dataset.act==="logout"){opts.onLogout();return}
 if(el.dataset.act==="security"){opts.onSecurity();return}
 if(el.dataset.act==="admin"){opts.onAdmin();return}`);
rep(`app.addEventListener("click",e=>{
 const el=e.target.closest("[data-act],[data-nav],[data-open],[data-visit],[data-back],[data-addcomp],[data-rmcomp],[data-cancel],[data-copy]");if(!el)return;`,
`app.addEventListener("click",e=>{
 const el=e.target.closest("[data-act],[data-nav],[data-open],[data-visit],[data-back],[data-addcomp],[data-rmcomp],[data-cancel],[data-copy],[data-dl]");if(!el)return;
 if(el.hasAttribute("data-dl")){const blob=new Blob(["\ufeff"+document.getElementById("csv").value],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="carnet-afya-"+iso(TODAY)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return}`);
rep(`  <button class="btn primary" data-copy>\${t("copy")}</button></section>`,
    `  <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" data-dl>\${t("download")}</button><button class="btn" data-copy>\${t("copy")}</button></div></section>`);

// Nouvelle fiche : enregistrée sur le serveur avant d'être affichée.
rep(`  state.patients.unshift(pat);persist();state.draft=null;state.prev="patients";state.view="patient";state.param=pat.code;render();window.scrollTo(0,0);toast(t("saved"))});`,
`  if(state.saving)return;
  save(pat).then(saved=>{state.patients.unshift(saved);state.draft=null;state.prev="patients";state.view="patient";state.param=saved.code;render();window.scrollTo(0,0);toast(t("saved"))},err=>toast(err.message||t("saveFail")))});`);

// Suivi : copie modifiée, remplacée seulement si le serveur l'accepte.
rep(`   p.visits[tp]=st==="lost"?{status:"lost"}:readAssessment(vf,"v-",true);p.comps=readComps();p.flag=document.getElementById("f-flag").checked;persist();
   state.prev="patients";state.view="patient";state.param=code;render();window.scrollTo(0,0);toast(t("visitSaved"))})}`,
`   const next={...p,visits:{...p.visits,[tp]:st==="lost"?{status:"lost"}:readAssessment(vf,"v-",true)},comps:readComps(),flag:document.getElementById("f-flag").checked};
   if(state.saving)return;
   save(next).then(saved=>{state.patients=state.patients.map(x=>x.code===code?saved:x);state.prev="patients";state.view="patient";state.param=code;render();window.scrollTo(0,0);toast(t("visitSaved"))},err=>toast(err.message||t("saveFail")))})}`);

// Dates : jour local (le prototype passait par l'heure universelle et proposait la veille en Suisse).
rep(`const iso=d=>d.toISOString().slice(0,10);`, `const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");`);

// Toast dans le carnet, rendu final.
rep(`function toast(msg){const el=document.getElementById("toast");`, `function toast(msg){const el=toastEl;`);

// Libellés ajoutés (comptes, sécurité, téléchargement, erreur d'enregistrement).
rep(` none:"Aucune"\n},`, ` none:"Aucune",security:"Sécurité",accounts:"Comptes",download:"Télécharger le CSV",saveFail:"Enregistrement impossible. Réessayez."\n},`);
rep(` none:"None"\n}};`, ` none:"None",security:"Security",accounts:"Accounts",download:"Download CSV",saveFail:"Could not save. Please try again."\n}};`);

s = `// Carnet AFYA : moteur d'écrans repris du prototype validé (docs/prototype-carnet-afya.html).
// Le rendu, les règles de calcul et les libellés sont ceux du prototype ; seuls changent la source
// des données (API au lieu du navigateur) et la session (celle du socle).
// Généré par build-engine.cjs à partir du prototype : corriger ici, puis garder les deux en phase.

/**
 * @param {HTMLElement} root
 * @param {{ view: import('../lib/contract.ts').CarnetView, isAdmin: boolean, notice?: string,
 *   save: (p: object) => Promise<object>, onLogout: () => void, onSecurity: () => void, onAdmin: () => void }} opts
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
