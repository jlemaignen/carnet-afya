// Carnet AFYA : moteur d'écrans repris du prototype validé (docs/prototype-carnet-afya.html).
// Le rendu, les règles de calcul et les libellés sont ceux du prototype ; seuls changent la source
// des données (API au lieu du navigateur) et la session (celle du socle).
// Généré par build-engine.cjs à partir du prototype : corriger ici, puis garder les deux en phase.

/**
 * @param {HTMLElement} root
 * @param {{ view: import('../../../server/src/contract.ts').CarnetView, isAdmin: boolean, notice?: string,
 *   save: (p: object) => Promise<object>, onLogout: () => void, onSecurity: () => void, onAdmin: () => void }} opts
 */
export function startCarnet(root, opts) {
"use strict";
const view = opts.view;
const toastEl = document.createElement("div");
toastEl.className = "toast";
toastEl.hidden = true;

/* ---------- i18n ---------- */
const T={
fr:{
 tagline:"Carnet de bord chirurgical des participants AFYA : sphinctéroplastie et fistules recto-vaginales.",
 email:"Adresse e-mail",password:"Mot de passe",login:"Connexion",google:"Continuer avec Google",or:"ou",
 guestTitle:"Découvrir avec des données fictives",guestPart:"Entrer comme participant",guestTrainer:"Entrer comme formateur",
 loginNote:"Prototype : la connexion n'est pas encore active.",
 demo:"Démo, données fictives. Vos saisies restent dans ce navigateur.",reset:"Réinitialiser la démo",logout:"Quitter",
 home:"Accueil",patients:"Patientes",add:"Nouvelle",stats:"Résultats",overview:"Vue globale",participants:"Participants",review:"À revoir",export:"Export",
 hello:"Bonjour",kPatients:"patientes opérées",kWexner:"Wexner moyen préop. puis dernier suivi",kComp:"avec complication",kM12:"revues à 12 mois",
 todo:"Suivis à faire",noTodo:"Aucun suivi en attente.",newPatient:"Nouvelle patiente",seeAll:"Tout voir",
 due:"à faire",late:"en retard",done:"fait",lost:"perdue de vue",
 tp_pre:"Préop.",tp_d30:"1 mois",tp_m6:"6 mois",tp_m12:"12 mois",
 type_SP:"Sphinctéroplastie",type_RVF:"Cure de FRV",type_BOTH:"Sphinctéroplastie + FRV",
 sIdent:"Identification",code:"Code patiente",age:"Âge",parity:"Parité",hospital:"Hôpital",date:"Date de l'intervention",
 sInter:"Intervention",type:"Type d'intervention",origin:"Origine de la lésion",
 o_obst:"Obstétricale",o_trauma:"Traumatique",o_sv:"Violences sexuelles",o_cong:"Congénitale",o_other:"Autre",
 sDiff:"Difficultés et complications",diffs:"Difficultés peropératoires",
 d_expo:"Exposition",d_edges:"Identification des berges sphinctériennes",d_scar:"Tissus cicatriciels",d_bleed:"Saignement",d_time:"Durée",d_mat:"Matériel manquant",d_help:"Absence d'aide",d_other:"Autre",
 diffNote:"Précisions (facultatif)",comps:"Complications postopératoires",addComp:"Ajouter une complication",noComp:"Aucune complication déclarée.",
 c_inf:"Infection",c_dehis:"Déhiscence",c_bleed:"Saignement",c_rvf:"FRV (récidive ou de novo)",c_fail:"Échec",c_other:"Autre",
 compType:"Complication",compDate:"Date",grade:"Clavien-Dindo",remove:"Retirer",
 flag:"J'aimerais discuter ce cas avec un formateur",flagged:"À discuter",
 sPre:"Évaluation préopératoire",sVisit:"Évaluation",
 wexner:"Score de Wexner",wxScale:"0 jamais, 1 rarement (moins d'1 fois par mois), 2 parfois (moins d'1 fois par semaine), 3 habituellement (moins d'1 fois par jour), 4 toujours (au moins 1 fois par jour)",
 wx1:"Selles solides",wx2:"Selles liquides",wx3:"Gaz",wx4:"Port de protection",wx5:"Retentissement sur le mode de vie",total:"Total",
 fiql:"Qualité de vie (FIQL)",answered:"réponses",fiqlNote:"Traduction de travail. À remplacer par la version française validée avant toute utilisation réelle.",
 sc_life:"Mode de vie",sc_cope:"Comportement",sc_dep:"Dépression",sc_emb:"Gêne",
 sex:"Santé sexuelle",sexActive:"Activité sexuelle",yes:"Oui",no:"Non",sexReason:"Si non, pourquoi ?",
 r_inc:"Peur ou gêne liée à l'incontinence",r_pain:"Douleur",r_part:"Pas de partenaire",r_choice:"Choix personnel",r_other:"Autre",
 dysp:"Dyspareunie",fear:"Peur d'une incontinence pendant les rapports",
 outcome:"Résultat",continence:"Continence",c_yes:"Continente",c_better:"Amélioration",c_no:"Pas d'amélioration",
 status:"Statut",seen:"Revue",lostfu:"Perdue de vue",
 save:"Enregistrer",cancel:"Annuler",saved:"Fiche enregistrée",visitSaved:"Suivi enregistré",
 enterVisit:"Saisir",back:"Retour",timeline:"Suivi",complications:"Complications",
 required:"Renseignez l'âge, la date et le type d'intervention.",
 wxEvol:"Wexner moyen par temps de suivi",fiqlEvol:"FIQL moyen : préop. et 12 mois",lower:"plus bas = meilleur",higher:"plus haut = meilleur",
 byType:"Répartition des interventions",activity:"Interventions par trimestre",
 country:"Pays",participant:"Participant",period:"Période",all:"Tous",allTime:"Toute la période",last12:"12 derniers mois",
 tParticipants:"participants actifs",flaggedCases:"Cas à discuter",overdue:"Suivis en retard",noFlag:"Aucun cas signalé.",
 colN:"Patientes",colComp:"Compl.",colWx:"Wexner pré > dernier",colM12:"Revues M12",colLate:"En retard",
 exportTitle:"Export des données",exportText:"Une ligne par patiente, avec les scores de chaque temps de suivi. Les noms de variables sont stables pour l'analyse et la fusion avec la base CRF.",
 copy:"Copier le CSV",copied:"CSV copié",copyFail:"Copie bloquée : le texte est sélectionné, copiez-le avec Ctrl+C.",dict:"Dictionnaire de données",
 surgeon:"Chirurgien",days:"j",since:"depuis",opened:"Opérée le",
 none:"Aucune",security:"Sécurité",accounts:"Comptes",download:"Télécharger le CSV",saveFail:"Enregistrement impossible. Réessayez."
},
en:{
 tagline:"Surgical logbook for AFYA participants: sphincteroplasty and rectovaginal fistula.",
 email:"Email address",password:"Password",login:"Sign in",google:"Continue with Google",or:"or",
 guestTitle:"Explore with sample data",guestPart:"Enter as participant",guestTrainer:"Enter as trainer",
 loginNote:"Prototype: sign-in is not active yet.",
 demo:"Demo with sample data. Your entries stay in this browser.",reset:"Reset demo",logout:"Leave",
 home:"Home",patients:"Patients",add:"New",stats:"Outcomes",overview:"Overview",participants:"Participants",review:"To review",export:"Export",
 hello:"Hello",kPatients:"patients operated",kWexner:"Mean Wexner pre-op, then latest follow-up",kComp:"with a complication",kM12:"seen at 12 months",
 todo:"Follow-ups due",noTodo:"No follow-up pending.",newPatient:"New patient",seeAll:"See all",
 due:"due",late:"overdue",done:"done",lost:"lost to follow-up",
 tp_pre:"Pre-op",tp_d30:"1 month",tp_m6:"6 months",tp_m12:"12 months",
 type_SP:"Sphincteroplasty",type_RVF:"RVF repair",type_BOTH:"Sphincteroplasty + RVF",
 sIdent:"Identification",code:"Patient code",age:"Age",parity:"Parity",hospital:"Hospital",date:"Date of surgery",
 sInter:"Surgery",type:"Procedure",origin:"Cause of the injury",
 o_obst:"Obstetric",o_trauma:"Traumatic",o_sv:"Sexual violence",o_cong:"Congenital",o_other:"Other",
 sDiff:"Difficulties and complications",diffs:"Intra-operative difficulties",
 d_expo:"Exposure",d_edges:"Finding the sphincter ends",d_scar:"Scar tissue",d_bleed:"Bleeding",d_time:"Duration",d_mat:"Missing equipment",d_help:"No assistant",d_other:"Other",
 diffNote:"Details (optional)",comps:"Post-operative complications",addComp:"Add a complication",noComp:"No complication reported.",
 c_inf:"Infection",c_dehis:"Wound dehiscence",c_bleed:"Bleeding",c_rvf:"RVF (recurrent or new)",c_fail:"Failure",c_other:"Other",
 compType:"Complication",compDate:"Date",grade:"Clavien-Dindo",remove:"Remove",
 flag:"I would like to discuss this case with a trainer",flagged:"To discuss",
 sPre:"Pre-operative assessment",sVisit:"Assessment",
 wexner:"Wexner score",wxScale:"0 never, 1 rarely (less than once a month), 2 sometimes (less than once a week), 3 usually (less than once a day), 4 always (at least once a day)",
 wx1:"Solid stool",wx2:"Liquid stool",wx3:"Gas",wx4:"Wears a pad",wx5:"Lifestyle alteration",total:"Total",
 fiql:"Quality of life (FIQL)",answered:"answered",fiqlNote:"Working text. Check against the original validated wording before real use.",
 sc_life:"Lifestyle",sc_cope:"Coping",sc_dep:"Depression",sc_emb:"Embarrassment",
 sex:"Sexual health",sexActive:"Sexually active",yes:"Yes",no:"No",sexReason:"If not, why?",
 r_inc:"Fear or embarrassment due to incontinence",r_pain:"Pain",r_part:"No partner",r_choice:"Personal choice",r_other:"Other",
 dysp:"Dyspareunia",fear:"Fear of incontinence during intercourse",
 outcome:"Outcome",continence:"Continence",c_yes:"Continent",c_better:"Improved",c_no:"Not improved",
 status:"Status",seen:"Seen",lostfu:"Lost to follow-up",
 save:"Save",cancel:"Cancel",saved:"Record saved",visitSaved:"Follow-up saved",
 enterVisit:"Enter",back:"Back",timeline:"Follow-up",complications:"Complications",
 required:"Fill in age, date and procedure.",
 wxEvol:"Mean Wexner by follow-up time",fiqlEvol:"Mean FIQL: pre-op and 12 months",lower:"lower = better",higher:"higher = better",
 byType:"Procedures",activity:"Procedures per quarter",
 country:"Country",participant:"Participant",period:"Period",all:"All",allTime:"All time",last12:"Last 12 months",
 tParticipants:"active participants",flaggedCases:"Cases to discuss",overdue:"Overdue follow-ups",noFlag:"No flagged case.",
 colN:"Patients",colComp:"Compl.",colWx:"Wexner pre > latest",colM12:"Seen M12",colLate:"Overdue",
 exportTitle:"Data export",exportText:"One row per patient, with scores at each follow-up time. Variable names are stable for analysis and merging with the CRF database.",
 copy:"Copy CSV",copied:"CSV copied",copyFail:"Copy blocked: the text is selected, copy it with Ctrl+C.",dict:"Data dictionary",
 surgeon:"Surgeon",days:"d",since:"since",opened:"Operated on",
 none:"None",security:"Security",accounts:"Accounts",download:"Download CSV",saveFail:"Could not save. Please try again."
}};
/* ---------- FIQL ---------- */
const FQ_Q2={fr:"À cause des fuites de selles, à quelle fréquence ceci vous concerne-t-il ?",en:"Due to accidental bowel leakage, how much of the time is this a concern for you?"};
const FQ_Q3={fr:"À cause des fuites de selles, êtes-vous d'accord avec ces phrases ?",en:"Due to accidental bowel leakage, how much do you agree with these statements?"};
const FQ_ITEMS=[
 {id:"q1",g:"q1",fr:"De manière générale, diriez-vous que votre santé est :",en:"In general, would you say your health is:"},
 {id:"q2a",g:"q2",fr:"J'ai peur de sortir",en:"I am afraid to go out"},
 {id:"q2b",g:"q2",fr:"J'évite de rendre visite à des amis",en:"I avoid visiting friends"},
 {id:"q2c",g:"q2",fr:"J'évite de passer la nuit hors de chez moi",en:"I avoid staying overnight away from home"},
 {id:"q2d",g:"q2",fr:"J'ai du mal à sortir pour des activités (marché, lieu de culte...)",en:"It is difficult for me to get out and do things (market, church...)"},
 {id:"q2e",g:"q2",fr:"Je mange moins avant de sortir",en:"I cut down on how much I eat before I go out"},
 {id:"q2f",g:"q2",fr:"Hors de chez moi, je reste le plus possible près des toilettes",en:"Whenever I am away from home, I try to stay near a toilet"},
 {id:"q2g",g:"q2",fr:"J'organise mes journées en fonction de mon transit",en:"I plan my daily activities around my bowel pattern"},
 {id:"q2h",g:"q2",fr:"J'évite de voyager",en:"I avoid traveling"},
 {id:"q2i",g:"q2",fr:"J'ai peur de ne pas arriver aux toilettes à temps",en:"I worry about not being able to get to the toilet in time"},
 {id:"q2j",g:"q2",fr:"J'ai l'impression de ne pas contrôler mes intestins",en:"I feel I have no control over my bowels"},
 {id:"q2k",g:"q2",fr:"Je ne peux pas me retenir assez longtemps pour aller aux toilettes",en:"I can't hold my bowel movement long enough to get to the toilet"},
 {id:"q2l",g:"q2",fr:"J'ai des fuites de selles sans m'en rendre compte",en:"I leak stool without even knowing it"},
 {id:"q2m",g:"q2",fr:"J'essaie d'éviter les accidents en restant très près des toilettes",en:"I try to prevent accidents by staying very near a toilet"},
 {id:"q3a",g:"q3",fr:"J'ai honte",en:"I feel ashamed"},
 {id:"q3b",g:"q3",fr:"Je ne peux pas faire beaucoup de choses que j'aimerais faire",en:"I cannot do many of the things I want to do"},
 {id:"q3c",g:"q3",fr:"Je m'inquiète des accidents de selles",en:"I worry about bowel accidents"},
 {id:"q3d",g:"q3",fr:"Je me sens déprimée",en:"I feel depressed"},
 {id:"q3e",g:"q3",fr:"J'ai peur que les autres sentent une odeur de selles sur moi",en:"I worry about others smelling stool on me"},
 {id:"q3f",g:"q3",fr:"Je ne me sens pas en bonne santé",en:"I feel like I am not a healthy person"},
 {id:"q3g",g:"q3",fr:"J'apprécie moins la vie",en:"I enjoy life less"},
 {id:"q3h",g:"q3",fr:"J'ai des rapports sexuels moins souvent que je le voudrais",en:"I have sex less often than I would like to"},
 {id:"q3i",g:"q3",fr:"Je me sens différente des autres",en:"I feel different from other people"},
 {id:"q3j",g:"q3",fr:"La possibilité d'un accident est toujours dans mon esprit",en:"The possibility of bowel accidents is always on my mind"},
 {id:"q3k",g:"q3",fr:"J'ai peur d'avoir des rapports sexuels",en:"I am afraid to have sex"},
 {id:"q3l",g:"q3",fr:"J'évite les longs trajets (bus, train, avion)",en:"I avoid traveling by bus, train or plane"},
 {id:"q3m",g:"q3",fr:"J'évite d'aller manger dehors",en:"I avoid going out to eat"},
 {id:"q3n",g:"q3",fr:"Dans un lieu nouveau, je repère d'abord où sont les toilettes",en:"Whenever I go someplace new, I locate where the toilets are"},
 {id:"q4",g:"q4",fr:"Au cours du dernier mois, vous êtes-vous sentie triste, découragée ou désespérée au point de vous demander si quelque chose en valait la peine ?",en:"During the past month, have you felt so sad, discouraged or hopeless that you wondered if anything was worthwhile?"}
];
const FQ_OPTS={
 q1:{fr:["Excellente","Très bonne","Bonne","Moyenne","Mauvaise"],en:["Excellent","Very good","Good","Fair","Poor"],v:[5,4,3,2,1]},
 q2:{fr:["La plupart du temps","Parfois","Rarement","Jamais","Non applicable"],en:["Most of the time","Some of the time","A little of the time","None of the time","Not apply"],v:[1,2,3,4,null]},
 q3:{fr:["Tout à fait d'accord","Plutôt d'accord","Plutôt pas d'accord","Pas du tout d'accord","Non applicable"],en:["Strongly agree","Somewhat agree","Somewhat disagree","Strongly disagree","Not apply"],v:[1,2,3,4,null]},
 q4:{fr:["Extrêmement","Beaucoup","Assez","Un peu, assez pour me gêner","Un petit peu","Pas du tout"],en:["Extremely so","Very much so","Quite a bit","Some, enough to bother me","A little bit","Not at all"],v:[1,2,3,4,5,6]}
};
const FQ_SCALES={
 life:["q2a","q2b","q2c","q2d","q2e","q2g","q2h","q3b","q3l","q3m"],
 cope:["q2f","q2i","q2j","q2k","q2m","q3c","q3h","q3j","q3n"],
 dep:["q1","q3d","q3f","q3g","q3i","q3k","q4"],
 emb:["q2l","q3a","q3e"]
};
function fiqlScores(ans){const out={};if(!ans)return null;for(const k in FQ_SCALES){const vals=FQ_SCALES[k].map(id=>ans[id]).filter(v=>typeof v==="number");out[k]=vals.length?vals.reduce((a,b)=>a+b,0)/vals.length:null}return out}
function fiqlMean(ans){const s=fiqlScores(ans);if(!s)return null;const v=Object.values(s).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
const wxTotal=w=>w&&w.length===5&&w.every(v=>typeof v==="number")?w.reduce((a,b)=>a+b,0):null;
const wxS=w=>{const v=wxTotal(w);return v==null?"n/a":v};

/* ---------- constants ---------- */
const TPS=["pre","d30","m6","m12"];const TP_DAYS={d30:30,m6:182,m12:365};
const ORIGINS=["obst","trauma","sv","cong","other"];const DIFFS=["expo","edges","scar","bleed","time","mat","help","other"];
const COMPS=["inf","dehis","bleed","rvf","fail","other"];const GRADES=["I","II","IIIa","IIIb","IV","V"];
const TODAY=new Date();TODAY.setHours(0,0,0,0);
const iso=d=>d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");const addDays=(s,n)=>{const d=new Date(s+"T00:00:00");d.setDate(d.getDate()+n);return d};
const fmtDate=s=>{if(!s)return"";const d=new Date(s+"T00:00:00");return d.toLocaleDateString(state.lang==="fr"?"fr-CH":"en-GB",{day:"numeric",month:"short",year:"numeric"})};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- state ---------- */
const KEY="afya-carnet-lang";
const state={lang:"fr",role:view.role,view:view.role==="part"?"home":"overview",param:null,patients:view.patients,filters:{country:"",pid:"",period:"all"},draft:null,saving:false};
try{const l=localStorage.getItem(KEY);if(l==="fr"||l==="en")state.lang=l}catch(e){}
function persist(){try{localStorage.setItem(KEY,state.lang)}catch(e){}}
const PARTS=view.participants;
const ME=view.participant||{id:"",name:"",country:"",site:""};
/** Enregistre une fiche entière ; le serveur renvoie la version qu'il a gardée. */
async function save(pat){state.saving=true;try{return await opts.save(pat)}finally{state.saving=false}}
const t=k=>(T[state.lang][k]??k);
const L=o=>o[state.lang];

/* ---------- derived ---------- */
function tpStatus(p,tp){if(p.visits[tp])return p.visits[tp].status==="lost"?"lost":"done";if(tp==="pre")return"done";
 const due=addDays(p.date,TP_DAYS[tp]);const diff=(TODAY-due)/864e5;if(diff>30)return"late";if(diff>=-7)return"due";return"future"}
function dueFor(p){return["d30","m6","m12"].map(tp=>({tp,s:tpStatus(p,tp),due:iso(addDays(p.date,TP_DAYS[tp]))})).filter(x=>x.s==="due"||x.s==="late")}
function lastVisit(p){for(const tp of ["m12","m6","d30"]){if(p.visits[tp]&&p.visits[tp].status!=="lost")return{tp,v:p.visits[tp]}}return null}
function stats(list){
 const n=list.length;const comp=list.filter(p=>p.comps.length).length;
 const pre=list.map(p=>wxTotal(p.visits.pre&&p.visits.pre.wexner)).filter(v=>v!=null);
 const lastL=list.map(p=>{const l=lastVisit(p);return l?wxTotal(l.v.wexner):null}).filter(v=>v!=null);
 const eligible12=list.filter(p=>addDays(p.date,TP_DAYS.m12+30)<=TODAY);const seen12=eligible12.filter(p=>p.visits.m12&&p.visits.m12.status==="seen");
 const late=list.reduce((a,p)=>a+dueFor(p).filter(x=>x.s==="late").length,0);
 const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
 return{n,comp,compPct:n?comp/n:0,wxPre:mean(pre),wxLast:mean(lastL),m12Pct:eligible12.length?seen12.length/eligible12.length:null,m12Den:eligible12.length,late,
  byType:{SP:list.filter(p=>p.type==="SP").length,RVF:list.filter(p=>p.type==="RVF").length,BOTH:list.filter(p=>p.type==="BOTH").length}}
}
const f1=v=>v==null?"n/a":v.toFixed(1);const pct=v=>v==null?"n/a":Math.round(v*100)+" %";

/* ---------- icons ---------- */
const IC={
 home:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
 list:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/></svg>',
 add:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
 chart:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/></svg>',
 users:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/></svg>',
 flag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4h11l-2 4 2 4H5"/></svg>',
 dl:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M7 10l5 5 5-5M4 21h16"/></svg>'
};

/* ---------- render shell ---------- */
const app=root;
function render(){
 document.documentElement.lang=state.lang;
 const tabs=state.role==="part"
  ?[["home","home"],["patients","list"],["add","add"],["stats","chart"]]
  :[["overview","chart"],["participants","users"],["review","flag"],["export","dl"]];
 const active=state.view==="patient"||state.view==="visit"?(state.role==="part"?"patients":"review"):state.view;
 app.innerHTML=`
 <header class="topbar"><div class="wrap">
  <div class="brand"><img class="brand-logo" src="/logo-afya.png" alt="AFYA Geneva"><span class="brand-name">Carnet</span></div>
  <span class="small muted">${state.role==="part"?esc(ME.id):(state.lang==="fr"?"Formateur":"Trainer")}</span>
  <span class="spacer"></span>
  <button class="pill-btn" data-act="lang" aria-label="Language">${state.lang==="fr"?"EN":"FR"}</button>
  ${opts.isAdmin?`<button class="pill-btn" data-act="admin">${t("accounts")}</button>`:""}
  <button class="pill-btn" data-act="security">${t("security")}</button>
  <button class="pill-btn" data-act="logout">${t("logout")}</button>
 </div></header>
 ${opts.notice?`<div class="demo-banner"><div class="wrap"><span>${esc(opts.notice)}</span></div></div>`:""}
 <main><div class="wrap" id="view">${viewHTML()}</div></main>
 <nav class="tabbar" aria-label="Navigation"><div class="wrap">${tabs.map(([v,ic])=>`<button class="tab${v==="add"?" add":""}" data-nav="${v}" ${active===v?'aria-current="page"':""}>${IC[ic]}<span>${t(v)}</span></button>`).join("")}</div></nav>`;
 bindView();
}
function viewHTML(){
 switch(state.view){
  case"home":return homeView();case"patients":return patientsView();case"add":return patientForm();case"stats":return statsView(state.patients.filter(p=>p.pid===ME.id),false);
  case"patient":return patientView(state.param);case"visit":return visitForm(state.param.code,state.param.tp);
  case"overview":return overviewView();case"participants":return participantsView();case"review":return reviewView();case"export":return exportView();
 }return""}

/* ---------- participant views ---------- */
const typeChip=ty=>`<span class="chip ${ty==="SP"?"sp":ty==="RVF"?"rvf":"both"}">${t("type_"+ty)}</span>`;
function homeView(){
 const mine=state.patients.filter(p=>p.pid===ME.id);const s=stats(mine);
 const todo=mine.flatMap(p=>dueFor(p).map(x=>({p,...x}))).sort((a,b)=>a.due.localeCompare(b.due));
 return`
 <div class="section-head"><h1>${t("hello")}, ${esc(ME.name)}</h1><span class="small muted">${esc(ME.site)}</span></div>
 <button class="btn primary block" data-nav="add">${IC.add.replace('<svg','<svg width="20" height="20"')} ${t("newPatient")}</button>
 <div class="kpis">
  <div class="kpi"><b>${s.n}</b><span>${t("kPatients")}</span></div>
  <div class="kpi"><b>${f1(s.wxPre)} › ${f1(s.wxLast)}</b><span>${t("kWexner")}</span></div>
  <div class="kpi"><b>${pct(s.compPct)}</b><span>${t("kComp")}</span></div>
  <div class="kpi"><b>${pct(s.m12Pct)}</b><span>${t("kM12")}</span></div>
 </div>
 <section class="card"><div class="section-head"><h2>${t("todo")}</h2><span class="chip ${todo.some(x=>x.s==="late")?"late":"due"}">${todo.length}</span></div>
  <div class="list">${todo.length?todo.map(x=>`<button class="row" data-visit="${x.p.code}" data-tp="${x.tp}">
   <div class="grow"><div class="title">${esc(x.p.code)}</div><div class="small muted">${t("tp_"+x.tp)}, ${fmtDate(x.due)}</div></div>
   <span class="chip ${x.s}">${t(x.s)}</span><span class="chev">›</span></button>`).join(""):`<p class="empty">${t("noTodo")}</p>`}</div>
 </section>
 <section class="card"><div class="section-head"><h2>${t("patients")}</h2><button class="pill-btn" data-nav="patients">${t("seeAll")}</button></div>
  <div class="list">${mine.slice(0,4).map(patientRow).join("")}</div></section>`}
function patientRow(p){const lv=lastVisit(p);const late=dueFor(p).some(x=>x.s==="late");
 return`<button class="row" data-open="${p.code}"><div class="grow"><div class="title">${esc(p.code)}</div>
 <div class="small muted">${fmtDate(p.date)}${lv?`, Wexner ${wxS(p.visits.pre.wexner)} › ${wxS(lv.v.wexner)} (${t("tp_"+lv.tp)})`:""}</div></div>
 <div class="chips">${typeChip(p.type)}${p.comps.length?`<span class="chip late">${t("complications").slice(0,5)}.</span>`:""}${late?`<span class="chip late">${t("late")}</span>`:""}${p.flag?`<span class="chip due">${t("flagged")}</span>`:""}</div><span class="chev">›</span></button>`}
function patientsView(){const mine=state.patients.filter(p=>p.pid===ME.id);
 return`<div class="section-head"><h1>${t("patients")}</h1><span class="muted small">${mine.length}</span></div>
 <section class="card"><div class="list">${mine.map(patientRow).join("")}</div></section>`}

function patientView(code){
 const p=state.patients.find(x=>x.code===code);if(!p)return"";
 const part=PARTS.find(x=>x.id===p.pid);
 return`<button class="back" data-back>‹ ${t("back")}</button>
 <div class="section-head"><h1>${esc(p.code)}</h1>${typeChip(p.type)}</div>
 <div class="card small" style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px">
  <div><span class="muted">${t("opened")}</span><br><b>${fmtDate(p.date)}</b></div>
  <div><span class="muted">${t("hospital")}</span><br><b>${esc(p.hospital)}</b></div>
  <div><span class="muted">${t("age")} / ${t("parity")}</span><br><b>${p.age} / ${p.parity}</b></div>
  <div><span class="muted">${t("origin")}</span><br><b>${t("o_"+p.origin)}</b></div>
  ${state.role==="trainer"?`<div><span class="muted">${t("surgeon")}</span><br><b>${esc(part.name)}</b></div>`:""}
  ${p.diffs.length?`<div style="grid-column:1/-1"><span class="muted">${t("diffs")}</span><br><b>${p.diffs.map(d=>t("d_"+d)).join(", ")}</b>${p.diffNote?`<br>${esc(p.diffNote)}`:""}</div>`:""}
 </div>
 ${p.flag?`<div class="note">${t("flag")}</div>`:""}
 <section class="card"><h2>${t("complications")}</h2>
  ${p.comps.length?`<div class="list">${p.comps.map(c=>`<div class="row"><div class="grow"><div class="title">${t("c_"+c.type)}</div><div class="small muted">${fmtDate(c.date)}</div></div><span class="chip late">Clavien ${esc(c.grade)}</span></div>`).join("")}</div>`:`<p class="empty">${t("noComp")}</p>`}
 </section>
 <section><h2 style="margin-bottom:10px">${t("timeline")}</h2><div class="tl">${TPS.map(tp=>{
  const s=tpStatus(p,tp);const v=p.visits[tp];const fs=v&&fiqlScores(v.fiql);
  const when=tp==="pre"?fmtDate(p.date):fmtDate(iso(addDays(p.date,TP_DAYS[tp])));
  return`<div class="tp ${s}"><span class="dot"></span><div style="min-width:0"><div><b>${t("tp_"+tp)}</b> <span class="small muted">${when}</span></div>
   ${v&&v.status!=="lost"?`<div class="scores"><span>Wexner <b>${wxS(v.wexner)}</b>/20</span><span>FIQL <b>${f1(fiqlMean(v.fiql))}</b></span>${v.continence?`<span>${t("c_"+v.continence)}</span>`:""}</div>
    <div class="small muted">${["life","cope","dep","emb"].map(k=>t("sc_"+k)+" "+f1(fs[k])).join(", ")}</div>`:
    `<div class="small muted">${s==="lost"?t("lost"):s==="future"?"":t(s)}</div>`}</div>
   ${tp!=="pre"&&state.role==="part"&&(s==="due"||s==="late"||s==="future"||s==="done")?`<button class="pill-btn" data-visit="${p.code}" data-tp="${tp}">${t("enterVisit")}</button>`:"<span></span>"}</div>`}).join("")}</div></section>`}

/* ---------- forms ---------- */
function seg(name,opts,val,cls=""){return`<div class="seg ${cls}" role="radiogroup">${opts.map(([v,l],i)=>`<input type="radio" id="${name}-${i}" name="${name}" value="${v}" ${String(val)===String(v)?"checked":""}><label for="${name}-${i}">${l}</label>`).join("")}</div>`}
function assessmentBlock(prefix,v,withOutcome){
 v=v||{};const wx=v.wexner||[];const fq=v.fiql||{};const sx=v.sex||{};
 const nAns=Object.keys(fq).length;
 return`
 <fieldset><legend>${t("wexner")}</legend><p class="legend-scale" style="margin:0">${t("wxScale")}</p>
  ${[1,2,3,4,5].map(i=>`<div class="wx-item"><span class="lab"><b>${t("wx"+i)}</b></span>${seg(prefix+"wx"+i,[0,1,2,3,4].map(n=>[n,n]),wx[i-1],"num")}</div>`).join("")}
  <div class="total"><span>${t("total")}</span><b><span id="${prefix}wxt">${wx.reduce((a,b)=>a+(+b||0),0)}</span> / 20</b></div>
 </fieldset>
 <fieldset><legend>${t("fiql")}</legend>
  <details class="fiql"><summary><span>29 questions</span><span class="chip ${nAns===29?"ok":"due"}"><span id="${prefix}fqn">${nAns}</span>/29 ${t("answered")}</span></summary><div class="body">
   <p class="note" style="margin:0">${t("fiqlNote")}</p>
   ${FQ_ITEMS.map((it,ix)=>{const o=FQ_OPTS[it.g];const head=(it.id==="q2a"?`<p style="margin:8px 0 0"><b>${L(FQ_Q2)}</b></p>`:it.id==="q3a"?`<p style="margin:8px 0 0"><b>${L(FQ_Q3)}</b></p>`:"");
    return head+`<div class="fq"><span class="q">${ix+1}. ${L(it)}</span>${seg(prefix+"fq_"+it.id,o.v.map((val,i)=>[val===null?"na":val,L(o)[i]]),fq[it.id]===null?"na":fq[it.id])}</div>`}).join("")}
  </div></details>
  <div class="small muted" id="${prefix}fqs">${fiqlLine(fq)}</div>
 </fieldset>
 <fieldset><legend>${t("sex")}</legend>
  <div class="field"><span class="lab">${t("sexActive")}</span>${seg(prefix+"sxa",[["1",t("yes")],["0",t("no")]],sx.active==null?"":sx.active?"1":"0")}</div>
  <div class="field" id="${prefix}sxr-wrap" ${sx.active===false?"":"hidden"}><span class="lab">${t("sexReason")}</span>${seg(prefix+"sxr",["inc","pain","part","choice","other"].map(r=>[r,t("r_"+r)]),sx.reason)}</div>
  <div class="field"><span class="lab">${t("dysp")}</span>${seg(prefix+"sxd",[["1",t("yes")],["0",t("no")]],sx.dysp==null?"":sx.dysp?"1":"0")}</div>
  <div class="field"><span class="lab">${t("fear")}</span>${seg(prefix+"sxf",[["1",t("yes")],["0",t("no")]],sx.fear==null?"":sx.fear?"1":"0")}</div>
 </fieldset>
 ${withOutcome?`<fieldset><legend>${t("outcome")}</legend>
  <div class="field"><span class="lab">${t("continence")}</span>${seg(prefix+"cont",["yes","better","no"].map(c=>[c,t("c_"+c)]),v.continence)}</div>
 </fieldset>`:""}`}
function fiqlLine(fq){const s=fiqlScores(fq);if(!s||!Object.keys(fq).length)return"";return["life","cope","dep","emb"].map(k=>t("sc_"+k)+" "+f1(s[k])).join(", ")}
function nextCode(){const mine=state.patients.filter(p=>p.pid===ME.id);const n=mine.reduce((m,p)=>Math.max(m,parseInt(p.code.split("-P")[1],10)||0),0)+1;
 return ME.id.split(" / ").slice(1).join("-")+"-P"+String(n).padStart(3,"0")}
function compRows(list){return list.map((c,i)=>`<div class="comp-row" data-ci="${i}">
  <div class="field"><label for="cp-t-${i}">${t("compType")}</label><select id="cp-t-${i}" data-cf="type">${COMPS.map(x=>`<option value="${x}" ${c.type===x?"selected":""}>${t("c_"+x)}</option>`).join("")}</select></div>
  <div class="field"><label for="cp-d-${i}">${t("compDate")}</label><input id="cp-d-${i}" type="date" data-cf="date" value="${esc(c.date)}"></div>
  <div class="field"><label for="cp-g-${i}">${t("grade")}</label><select id="cp-g-${i}" data-cf="grade">${GRADES.map(g=>`<option ${c.grade===g?"selected":""}>${g}</option>`).join("")}</select></div>
  <button type="button" class="icon-btn" data-rmcomp="${i}" aria-label="${t("remove")}">×</button></div>`).join("")}
function patientForm(){
 if(!state.draft)state.draft={comps:[]};const d=state.draft;
 return`<h1>${t("newPatient")}</h1>
 <form id="pform" novalidate>
 <fieldset><legend>${t("sIdent")}</legend>
  <div class="field"><span class="lab">${t("code")}</span><span class="title" style="font-family:var(--display);font-size:1.2rem">${nextCode()}</span></div>
  <div class="grid2"><div class="field"><label for="f-age">${t("age")}</label><input id="f-age" type="number" inputmode="numeric" min="10" max="90"></div>
  <div class="field"><label for="f-par">${t("parity")}</label><input id="f-par" type="number" inputmode="numeric" min="0" max="20"></div></div>
  <div class="grid2"><div class="field"><label for="f-hosp">${t("hospital")}</label><input id="f-hosp" type="text" value="${esc(ME.site)}"></div>
  <div class="field"><label for="f-date">${t("date")}</label><input id="f-date" type="date" value="${iso(TODAY)}"></div></div>
 </fieldset>
 <fieldset><legend>${t("sInter")}</legend>
  <div class="field"><span class="lab">${t("type")}</span>${seg("f-type",["SP","RVF","BOTH"].map(x=>[x,t("type_"+x)]),"")}</div>
  <div class="field"><span class="lab">${t("origin")}</span>${seg("f-orig",ORIGINS.map(o=>[o,t("o_"+o)]),"obst")}</div>
 </fieldset>
 <fieldset><legend>${t("sDiff")}</legend>
  <div class="field"><span class="lab">${t("diffs")}</span><div class="checks">${DIFFS.map((x,i)=>`<input type="checkbox" id="f-d-${i}" name="f-diff" value="${x}"><label for="f-d-${i}">${t("d_"+x)}</label>`).join("")}</div></div>
  <div class="field"><label for="f-dnote">${t("diffNote")}</label><textarea id="f-dnote"></textarea></div>
  <div class="field"><span class="lab">${t("comps")}</span><div id="comps" style="display:flex;flex-direction:column;gap:10px">${compRows(d.comps)}</div>
   <button type="button" class="btn ghost" data-addcomp>+ ${t("addComp")}</button></div>
  <label class="switch"><input type="checkbox" id="f-flag"> ${t("flag")}</label>
 </fieldset>
 <h2>${t("sPre")}</h2>
 ${assessmentBlock("p-",null,false)}
 <p class="note" id="f-err" hidden>${t("required")}</p>
 <div class="savebar"><button type="button" class="btn ghost" data-cancel>${t("cancel")}</button><button type="submit" class="btn primary" style="flex:1">${t("save")}</button></div>
 </form>`}
function visitForm(code,tp){const p=state.patients.find(x=>x.code===code);const v=p.visits[tp];
 return`<button class="back" data-back>‹ ${t("back")}</button>
 <div class="section-head"><h1>${esc(code)}</h1><span class="chip">${t("tp_"+tp)}</span></div>
 <form id="vform" novalidate>
  <fieldset><legend>${t("status")}</legend>${seg("v-status",[["seen",t("seen")],["lost",t("lostfu")]],v?v.status:"seen")}</fieldset>
  <div id="v-body" ${v&&v.status==="lost"?"hidden":""} style="display:flex;flex-direction:column;gap:18px">${assessmentBlock("v-",v,true)}</div>
  <fieldset><legend>${t("comps")}</legend><div id="comps" style="display:flex;flex-direction:column;gap:10px">${compRows(state.draft.comps)}</div>
   <button type="button" class="btn ghost" data-addcomp>+ ${t("addComp")}</button>
   <label class="switch"><input type="checkbox" id="f-flag" ${p.flag?"checked":""}> ${t("flag")}</label></fieldset>
  <div class="savebar"><button type="button" class="btn ghost" data-back>${t("cancel")}</button><button type="submit" class="btn primary" style="flex:1">${t("save")}</button></div>
 </form>`}
function readAssessment(form,prefix,withOutcome){
 const g=n=>{const el=form.querySelector(`input[name="${prefix+n}"]:checked`);return el?el.value:null};
 const wexner=[1,2,3,4,5].map(i=>{const v=g("wx"+i);return v==null?null:+v});
 const fiql={};FQ_ITEMS.forEach(it=>{const v=g("fq_"+it.id);if(v!=null)fiql[it.id]=v==="na"?null:+v});
 const a=g("sxa");const sex={active:a==null?null:a==="1",reason:a==="0"?g("sxr"):null,dysp:g("sxd")==null?null:g("sxd")==="1",fear:g("sxf")==null?null:g("sxf")==="1"};
 const out={wexner,fiql,sex,status:"seen"};if(withOutcome)out.continence=g("cont");return out}
function readComps(){return[...document.querySelectorAll("#comps .comp-row")].map(r=>({type:r.querySelector('[data-cf="type"]').value,date:r.querySelector('[data-cf="date"]').value,grade:r.querySelector('[data-cf="grade"]').value}))}

/* ---------- stats & charts ---------- */
function lineChart(series){/* series: [{label,vals:[4]}] y 0..20 */
 const W=520,H=220,pl=34,pr=34,pt=22,pb=30;const x=i=>pl+i*(W-pl-pr)/3;const y=v=>pt+(1-v/20)*(H-pt-pb);
 let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${t("wxEvol")}">`;
 [0,5,10,15,20].forEach(v=>{s+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)" stroke-width="1"/><text x="${pl-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`});
 TPS.forEach((tp,i)=>{s+=`<text x="${x(i)}" y="${H-8}" text-anchor="middle">${t("tp_"+tp)}</text>`});
 const pts=series.vals.map((v,i)=>v==null?null:[x(i),y(v)]).filter(Boolean);
 if(pts.length){s+=`<path d="M${pts[0][0]},${y(0)} ${pts.map(p=>"L"+p.join(",")).join(" ")} L${pts[pts.length-1][0]},${y(0)} Z" fill="var(--accent-soft)" stroke="none"/>`;
  s+=`<path d="${pts.map((p,i)=>(i?"L":"M")+p.join(",")).join(" ")}" fill="none" stroke="var(--accent)" stroke-width="2.5"/>`;
  series.vals.forEach((v,i)=>{if(v==null)return;s+=`<circle cx="${x(i)}" cy="${y(v)}" r="${i===pts.length-1?5:3.5}" fill="var(--accent)"/><text x="${x(i)}" y="${y(v)-10}" text-anchor="middle" style="fill:var(--fg);font-weight:700">${v.toFixed(1)}</text>`})}
 return s+"</svg>"}
function barsFiql(pre,post){const W=520,H=200,pl=34,pr=10,pt=18,pb=30,max=5;const keys=["life","cope","dep","emb"];const gw=(W-pl-pr)/4;const bw=gw*.3;
 const y=v=>pt+(1-v/max)*(H-pt-pb);let s=`<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="FIQL">`;
 [0,1,2,3,4,5].forEach(v=>{s+=`<line x1="${pl}" x2="${W-pr}" y1="${y(v)}" y2="${y(v)}" stroke="var(--line)"/><text x="${pl-8}" y="${y(v)+4}" text-anchor="end">${v}</text>`});
 keys.forEach((k,i)=>{const cx=pl+gw*i+gw/2;[[pre[k],"var(--pink-strong)",-1],[post[k],"var(--accent)",1]].forEach(([v,c,side])=>{if(v==null)return;const x0=cx+(side<0?-bw-2:2);
  s+=`<rect x="${x0}" y="${y(v)}" width="${bw}" height="${y(0)-y(v)}" rx="3" fill="${c}"/><text x="${x0+bw/2}" y="${y(v)-5}" text-anchor="middle" style="fill:var(--fg)">${v.toFixed(1)}</text>`});
  s+=`<text x="${cx}" y="${H-8}" text-anchor="middle">${t("sc_"+k)}</text>`});
 return s+"</svg>"}
function meanBy(list,fn){const v=list.map(fn).filter(x=>x!=null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
function statsView(list,trainer){
 const s=stats(list);
 const wx=TPS.map(tp=>meanBy(list,p=>p.visits[tp]&&p.visits[tp].status!=="lost"?wxTotal(p.visits[tp].wexner):null));
 const fpre={},fpost={};["life","cope","dep","emb"].forEach(k=>{fpre[k]=meanBy(list,p=>{const v=p.visits.pre;return v?fiqlScores(v.fiql)[k]:null});fpost[k]=meanBy(list,p=>{const v=p.visits.m12;return v&&v.status!=="lost"?fiqlScores(v.fiql)[k]:null})});
 const nByTp=TPS.map(tp=>list.filter(p=>p.visits[tp]&&p.visits[tp].status!=="lost").length);
 const tot=s.n||1;
 return`${trainer?"":`<h1>${t("stats")}</h1>`}
 <section class="card chart"><div class="section-head"><h2>${t("wxEvol")}</h2><span class="small muted">${t("lower")}</span></div>${lineChart({vals:wx})}
  <p class="small muted" style="margin:0">n = ${nByTp.join(", ")}</p></section>
 <section class="card chart"><div class="section-head"><h2>${t("fiqlEvol")}</h2><span class="small muted">${t("higher")}</span></div>
  <div class="legend"><span><i style="background:var(--pink-strong)"></i>${t("tp_pre")}</span><span><i style="background:var(--accent)"></i>${t("tp_m12")}</span></div>${barsFiql(fpre,fpost)}</section>
 <section class="card"><h2 style="margin-bottom:10px">${t("byType")}</h2>
  ${["SP","BOTH","RVF"].map(k=>`<div style="display:grid;grid-template-columns:minmax(0,11rem) minmax(0,1fr) 2.5rem;gap:10px;align-items:center;margin-top:8px"><span class="small">${t("type_"+k)}</span>
  <div style="background:var(--surface-2);border-radius:6px;height:14px;overflow:hidden"><div style="height:100%;width:${s.byType[k]/tot*100}%;background:${k==="SP"?"var(--accent)":k==="RVF"?"var(--pink-strong)":"var(--muted)"}"></div></div><b style="text-align:right;font-variant-numeric:tabular-nums">${s.byType[k]}</b></div>`).join("")}
 </section>`}

/* ---------- trainer views ---------- */
function filtered(){const f=state.filters;return state.patients.filter(p=>{const part=PARTS.find(x=>x.id===p.pid);
 if(f.country&&part.country!==f.country)return false;if(f.pid&&p.pid!==f.pid)return false;
 if(f.period==="12"&&addDays(p.date,365)<TODAY)return false;return true})}
function filterBar(){const f=state.filters;const countries=[...new Set(PARTS.map(p=>p.country))];
 return`<div class="filters">
 <div class="field"><label for="fl-c" class="small">${t("country")}</label><select id="fl-c" data-filter="country"><option value="">${t("all")}</option>${countries.map(c=>`<option ${f.country===c?"selected":""}>${c}</option>`).join("")}</select></div>
 <div class="field"><label for="fl-p" class="small">${t("participant")}</label><select id="fl-p" data-filter="pid"><option value="">${t("all")}</option>${PARTS.filter(p=>!f.country||p.country===f.country).map(p=>`<option value="${esc(p.id)}" ${f.pid===p.id?"selected":""}>${esc(p.name)}</option>`).join("")}</select></div>
 <div class="field"><label for="fl-t" class="small">${t("period")}</label><select id="fl-t" data-filter="period"><option value="all">${t("allTime")}</option><option value="12" ${f.period==="12"?"selected":""}>${t("last12")}</option></select></div>
 </div>`}
function overviewView(){const list=filtered();const s=stats(list);const nP=new Set(list.map(p=>p.pid)).size;
 return`<h1>${t("overview")}</h1>${filterBar()}
 <div class="kpis">
  <div class="kpi"><b>${s.n}</b><span>${t("kPatients")}, ${nP} ${t("tParticipants")}</span></div>
  <div class="kpi"><b>${f1(s.wxPre)} › ${f1(s.wxLast)}</b><span>${t("kWexner")}</span></div>
  <div class="kpi"><b>${pct(s.compPct)}</b><span>${t("kComp")}</span></div>
  <div class="kpi"><b>${pct(s.m12Pct)}</b><span>${t("kM12")}</span></div>
 </div>
 ${participantTable(list)}
 ${statsView(list,true)}`}
function participantTable(list){return`<div class="table-wrap"><table><thead><tr><th>${t("participant")}</th><th>${t("country")}</th><th class="num">${t("colN")}</th><th class="num">${t("colComp")}</th><th class="num">${t("colWx")}</th><th class="num">${t("colM12")}</th><th class="num">${t("colLate")}</th></tr></thead><tbody>
 ${PARTS.map(p=>{const l=list.filter(x=>x.pid===p.id);if(!l.length)return"";const s=stats(l);
  return`<tr><td><b>${esc(p.name)}</b><br><span class="small muted">${esc(p.id)}</span></td><td>${p.country}</td><td class="num">${s.n}</td><td class="num">${pct(s.compPct)}</td><td class="num">${f1(s.wxPre)} › ${f1(s.wxLast)}</td><td class="num">${pct(s.m12Pct)}</td><td class="num">${s.late?`<span class="chip late">${s.late}</span>`:"0"}</td></tr>`}).join("")}
 </tbody></table></div>`}
function participantsView(){const list=filtered();
 return`<h1>${t("participants")}</h1>${filterBar()}${participantTable(list)}
 ${PARTS.filter(p=>!state.filters.pid||p.id===state.filters.pid).filter(p=>!state.filters.country||p.country===state.filters.country).map(p=>{const l=list.filter(x=>x.pid===p.id);
  return`<section class="card"><div class="section-head"><h2>${esc(p.name)}</h2><span class="small muted">${esc(p.site)}, ${p.country}</span></div><div class="list">${l.map(patientRow).join("")||`<p class="empty">${t("none")}</p>`}</div></section>`}).join("")}`}
function reviewView(){const list=filtered();const flagged=list.filter(p=>p.flag);
 const late=list.flatMap(p=>dueFor(p).filter(x=>x.s==="late").map(x=>({p,...x}))).sort((a,b)=>a.due.localeCompare(b.due));
 return`<h1>${t("review")}</h1>${filterBar()}
 <section class="card"><div class="section-head"><h2>${t("flaggedCases")}</h2><span class="chip due">${flagged.length}</span></div><div class="list">${flagged.map(patientRow).join("")||`<p class="empty">${t("noFlag")}</p>`}</div></section>
 <section class="card"><div class="section-head"><h2>${t("overdue")}</h2><span class="chip late">${late.length}</span></div><div class="list">${late.map(x=>{const part=PARTS.find(q=>q.id===x.p.pid);
  return`<button class="row" data-open="${x.p.code}"><div class="grow"><div class="title">${esc(x.p.code)}</div><div class="small muted">${esc(part.name)}, ${t("tp_"+x.tp)} ${fmtDate(x.due)}</div></div><span class="chip late">${Math.round((TODAY-new Date(x.due+"T00:00:00"))/864e5)} ${t("days")}</span><span class="chev">›</span></button>`}).join("")||`<p class="empty">${t("noTodo")}</p>`}</div></section>`}
const DICT=[["patient_code","Code patiente pseudonymisé"],["participant_id","AFYA Participant ID"],["country","Pays (code)"],["surgery_date","Date de l'intervention (AAAA-MM-JJ)"],["procedure","SP, RVF ou BOTH"],["origin","obst, trauma, sv, cong, other"],["age","Âge (années)"],["parity","Parité"],["difficulties","Codes séparés par |"],["complications","type:grade:date séparés par |"],["flag_discuss","1 si cas à discuter"],["{tp}_status","seen, lost ou vide ; tp = pre, d30, m6, m12"],["{tp}_wexner","Total Wexner 0 à 20"],["{tp}_fiql_lifestyle / coping / depression / embarrassment","Sous-échelles FIQL (moyenne des items)"],["{tp}_sex_active / dyspareunia / fear","1, 0 ou vide"],["{tp}_continence","yes, better, no (suivis uniquement)"]];
function buildCSV(list){const head=["patient_code","participant_id","country","surgery_date","procedure","origin","age","parity","difficulties","complications","flag_discuss"];
 TPS.forEach(tp=>head.push(`${tp}_status`,`${tp}_wexner`,`${tp}_fiql_lifestyle`,`${tp}_fiql_coping`,`${tp}_fiql_depression`,`${tp}_fiql_embarrassment`,`${tp}_sex_active`,`${tp}_dyspareunia`,`${tp}_fear`,`${tp}_continence`));
 const b=v=>v==null?"":v?1:0;const n=v=>v==null?"":(Math.round(v*100)/100);
 const rows=list.map(p=>{const part=PARTS.find(x=>x.id===p.pid);const r=[p.code,p.pid,part.country,p.date,p.type,p.origin,p.age,p.parity,p.diffs.join("|"),p.comps.map(c=>`${c.type}:${c.grade}:${c.date}`).join("|"),p.flag?1:0];
  TPS.forEach(tp=>{const v=p.visits[tp];if(!v){r.push("","","","","","","","","","");return}const fs=fiqlScores(v.fiql)||{};const lost=v.status==="lost";
   r.push(v.status,lost?"":n(wxTotal(v.wexner)),lost?"":n(fs.life),lost?"":n(fs.cope),lost?"":n(fs.dep),lost?"":n(fs.emb),lost?"":b(v.sex&&v.sex.active),lost?"":b(v.sex&&v.sex.dysp),lost?"":b(v.sex&&v.sex.fear),v.continence||"")});
  return r.map(x=>{x=String(x);return/[",;\n]/.test(x)?'"'+x.replace(/"/g,'""')+'"':x}).join(",")});
 return[head.join(","),...rows].join("\n")}
function exportView(){const list=filtered();
 return`<h1>${t("exportTitle")}</h1>${filterBar()}<p class="muted" style="margin:0">${t("exportText")}</p>
 <section class="card" style="display:flex;flex-direction:column;gap:10px"><div class="section-head"><h2>CSV</h2><span class="small muted">${list.length} ${t("patients").toLowerCase()}</span></div>
  <label for="csv" class="small muted">CSV</label><textarea id="csv" class="csv" readonly>${esc(buildCSV(list))}</textarea>
  <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn primary" data-dl>${t("download")}</button><button class="btn" data-copy>${t("copy")}</button></div></section>
 <section><h2 style="margin-bottom:10px">${t("dict")}</h2><div class="table-wrap"><table><tbody>${DICT.map(([k,v])=>`<tr><td><code>${esc(k)}</code></td><td style="white-space:normal">${esc(v)}</td></tr>`).join("")}</tbody></table></div></section>`}

/* ---------- events ---------- */
function toast(msg){const el=toastEl;el.textContent=msg;el.hidden=false;clearTimeout(toast._t);toast._t=setTimeout(()=>{el.hidden=true},2200)}
function go(view,param){state.view=view;state.param=param||null;if(view==="add")state.draft={comps:[]};render();window.scrollTo(0,0)}
app.addEventListener("click",e=>{
 const el=e.target.closest("[data-act],[data-nav],[data-open],[data-visit],[data-back],[data-addcomp],[data-rmcomp],[data-cancel],[data-copy],[data-dl]");if(!el)return;
 if(el.hasAttribute("data-dl")){const blob=new Blob(["﻿"+document.getElementById("csv").value],{type:"text/csv;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="carnet-afya-"+iso(TODAY)+".csv";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return}
 if(el.dataset.act==="lang"){state.lang=state.lang==="fr"?"en":"fr";persist();render();return}
 if(el.dataset.act==="logout"){opts.onLogout();return}
 if(el.dataset.act==="security"){opts.onSecurity();return}
 if(el.dataset.act==="admin"){opts.onAdmin();return}
 if(el.dataset.nav){go(el.dataset.nav);return}
 if(el.dataset.open){state.prev=state.view;go("patient",el.dataset.open);return}
 if(el.dataset.visit){const p=state.patients.find(x=>x.code===el.dataset.visit);state.draft={comps:p.comps.map(c=>({...c}))};state.prevV=state.view;state.view="visit";state.param={code:p.code,tp:el.dataset.tp};render();window.scrollTo(0,0);return}
 if(el.hasAttribute("data-back")){if(state.view==="visit"){state.view=state.prevV==="patient"?"patient":"home";state.param=state.prevV==="patient"?state.param.code:null;if(state.view==="patient")state.param=state.param;render();return}
  go(state.prev&&state.prev!=="patient"?state.prev:(state.role==="part"?"patients":"review"));return}
 if(el.hasAttribute("data-cancel")){state.draft=null;go("home");return}
 if(el.hasAttribute("data-addcomp")){state.draft.comps=readComps();state.draft.comps.push({type:"inf",date:iso(TODAY),grade:"I"});document.getElementById("comps").innerHTML=compRows(state.draft.comps);return}
 if(el.dataset.rmcomp!=null){state.draft.comps=readComps();state.draft.comps.splice(+el.dataset.rmcomp,1);document.getElementById("comps").innerHTML=compRows(state.draft.comps);return}
 if(el.hasAttribute("data-copy")){const ta=document.getElementById("csv");const done=()=>toast(t("copied"));const fail=()=>{ta.focus();ta.select();toast(t("copyFail"))};
  try{navigator.clipboard.writeText(ta.value).then(done,fail)}catch(_){fail()}return}
});
app.addEventListener("change",e=>{
 const f=e.target.dataset.filter;if(f){state.filters[f]=e.target.value;if(f==="country")state.filters.pid="";render();return}
 const name=e.target.name||"";const m=name.match(/^(p-|v-)/);if(!m)return;const pre=m[1];const form=e.target.form;
 if(name.startsWith(pre+"wx")){const tot=[1,2,3,4,5].reduce((a,i)=>{const c=form.querySelector(`input[name="${pre}wx${i}"]:checked`);return a+(c?+c.value:0)},0);document.getElementById(pre+"wxt").textContent=tot}
 if(name.startsWith(pre+"fq_")){const a=readAssessment(form,pre,false);document.getElementById(pre+"fqn").textContent=Object.keys(a.fiql).length;
  const chip=document.getElementById(pre+"fqn").parentElement;chip.className="chip "+(Object.keys(a.fiql).length===29?"ok":"due");document.getElementById(pre+"fqs").textContent=fiqlLine(a.fiql)}
 if(name===pre+"sxa"){document.getElementById(pre+"sxr-wrap").hidden=e.target.value!=="0"}
});
function bindView(){
 const pf=document.getElementById("pform");
 if(pf)pf.addEventListener("submit",e=>{e.preventDefault();
  const age=+document.getElementById("f-age").value;const date=document.getElementById("f-date").value;const type=(pf.querySelector('input[name="f-type"]:checked')||{}).value;
  if(!age||!date||!type){const er=document.getElementById("f-err");er.hidden=false;er.scrollIntoView({block:"center"});return}
  const pat={code:nextCode(),pid:ME.id,age,parity:+document.getElementById("f-par").value||0,hospital:document.getElementById("f-hosp").value,date,type,
   origin:(pf.querySelector('input[name="f-orig"]:checked')||{}).value||"other",diffs:[...pf.querySelectorAll('input[name="f-diff"]:checked')].map(x=>x.value),
   diffNote:document.getElementById("f-dnote").value,comps:readComps(),flag:document.getElementById("f-flag").checked,visits:{pre:readAssessment(pf,"p-",false)}};
  if(state.saving)return;
  save(pat).then(saved=>{state.patients.unshift(saved);state.draft=null;state.prev="patients";state.view="patient";state.param=saved.code;render();window.scrollTo(0,0);toast(t("saved"))},err=>toast(err.message||t("saveFail")))});
 const vf=document.getElementById("vform");
 if(vf){vf.addEventListener("change",e=>{if(e.target.name==="v-status")document.getElementById("v-body").hidden=e.target.value==="lost"});
  vf.addEventListener("submit",e=>{e.preventDefault();const{code,tp}=state.param;const p=state.patients.find(x=>x.code===code);
   const st=(vf.querySelector('input[name="v-status"]:checked')||{}).value||"seen";
   const next={...p,visits:{...p.visits,[tp]:st==="lost"?{status:"lost"}:readAssessment(vf,"v-",true)},comps:readComps(),flag:document.getElementById("f-flag").checked};
   if(state.saving)return;
   save(next).then(saved=>{state.patients=state.patients.map(x=>x.code===code?saved:x);state.prev="patients";state.view="patient";state.param=code;render();window.scrollTo(0,0);toast(t("visitSaved"))},err=>toast(err.message||t("saveFail")))})}
}
render();

root.after(toastEl);
return () => toastEl.remove();
}
