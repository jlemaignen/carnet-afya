// @ts-nocheck
// Développement local UNIQUEMENT : remplit la base avec les données fictives du prototype
// (mêmes participants, même tirage), plus deux comptes de démonstration.
//   node --env-file-if-exists=../.env src/tools/seed-demo.ts
// Mot de passe des deux comptes : demo-carnet-local (jamais utilisé sur le serveur).
import { hashPassword } from "../auth.ts";
import { Repository } from "../db.ts";

const FQ_ITEMS=["q1",..."abcdefghijklm".split("").map(l=>"q2"+l),..."abcdefghijklmn".split("").map(l=>"q3"+l),"q4"].map(id=>({id,g:id.slice(0,2)}));
/* ---------- constants ---------- */
const TPS=["pre","d30","m6","m12"];const TP_DAYS={d30:30,m6:182,m12:365};
const ORIGINS=["obst","trauma","sv","cong","other"];const DIFFS=["expo","edges","scar","bleed","time","mat","help","other"];
const COMPS=["inf","dehis","bleed","rvf","fail","other"];const GRADES=["I","II","IIIa","IIIb","IV","V"];
const TODAY=new Date();TODAY.setHours(0,0,0,0);
const iso=d=>d.toISOString().slice(0,10);const addDays=(s,n)=>{const d=new Date(s+"T00:00:00");d.setDate(d.getDate()+n);return d};
// const fmtDate=s=>{if(!s)return"";const d=new Date(s+"T00:00:00");return d.toLocaleDateString(state.lang==="fr"?"fr-CH":"en-GB",{day:"numeric",month:"short",year:"numeric"})};
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));

/* ---------- sample data ---------- */
const PARTS=[
 {id:"AFYA / ETH / 2024 / 01",name:"Dr H. Girma",country:"ETH",site:"Bahir Dar"},
 {id:"AFYA / DRC / 2024 / 02",name:"Dr J. Mukendi",country:"DRC",site:"Bukavu"},
 {id:"AFYA / BDI / 2025 / 01",name:"Dr C. Niyonzima",country:"BDI",site:"Gitega"},
 {id:"AFYA / TAN / 2025 / 03",name:"Dr R. Mwakyusa",country:"TAN",site:"Mwanza"}
];
function rng(seed){let s=seed;return()=>{s=(s*1664525+1013904223)%4294967296;return s/4294967296}}
function genFiql(r,level){/* level 0 good .. 1 bad */const a={};FQ_ITEMS.forEach(it=>{const n=(r()-.5)*1.2;
 if(it.g==="q1")a[it.id]=Math.max(1,Math.min(5,Math.round(5-level*3.2+n)));
 else if(it.g==="q4")a[it.id]=Math.max(1,Math.min(6,Math.round(6-level*4+n)));
 else a[it.id]=Math.max(1,Math.min(4,Math.round(4-level*2.8+n)))});return a}
function genVisit(r,level,seen){
 const wx=[0,0,0,0,0].map((_,i)=>Math.max(0,Math.min(4,Math.round(level*4.1+(r()-.5)*1.6-(i===2?-.3:0)))));
 const active=r()>level*.6;
 return{wexner:wx,fiql:genFiql(r,level),sex:{active,reason:active?null:(level>.5?"inc":(r()>.5?"part":"choice")),dysp:r()<level*.5,fear:r()<level*.8},
  continence:level<.2?"yes":level<.55?"better":"no",status:seen?"seen":"lost"}
}
function buildSample(){
 const r=rng(20251117);const pts=[];
 PARTS.forEach((p,pi)=>{const n=[12,9,8,6][pi];
  for(let k=0;k<n;k++){
   const start=new Date("2025-01-10T00:00:00");const span=(TODAY-start)/864e5-10;
   const d=iso(addDays(iso(start),Math.floor(r()*span)));
   const t=r();const type=t<.55?"SP":t<.8?"BOTH":"RVF";
   const pre=.65+r()*.3;const fail=r()<.12;
   const diffs=DIFFS.filter(()=>r()<.16);
   const comps=[];if(r()<.22){const c=fail?"fail":COMPS[Math.floor(r()*4)];comps.push({type:c,date:iso(addDays(d,3+Math.floor(r()*20))),grade:c==="fail"?"IIIb":GRADES[Math.floor(r()*3)]})}
   const pat={code:p.id.split(" / ").slice(1).join("-")+"-P"+String(k+1).padStart(3,"0"),pid:p.id,age:18+Math.floor(r()*30),parity:1+Math.floor(r()*6),
    hospital:p.site,date:d,type,origin:r()<.82?"obst":ORIGINS[1+Math.floor(r()*4)],diffs,diffNote:"",comps,flag:r()<.1,visits:{}};
   pat.visits.pre=genVisit(r,pre,true);delete pat.visits.pre.continence;
   let lvl=pre;
   ["d30","m6","m12"].forEach((tp,i)=>{if(addDays(d,TP_DAYS[tp]+12)>TODAY)return;
    const p_seen=[.9,.75,.6][i];if(r()>p_seen)return;
    lvl=fail?Math.max(.45,pre-.1-r()*.15):Math.max(.02,lvl-(.25+r()*.25));
    pat.visits[tp]=genVisit(r,lvl,true)});
   pts.push(pat)}
 });
 pts.sort((a,b)=>b.date.localeCompare(a.date));return pts;
}

const repo = new Repository(process.env.DB_PATH ?? "./data/carnet-afya.db");
const hash = await hashPassword("demo-carnet-local");
const compte = (email, nom, sections) => repo.findUserByEmail(email)?.id ?? repo.createUser(email, nom, hash, sections);
PARTS.forEach((p) => repo.upsertParticipant({ id: p.id, name: p.name, country: p.country, site: p.site }));
repo.linkParticipant(PARTS[0].id, compte("participant@exemple.ch", PARTS[0].name, ["participant"]));
compte("formateur@exemple.ch", "Formateur démo", ["formateur"]);
const patients = buildSample();
for (const p of patients) repo.savePatient(p, 0);
console.log(`${PARTS.length} participants, ${patients.length} patientes. Comptes : participant@exemple.ch et formateur@exemple.ch`);
