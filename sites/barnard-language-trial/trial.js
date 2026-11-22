"use strict";
const $ = (id) => document.getElementById(id);
function node(tag, value, className) {
  const element = document.createElement(tag);
  if (value !== undefined) element.textContent = value;
  if (className) element.className = className;
  return element;
}
function starfield() {
  const canvas = $("sky");
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const d = Math.min(devicePixelRatio || 1, 2);
  canvas.width = w*d; canvas.height = h*d;
  const c = canvas.getContext("2d");
  if (!c) return;
  c.scale(d,d);
  let seed = 729;
  const random = () => ((seed = (1664525*seed+1013904223) >>> 0) / 4294967296);
  const x = w*(w<680 ? .93 : .76), y = h*.47, r = Math.min(w*.12,h*.33);
  const glow = c.createRadialGradient(x,y,r*.4,x,y,r*2.2);
  glow.addColorStop(0,"#a95632");glow.addColorStop(.5,"#52332b");glow.addColorStop(1,"#0c151c");
  c.fillStyle=glow;c.fillRect(0,0,w,h);
  for(let i=0;i<w*.33;i++){
    c.fillStyle="rgba(247,233,208,"+(.18+random()*.68)+")";
    c.beginPath();c.arc(random()*w,random()*h,random()*1.1+.18,0,2*Math.PI);c.fill();
  }
  c.save();c.translate(x,y);c.rotate(-.32);
  c.strokeStyle="#aa826245";c.lineWidth=1;
  for(const n of [1.45,2.12,2.9]){c.beginPath();c.ellipse(0,0,r*n,r*n*.48,0,0,Math.PI*2);c.stroke();}
  c.restore();
  const surface=c.createRadialGradient(x-r*.45,y-r*.42,r*.06,x,y,r);
  surface.addColorStop(0,"#ffc897");surface.addColorStop(.68,"#e89469");surface.addColorStop(.95,"#ac654d");surface.addColorStop(1,"#f3b58c");
  c.fillStyle=surface;c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.fill();c.save();c.clip();
  for(let i=0;i<8000;i++){
    const sx=x-r+random()*2*r, sy=y-r+random()*2*r;
    c.strokeStyle=random()>.5?"#ffe3b543":"#783d3c35";
    c.beginPath();c.moveTo(sx,sy);c.quadraticCurveTo(sx+r*.05,sy+r*.026,sx+random()*r*.13,sy+r*.012);c.stroke();
  }
  c.restore();
}
starfield();
window.addEventListener("resize",starfield);
const locales = {ms:"Bahasa Melayu",id:"Bahasa Indonesia"};
function choices(label, options, initial, change) {
  const group=node("div",undefined,"tools");
  group.setAttribute("role","group"); group.setAttribute("aria-label",label);
  for(const [key,title] of Object.entries(options)){
    const btn=node("button",title);btn.type="button";btn.setAttribute("aria-pressed",String(key===initial));
    btn.onclick=()=>{for(const b of group.children)b.setAttribute("aria-pressed",String(b===btn));change(key);};
    group.append(btn);
  }
  return group;
}
const criteria={msUI:"Malay UI",idUI:"Indonesian UI",meaning:"Meaning & consistency",usability:"Usability",msProse:"Malay prose",idProse:"Indonesian prose",fidelity:"Narrative fidelity"};
function render(data) {
  const {entries,prompts}=data;
  let place=0;
  entries.forEach((e,i)=>{
    if(!i || e.uiScore!==entries[i-1].uiScore)place=i+1;
    const row=node("div",undefined,"rankrow");
    const name=node("div");name.append(node("strong",e.model),node("small",e.version));
    row.append(node("span",String(place).padStart(2,"0"),"place"),name);
    for(const [label,score] of [["UI / 100",e.uiScore],["Fiction / 100",e.storyScore]]){
      const cell=node("div");cell.append(node("b",score.toFixed(1)),node("small",label));row.append(cell);
    }
    $("ranks").append(row);
    const group=node("div",undefined,"reviews");group.append(node("h3",e.model));
    for(const review of e.reviews){
      const panel=node("details");panel.append(node("summary","Reviewed by "+review.reviewer));
      const grid=node("div",undefined,"criteria");
      for(const [key,label] of Object.entries(criteria)){
        const cell=node("div",undefined,"score");cell.append(node("small",label),node("b",review[key]+" / 5"));grid.append(cell);
      }
      panel.append(grid);
      for(const [label,note] of [["Interface copy",review.uiNote],["Fiction",review.storyNote]]){
        const p=node("p");p.append(node("strong",label+" · "),document.createTextNode(note));panel.append(p);
      }
      group.append(panel);
    }
    $("cards").append(group);
  });
  const scroll=node("div",undefined,"tablewrap");
  function showStrings(lang){
    const table=node("table",undefined,"copytable");table.setAttribute("aria-label",locales[lang]+" interface copy");
    const head=table.createTHead().insertRow();
    for(const title of ["English",...entries.map(e=>e.model)]){const cell=node("th",title);cell.scope="col";head.append(cell);}
    const body=table.createTBody();
    for(const [key,english] of Object.entries(prompts)){
      const row=body.insertRow(), heading=node("th",english);heading.scope="row";row.append(heading);
      for(const entry of entries){const cell=row.insertCell();cell.lang=lang;cell.dataset.model=entry.model;cell.textContent=entry[lang].ui[key];}
    }
    scroll.replaceChildren(table);
  }
  $("copy").append(choices("Interface language",locales,"ms",showStrings),scroll);showStrings("ms");
  let current=entries[0], language="ms";
  const story=node("article",undefined,"story");
  function read(){
    story.lang=language;const meta=node("p",current.model+" · "+current.words[language]+(language==="ms"?" patah perkataan":" kata"),"eyebrow");
    story.replaceChildren(meta,node("h3",current[language].title),...current[language].story.trim().split(/\n\s*\n/).map(p=>node("p",p)));
  }
  const modelChoices=Object.fromEntries(entries.map(e=>[e.key,e.model]));
  $("library").append(choices("Story author",modelChoices,current.key,key=>{current=entries.find(e=>e.key===key);read();}),choices("Story language",locales,language,key=>{language=key;read();}),story);read();
  if(data.unavailable?.length)$("unavailable").textContent="Unavailable for this trial: "+data.unavailable.join(", ")+".";
}
if(window.TRIAL)render(window.TRIAL);
else $("ranks").textContent="Results could not be loaded. Keep results-data.js beside this page.";

