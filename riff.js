/* Блок «Как играть» на страницах аккордов: бой, перебор, вступление, риф.
   Части песни лежат в riffs/<id>.json (сборка кладёт их в window.SONG_RIFF):
     {"parts":[{"type":"Перебор","where":"Куплет","pattern":"p8"},
               {"type":"Бой","where":"Припев","pattern":"b6","chords":["Am","F","C","G"],"bpm":100},
               {"type":"Вступление","src":"riffs/<id>-1.gp5"}]}
   Рисунок из библиотеки (pattern) раскладывается по аккордам песни прямо в браузере — поэтому
   таб перестраивается вместе с «Тон −/+» и «Простыми аккордами». Свой рисунок — файлом Guitar Pro (src) или текстом alphaTex (tex).
   Нужны функции страницы song.html: chordShape, transposeChord, chordsIn, loadAlphaTab, AT_DIR, SONG, esc, $. */
(function(){
'use strict';

/* ===== библиотека рисунков =====
   Перебор: B — бас аккорда, B2 — соседняя басовая струна, 1/2/3 — три верхние звучащие струны аккорда (обычно 1-я, 2-я, 3-я),
            «321» — три верхние вместе (щипком). Числа после — длительность в восьмых.
   Бой: сетка по восьмым — D ↓ вниз, U ↑ вверх, X ↓ с глушением, B — один бас, «-» — звук тянется. */
const PAT={
  p4:{kind:'p',name:'четвёрка',ts:4,ev:[['B',2],['3',2],['2',2],['1',2]],schema:'Б 3 2 1',
      desc:'Бас, потом по очереди три тонкие струны — по одному звуку на каждую долю. Для спокойных песен.'},
  p6:{kind:'p',name:'шестёрка',ts:3,ev:[['B',1],['3',1],['2',1],['1',1],['2',1],['3',1]],schema:'Б 3 2 1 2 3',
      desc:'Бас, вверх по струнам и обратно. Удобен для песен на три счёта.'},
  p8:{kind:'p',name:'восьмёрка',ts:4,ev:[['B',1],['3',1],['2',1],['3',1],['1',1],['3',1],['2',1],['3',1]],schema:'Б 3 2 3 1 3 2 3',
      desc:'Ровные восьмые, 3-я струна звучит через раз. Самый частый перебор для песен на 4 счёта.'},
  p3:{kind:'p',name:'тройка (вальс)',ts:3,ev:[['B',2],['321',2],['321',2]],schema:'Б (321) (321)',
      desc:'«Раз» — бас, «два» и «три» — три тонкие струны вместе. Для вальсов и песен на три четверти.'},
  pq:{kind:'p',name:'щипок',ts:4,ev:[['B',2],['321',2],['B2',2],['321',2]],schema:'Б (321) Б₂ (321)',
      desc:'Бас, щипок тремя тонкими струнами, второй бас на соседней струне, снова щипок. Упругий бардовский рисунок.'},
  b4:{kind:'b',name:'четвёрка',ts:4,grid:'DUXUDUXU',
      desc:'Вниз, вверх, вниз с глушением, вверх — и ещё раз. Самый простой бой.'},
  b6:{kind:'b',name:'шестёрка',ts:4,grid:'D-DU-UDU',
      desc:'Вниз, вниз-вверх, (пропуск) вверх, вниз-вверх. Самый популярный «дворовый» бой.'},
  bx:{kind:'b',name:'с глушением',ts:4,grid:'D-DU-UXU',
      desc:'Шестёрка, где предпоследний удар вниз глушится ребром ладони — звучит как с барабаном.'},
  b8:{kind:'b',name:'восьмёрка',ts:4,grid:'DUDUDUDU',
      desc:'Ровные восьмые вниз-вверх, акцент на «раз» и «три». Для бодрых роковых песен.'},
  bc:{kind:'b',name:'цоевский',ts:4,grid:'D-XU-UXU',
      desc:'Быстрый бой с глушением на втором и предпоследнем ударе — как у «Кино».'},
  bw:{kind:'b',name:'вальс',ts:3,grid:'B-D-D-',
      desc:'На три счёта: «раз» — бас большим пальцем, «два» и «три» — удары вниз.'},
};
const TYPES=['Перебор','Бой','Вступление','Риф','Проигрыш'];
const COUNT={4:['1','и','2','и','3','и','4','и'],3:['1','и','2','и','3','и']};

/* ===== аккорды части: заданы явно — или берём из раздела песни с этим названием («Куплет», «Припев», «Вступление»…) ===== */
function sectionChords(where){
  const t=String(SONG.text||''),w=String(where||'').trim().toLowerCase();
  if(w){
    let on=false,out=[];
    for(const line of t.split('\n')){
      const cm=line.match(/^\s*\{(?:comment|c):\s*(.*)\}\s*$/i);
      if(cm){if(on&&out.length)break;on=cm[1].toLowerCase().replace(/ё/g,'е').startsWith(w.replace(/ё/g,'е').split(/[\s,]+/)[0]);continue;}
      if(on)for(const m of line.matchAll(/\[([^\]]+)\]/g))out.push(m[1].trim());
    }
    if(out.length)return dedupRun(out).slice(0,4);   // один круг: до 4 тактов (больше — только если аккорды заданы явно)
  }
  return [...new Set(chordsIn(t))].slice(0,4);
}
const dedupRun=a=>{const o=[];a.forEach(c=>{if(o[o.length-1]!==c)o.push(c);});const n=o.length;
  // строка из повторяющегося круга (Am F C G Am F C G) — берём один круг
  for(let k=1;k<=n/2;k++){if(n%k)continue;let ok=true;for(let i=k;i<n;i++)if(o[i]!==o[i-k]){ok=false;break;}if(ok)return o.slice(0,k);}
  return o;};
function sectionNames(){const s=[];String(SONG.text||'').split('\n').forEach(l=>{const m=l.match(/^\s*\{(?:comment|c):\s*(.*)\}\s*$/i);if(m){const n=m[1].replace(/\s*[×x]\s*\d+.*$/i,'').replace(/\s*\d+\s*$/,'').trim();if(n&&!s.includes(n))s.push(n);}});return s;}

/* ===== генератор alphaTex из рисунка и аккордов ===== */
function voices(name){
  const sh=chordShape(name);if(!sh)return null;
  const pl=[];sh.forEach((fr,i)=>{if(fr>=0)pl.push({s:6-i,f:fr});});   // звучащие струны: s — номер (1 тонкая … 6 толстая)
  if(!pl.length)return null;
  const bass=pl[0],b2=pl[1]||pl[0];
  const top=pl.slice(1).slice(-3);                                       // до трёх верхних звучащих, кроме баса
  while(top.length<3)top.unshift(top[0]||bass);
  return {all:pl,bass,b2,t:{'1':top[2],'2':top[1],'3':top[0]},up:pl.length>4?pl.slice(-4):pl};
}
const N=v=>`${v.f}.${v.s}`;
const DUR={1:'.8',2:'.4',3:'.4',4:'.2',6:'.2',8:'.1'};
const dotted=d=>d===3||d===6;
function beat(tok,v,d,first,chName){
  const fx=[];if(first)fx.push(`ch "${chName.replace(/"/g,'')}"`);if(dotted(d))fx.push('d');
  let core;
  if(tok==='B')core=N(v.bass);
  else if(tok==='B2')core=N(v.b2);
  else if(tok==='321')core=`(${['3','2','1'].map(k=>N(v.t[k])).join(' ')})`;
  else if(/^[123]$/.test(tok))core=N(v.t[tok]);
  else if(tok==='D'){core=`(${v.all.map(N).join(' ')})`;fx.push('bd');}
  else if(tok==='U'){core=`(${v.up.map(N).join(' ')})`;fx.push('bu');}
  else if(tok==='X'){core=`(${v.all.map(x=>'x.'+x.s).join(' ')})`;fx.push('bd');}
  return core+DUR[d]+(fx.length?`{${fx.join(' ')}}`:'');
}
const okGrid=(g,P)=>P&&P.kind==='b'&&typeof g==='string'&&g.length===P.grid.length&&/^[DUXB-]+$/.test(g)&&g[0]!=='-';
const gridOf=(p,P)=>okGrid(p.grid,P)?p.grid:P&&P.grid;
const gridEv=g=>{const ev=[];for(let i=0;i<g.length;i++){if(g[i]==='-')continue;let d=1;while(g[i+d]==='-')d++;ev.push([g[i],d]);}return ev;};
function buildTex(part,map){
  const P=PAT[part.pattern];if(!P)return null;
  const src=(part.chords&&part.chords.length?part.chords:sectionChords(part.where)).slice(0,8);
  const chords=src.map(c=>map(c)).filter(Boolean);
  if(!chords.length)return null;
  const ev=P.ev||gridEv(gridOf(part,P));
  const bars=[];
  for(const c of chords){
    const v=voices(c);if(!v)continue;
    bars.push(ev.map(([tok,d],i)=>beat(tok,v,d,i===0,c.split('|')[0])).join(' '));
  }
  if(!bars.length)return null;
  return {tex:`\\tempo ${part.bpm||(P.kind==='b'?96:80)}\n.\n\\ts ${P.ts} 4 `+bars.join(' |\n'),chords};
}

/* ===== внешний вид ===== */
const CSS=`
.riff{margin:0 0 22px;border-radius:20px;padding:18px 18px 14px;background:linear-gradient(160deg,rgba(37,31,94,.75),rgba(20,17,55,.88));box-shadow:inset 0 0 0 1px rgba(110,123,255,.28)}
.riff .rtabs{display:flex;gap:6px;overflow-x:auto;margin:0 0 14px;padding-bottom:2px}
.riff .rtabs button{flex:none;border:none;border-radius:11px;padding:9px 13px;background:var(--card);color:var(--muted);font:800 13px var(--body);cursor:pointer;white-space:nowrap}
.riff .rtabs button[aria-selected="true"]{background:var(--amber);color:#1b1b1b}
.riff .rh{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-bottom:8px}
.riff .rk{font-weight:800;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#B3AEE8}
.riff .chip{font-weight:800;font-size:12px;padding:4px 9px;border-radius:999px;background:rgba(239,236,251,.08);color:#CFCCF2}
.riff h2{font-family:var(--display);font-weight:400;font-size:22px;line-height:1.1;margin:0;flex-basis:100%}
.riff .rdesc{color:#CFCCF2;font-weight:600;font-size:14px;line-height:1.5;margin:0 0 12px;max-width:760px}
.riff .rgrid{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.riff .rgrid span{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:38px;padding:8px 6px 6px;border-radius:12px;background:rgba(7,6,26,.5)}
.riff .rgrid b{font-size:22px;line-height:1;color:var(--paper);font-weight:800}
.riff .rgrid b.x{color:#FF7A7E}.riff .rgrid b.h{color:rgba(239,236,251,.25)}.riff .rgrid b.bs{color:#F3C06A;font-size:17px}
.riff .rgrid small{font-weight:800;font-size:11px;color:var(--muted)}
.riff .rgrid span.st small{color:#B3AEE8}
.riff .rgrid span,.riff .rseq i{transition:background .08s,box-shadow .08s,transform .08s}
.riff .rgrid span.now{background:rgba(240,168,48,.22);box-shadow:inset 0 0 0 2px var(--amber),0 0 14px rgba(240,168,48,.45);transform:translateY(-2px)}
.riff .rgrid span.now b{color:var(--amber)}.riff .rgrid span.now b.x{color:#FF7A7E}
.riff .rseq i.now{background:rgba(240,168,48,.22);box-shadow:inset 0 0 0 2px var(--amber),0 0 14px rgba(240,168,48,.45);color:var(--amber);transform:translateY(-2px)}
.riff .rseq{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.riff .rseq i{font-style:normal;min-width:34px;text-align:center;padding:7px 9px;border-radius:10px;background:rgba(7,6,26,.5);font-weight:800;font-size:16px;color:var(--paper)}
.riff .rseq i.bs{color:#F3C06A}
.riff .rv{position:relative;border-radius:14px;background:rgba(7,6,26,.55);overflow-x:auto;overflow-y:hidden;padding:4px 6px;min-height:140px}
.riff .rload{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-weight:700;font-size:14px;text-align:center;padding:10px}
.riff .rload[hidden]{display:none}
.riff .rc{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.riff .rc .pl{width:46px;height:46px;border-radius:50%;border:none;background:var(--amber);color:#1b1b1b;font-size:18px;box-shadow:0 4px 0 var(--amber-d);cursor:pointer;padding-left:3px}
.riff .rc .pl.pause{padding-left:0}.riff .rc .pl:disabled{opacity:.5;cursor:default}
.riff .rc .b{border:none;border-radius:11px;padding:10px 13px;background:var(--card);color:var(--paper);font:800 13px var(--body);cursor:pointer}
.riff .rc .b:hover{background:var(--card2)}
.riff .rc .b.on{background:rgba(240,168,48,.18);color:#F3C06A;box-shadow:inset 0 0 0 1px rgba(240,168,48,.45)}
.riff .rc .sp{margin-left:auto;color:var(--muted);font-weight:700;font-size:12px}
.riff .at-cursor-beat{background:var(--amber);width:3px;border-radius:2px;box-shadow:0 0 8px rgba(240,168,48,.8)}
.riff .at-cursor-bar{background:transparent}
.riff .at-selection div{background:rgba(111,191,115,.22)}
@media (max-width:560px){.riff{padding:14px 12px 12px}.riff .rc .sp{flex-basis:100%;margin-left:0}.riff .rgrid span{min-width:32px}}
.rown{display:flex;justify-content:flex-end;margin:0 0 12px}
.rown>button{border:none;border-radius:11px;padding:9px 13px;background:var(--card);color:#CFCCF2;font:800 13px var(--body);cursor:pointer}
.rown>button:hover{background:var(--card2);color:var(--amber)}
.rform{margin:0 0 22px;padding:16px;border-radius:18px;background:rgba(28,24,72,.92);box-shadow:inset 0 0 0 1px rgba(240,168,48,.35);display:grid;gap:12px}
.rform[hidden]{display:none}
.rform h3{font-family:var(--display);font-weight:400;font-size:20px;margin:0}
.rform .rpl{display:grid;gap:8px}
.rform .rpi{display:grid;grid-template-columns:repeat(4,minmax(0,1fr)) auto;gap:8px;align-items:end;padding:10px;border-radius:12px;background:rgba(12,10,36,.5)}
.rform label{display:grid;gap:5px;font-weight:800;font-size:12px;color:#CFCCF2;min-width:0}
.rform input,.rform select,.rform textarea{width:100%;box-sizing:border-box;background:rgba(12,10,36,.75);border:none;box-shadow:inset 0 0 0 1px rgba(110,123,255,.25);border-radius:10px;padding:9px 10px;color:var(--paper);font:600 14px var(--body)}
.rform textarea{min-height:90px;font:600 13px ui-monospace,Menlo,monospace}
.rform .wide{grid-column:1/-2}
.rform .rge{display:grid;gap:6px}
.rform .rgl{font-weight:800;font-size:12px;color:#CFCCF2}
.rform .rgr{border:none;background:none;color:var(--amber);font:800 12px var(--body);cursor:pointer;padding:0;text-decoration:underline}
.rform .rgb{display:flex;flex-wrap:wrap;gap:6px}
.rform .rgb button{display:flex;flex-direction:column;align-items:center;gap:3px;min-width:44px;padding:8px 6px 6px;border:none;border-radius:12px;background:rgba(12,10,36,.75);box-shadow:inset 0 0 0 1px rgba(110,123,255,.3);color:var(--paper);cursor:pointer}
.rform .rgb button:hover{box-shadow:inset 0 0 0 2px var(--amber)}
.rform .rgb b{font-size:22px;line-height:1;font-weight:800}.rform .rgb small{font-weight:800;font-size:11px;color:var(--muted)}
.rform .rgb button.x b{color:#FF7A7E}.rform .rgb button.h b{color:rgba(239,236,251,.3)}
.rform .rhelp{border-radius:12px;background:rgba(12,10,36,.5);padding:0 14px}
.rform .rhelp summary{cursor:pointer;padding:11px 0;font-weight:800;font-size:14px;color:var(--amber);list-style:none}
.rform .rhelp summary::-webkit-details-marker{display:none}
.rform .rhelp[open]{padding-bottom:12px}
.rform .rh1{margin:6px 0 10px;font-size:13px;line-height:1.55;color:#CFCCF2}
.rform .rh1>b{display:block;color:var(--paper);font-size:14px;margin-bottom:4px}
.rform .rh1 ol,.rform .rh1 ul{margin:0;padding-left:20px;display:grid;gap:3px}
.rform .rh1 code,.rform .rh1 pre{font:700 12px ui-monospace,Menlo,monospace;background:rgba(239,236,251,.08);border-radius:6px;padding:1px 5px;color:#F3C06A}
.rform .rh1 pre{display:block;padding:8px 10px;margin:4px 0 0;white-space:pre;overflow-x:auto}
.rform .rh1 table{border-collapse:collapse;width:100%;max-width:560px}
.rform .rh1 td{padding:4px 10px 4px 0;border-bottom:1px solid rgba(110,123,255,.15);vertical-align:top}
.rform .rh1 td:nth-child(2) code{font-size:13px;letter-spacing:1px}
.rform .rx{border:none;border-radius:10px;width:38px;height:38px;background:rgba(242,107,111,.18);color:#FF9CA0;font:800 16px var(--body);cursor:pointer}
.rform .rb{display:flex;flex-wrap:wrap;gap:8px}
.rform .rb button{border:none;border-radius:11px;padding:10px 14px;font:800 14px var(--body);cursor:pointer;background:var(--card2);color:var(--paper)}
.rform .rb .go{background:var(--amber);color:#1b1b1b}
.rform .rmsg{font-weight:700;font-size:13px;color:#8FD493;min-height:1.2em}.rform .rmsg.bad{color:#F26B6F}
.rform small{color:var(--muted);font-weight:600;font-size:12px;line-height:1.45}
@media (max-width:700px){.rform .rpi{grid-template-columns:1fr 1fr}.rform .wide{grid-column:1/-1}}`;

/* ===== блок ===== */
let S=null;   // {parts, cur, api, ready, map, box, key}
const H=t=>esc(String(t==null?'':t));
const narrow=()=>innerWidth<700;
function title(p){const P=PAT[p.pattern];return p.type+(p.where?' · '+p.where.toLowerCase():'')+(P&&!p.where?' · '+P.name:'');}

function mount(){
  if(!document.getElementById('riffCss')){const st=document.createElement('style');st.id='riffCss';st.textContent=CSS;document.head.appendChild(st);}
  const panel=document.querySelector('#content .panel');if(!panel)return false;
  const R=window.SONG_RIFF;const parts=(R&&Array.isArray(R.parts)?R.parts:[]).filter(p=>p&&(PAT[p.pattern]||p.src||p.tex));
  let own=false;try{const l=JSON.parse(localStorage.getItem('dgc_link')||'null');own=!!(l&&l.prov==='admin');}catch(e){}
  S={parts,cur:0,api:null,ready:false,map:window.RIFF_MAP||(c=>c),key:''};
  document.querySelectorAll('.riff,.rown,.rform').forEach(e=>e.remove());
  if(own)ownerUI(panel);
  if(!parts.length)return true;
  const box=document.createElement('section');box.className='riff';box.id='riff';S.box=box;
  panel.before(box);
  draw();
  return true;
}
function draw(){
  const p=S.parts[S.cur],P=PAT[p.pattern],box=S.box;
  const gen=P?buildTex(p,S.map):null;
  S.key=P?JSON.stringify((p.chords&&p.chords.length?p.chords:sectionChords(p.where)).map(S.map))+(p.grid||''):'';
  const tabs=S.parts.length>1?`<div class="rtabs" role="tablist">${S.parts.map((x,i)=>`<button role="tab" data-i="${i}" aria-selected="${i===S.cur}">${H(title(x))}</button>`).join('')}</div>`:'';
  let scheme='';
  if(P&&P.kind==='b'){const g=gridOf(p,P),c=COUNT[P.ts];
    scheme=`<div class="rgrid" aria-label="Схема боя">${[...g].map((ch,i)=>`<span class="${i%2?'':'st'}"><b class="${ch==='X'?'x':ch==='-'?'h':ch==='B'?'bs':''}">${ch==='D'?'↓':ch==='U'?'↑':ch==='X'?'✕':ch==='B'?'Б':'·'}</b><small>${c[i]}</small></span>`).join('')}</div>`;}
  else if(P)scheme=`<div class="rseq" aria-label="Порядок струн">${P.schema.split(' ').map(x=>`<i class="${/Б/.test(x)?'bs':''}">${H(x)}</i>`).join('')}</div>`;
  const own=P&&okGrid(p.grid,P)&&p.grid!==P.grid;
  const head=P?(own?`${p.type==='Бой'?'Бой':p.type+': бой'} — свой рисунок`:`${p.type==='Бой'||p.type==='Перебор'?p.type+' «'+P.name+'»':p.type+': '+(P.kind==='b'?'бой':'перебор')+' «'+P.name+'»'}`):p.type;
  box.innerHTML=`${tabs}<div class="rh"><span class="rk">Как играть</span>${p.where?`<span class="chip">${H(p.where)}</span>`:''}${P?`<span class="chip">${P.ts===3?'3/4':'4/4'}</span>`:''}${gen?`<span class="chip">${H(gen.chords.map(c=>c.split('|')[0]).join(' · '))}</span>`:''}<h2>${H(head)}</h2></div>
    ${P?`<p class="rdesc">${own?'Свой вариант на основе боя «'+H(P.name)+'».':H(P.desc)}${P.kind==='b'?' ↓ — вниз, ↑ — вверх, ✕ — вниз с глушением.':' Б — бас аккорда (большой палец), цифры — струны.'}</p>`:''}${scheme}
    <div class="rv"><div class="rload" id="rLoad">Загружаю таб…</div><div id="riffAt"></div></div>
    <div class="rc"><button class="pl" id="rPlay" disabled aria-label="Играть">▶</button><button class="b" id="rSpd">Скорость 100%</button><button class="b on" id="rLoop" aria-pressed="true">🔁 Повтор</button><button class="b" id="rView" aria-pressed="false">Показать ноты</button><span class="sp">Слушай, замедляй и играй вместе</span></div>`;
  box.querySelectorAll('.rtabs button').forEach(b=>b.onclick=()=>{S.cur=+b.dataset.i;stop();draw();});
  render(p,gen);
}
/* подпись «rendered by alphaTab» в самом низу — прячем, как на страницах табов */
function hideMark(){const surf=$('riffAt')&&$('riffAt').querySelector('.at-surface');if(!surf)return;const last=surf.lastElementChild;
  if(last&&last.tagName==='DIV'&&(parseFloat(last.style.height)||99)<24&&surf.children.length>1){last.style.display='none';const top=parseFloat(last.style.top);if(top>0)surf.style.height=top+'px';}
  const cu=$('riffAt').querySelector('.at-cursors');if(cu)cu.style.height=surf.style.height||surf.offsetHeight+'px';}   // слой курсора — не выше таба, иначе в рамке появляется прокрутка
function stop(){try{S.api&&S.api.stop();}catch(e){}}
let SPEED=1;
function render(p,gen){
  const sp=[1,.75,.5];
  const ui=()=>{const b=$('rSpd');if(!b)return;b.textContent='Скорость '+Math.round(SPEED*100)+'%';b.classList.toggle('on',SPEED<1);
    const lp=!S.api||S.api.isLooping;$('rLoop').classList.toggle('on',lp);$('rLoop').setAttribute('aria-pressed',lp);};
  if(PAT[p.pattern]&&!gen){$('rLoad').textContent='Не получилось разложить рисунок по аккордам этой части.';return;}
  loadAlphaTab().then(()=>{
    try{S.api&&S.api.destroy();}catch(e){}
    S.ready=false;
    const api=S.api=new alphaTab.AlphaTabApi($('riffAt'),{
      core:{fontDirectory:AT_DIR+'font/',scriptFile:AT_DIR+'alphaTab.min.js',useWorkers:true},
      display:{staveProfile:'Tab',scale:narrow()?.85:1,layoutMode:'Page',barsPerRow:narrow()?2:4,
        resources:{engravingSettings:{tabLineSpacing:14},staffLineColor:'rgba(138,132,214,0.38)',barSeparatorColor:'rgba(169,163,230,0.6)',mainGlyphColor:'rgba(225,220,255,0.85)',secondaryGlyphColor:'#A4A1D8',barNumberColor:'#A4A1D8',tablatureFont:'bold 15px Manrope, Arial, sans-serif',barNumberFont:'600 11px Manrope, Arial, sans-serif',markerFont:'800 14px Manrope, Arial, sans-serif'}},
      notation:{rhythmMode:'ShowWithBars',rhythmHeight:20,elements:{scoreTitle:false,scoreSubTitle:false,scoreArtist:false,scoreAlbum:false,scoreWords:false,scoreMusic:false,scoreWordsAndMusic:false,scoreCopyright:false,guitarTuning:false,trackNames:false,effectDynamics:false,effectCapo:false,effectTempo:false}},
      player:{playerMode:'EnabledSynthesizer',soundFont:AT_DIR+'soundfont/sonivox.sf3',enableCursor:true,enableUserInteraction:true,scrollMode:'Off'}   // таб короткий и весь на экране — страницу за курсором не двигаем
    });
    api.isLooping=true;api.playbackSpeed=SPEED;
    // названия аккордов над табом — шрифтом сайта, а не наклонным с засечками
    try{const r=api.settings.display.resources,F=alphaTab.model.Font.fromJson('800 16px Manrope, Arial, sans-serif');if(F){r.elementFonts.set(alphaTab.NotationElement.EffectChordNames,F);api.updateSettings();}}catch(e){}
    api.scoreLoaded.on(sc=>{
      const dim=alphaTab.model.Color.fromJson('rgba(150,144,210,0.32)'),BS=alphaTab.model.BeatSubElement;
      sc.tracks.forEach(t=>{if(t.playbackInfo&&t.playbackInfo.program===24)t.playbackInfo.program=25;   // нейлон → сталь, как в табах
        t.staves.forEach(st=>st.bars.forEach(b=>b.voices.forEach(v=>v.beats.forEach(bt=>{try{if(!bt.style)bt.style=new alphaTab.model.BeatStyle();
          [BS.GuitarTabStem,BS.GuitarTabFlags,BS.GuitarTabBeams,BS.StandardNotationStem,BS.StandardNotationFlags,BS.StandardNotationBeams].forEach(k=>{if(k!=null)bt.style.colors.set(k,dim);});}catch(e){}}))));});
    });
    api.renderFinished.on(()=>{const l=$('rLoad');if(l)l.hidden=true;});
    api.postRenderFinished.on(hideMark);
    // во время игры подсвечиваем стрелку боя / струну перебора, которая звучит сейчас
    const P=PAT[p.pattern],ev=P?(P.ev||gridEv(gridOf(p,P))):null,starts=[];if(ev){let t=0;ev.forEach(([,d])=>{starts.push(t);t+=d;});}
    const cells=()=>S.box.querySelectorAll(P&&P.kind==='b'?'.rgrid span':'.rseq i');
    const lit=i=>cells().forEach((c,k)=>c.classList.toggle('now',k===i));
    if(ev)api.playedBeatChanged.on(b=>{if(!b)return;const i=b.index;lit(P.kind==='b'?starts[i]:i);});
    api.playerStateChanged.on(e=>{if(e.state!==1)lit(-1);});
    api.playerReady.on(()=>{S.ready=true;const b=$('rPlay');if(b)b.disabled=false;});
    api.playerStateChanged.on(e=>{const b=$('rPlay');if(!b)return;const on=e.state===1;b.textContent=on?'❚❚':'▶';b.classList.toggle('pause',on);});
    api.error.on(e=>{const l=$('rLoad');if(l){l.hidden=false;l.textContent='Не удалось открыть таб.';}console.error('riff',e);});
    if(gen)api.tex(gen.tex);else if(p.tex)api.tex(p.tex);else api.load(new URL(p.src,document.baseURI).href);
    $('rPlay').onclick=()=>S.ready&&api.playPause();
    $('rSpd').onclick=()=>{SPEED=sp[(sp.indexOf(SPEED)+1)%sp.length];api.playbackSpeed=SPEED;ui();};
    $('rLoop').onclick=()=>{api.isLooping=!api.isLooping;ui();};
    $('rView').onclick=()=>{const sc=api.settings.display.staveProfile===alphaTab.StaveProfile.ScoreTab;
      api.settings.display.staveProfile=sc?alphaTab.StaveProfile.Tab:alphaTab.StaveProfile.ScoreTab;api.updateSettings();api.render();
      $('rView').textContent=sc?'Показать ноты':'Только таб';$('rView').setAttribute('aria-pressed',!sc);};
    ui();
  }).catch(()=>{const l=$('rLoad');if(l)l.textContent='Не удалось загрузить плеер табов.';});
}
let wN=narrow();
addEventListener('resize',()=>{if(!S||!S.api||narrow()===wN)return;wN=narrow();const d=S.api.settings.display;d.barsPerRow=wN?2:4;d.scale=wN?.85:1;S.api.updateSettings();S.api.render();});

/* страница сменила тональность / «Простые аккорды»: map(аккорд песни) → аккорд на экране */
function update(map){
  if(!S)return;S.map=map;
  if(!S.box||!S.parts.length)return;
  const p=S.parts[S.cur];if(!PAT[p.pattern])return;
  const key=JSON.stringify((p.chords&&p.chords.length?p.chords:sectionChords(p.where)).map(map))+(p.grid||'');
  if(key===S.key)return;S.key=key;stop();draw();
}

/* ===== владелец: части песни правятся прямо на странице ===== */
function ownerUI(panel){
  const API='https://functions.yandexcloud.net/d4epurfr35kcn0fl97up';
  const bar=document.createElement('div');bar.className='rown';
  bar.innerHTML=`<button type="button" id="rEdit">${S.parts.length?'✎ Как играть: изменить':'＋ Добавить бой / перебор'}</button>`;
  const f=document.createElement('form');f.className='rform';f.hidden=true;
  const secs=sectionNames();
  const pOpts=k=>Object.entries(PAT).map(([id,P])=>`<option value="${id}"${id===k?' selected':''}>${P.kind==='b'?'Бой':'Перебор'}: ${P.name}</option>`).join('');
  let list=S.parts.map(p=>Object.assign({},p));
  const row=(p,i)=>`<div class="rpi" data-i="${i}">
    <label>Что<select data-k="type">${TYPES.map(t=>`<option${t===p.type?' selected':''}>${t}</option>`).join('')}</select></label>
    <label>Где играется<input data-k="where" list="rSecs" value="${H(p.where||'')}" placeholder="Куплет"></label>
    <label>Рисунок<select data-k="pattern"><option value="">свой (файл GP / alphaTex)</option>${pOpts(p.pattern)}</select></label>
    <label>Темп, уд/мин<input data-k="bpm" type="number" min="40" max="240" value="${H(p.bpm||'')}" placeholder="авто"></label>
    <button type="button" class="rx" data-del="${i}" title="Убрать часть">✕</button>
    ${PAT[p.pattern]&&PAT[p.pattern].kind==='b'?gridRow(p,i):''}
    <label class="wide">Аккорды (необязательно — иначе из раздела «${H(p.where||'…')}»)<input data-k="chords" value="${H((p.chords||[]).join(' '))}" placeholder="${H(sectionChords(p.where).join(' '))}"></label>
    ${p.pattern?'':`<label class="wide">Файл Guitar Pro<input type="file" data-k="file" accept=".gp,.gp3,.gp4,.gp5,.gpx">${p.src?`<small>Сейчас: ${H(p.src.split('/').pop())}</small>`:''}</label>
    <label class="wide">…или текст alphaTex<textarea data-k="tex" spellcheck="false">${H(p.tex||'')}</textarea></label>`}
  </div>`;
  const SYM={D:'↓',U:'↑',X:'✕',B:'Б','-':'·'},NEXT={D:'U',U:'X',X:'B',B:'-','-':'D'};
  const gridRow=(p,i)=>{const P=PAT[p.pattern],g=gridOf(p,P),c=COUNT[P.ts],own=g!==P.grid;
    return `<div class="wide rge"><span class="rgl">Удары по долям — нажми, чтобы сменить: ↓ → ↑ → ✕ глушение → Б бас → · пауза${own?' · <button type="button" class="rgr" data-reset="'+i+'">Как было</button>':''}</span>
      <div class="rgb">${[...g].map((ch,k)=>`<button type="button" data-slot="${k}" data-row="${i}" class="${ch==='X'?'x':ch==='-'?'h':''}"><b>${SYM[ch]}</b><small>${c[k]}</small></button>`).join('')}</div></div>`;};
  let helpOpen=!list.length;
  const help=()=>`<details class="rhelp"${helpOpen?' open':''}><summary>📖 Шпаргалка</summary>
    <div class="rh1"><b>Как добавить</b><ol>
      <li><b>＋ Часть</b> — новая часть песни. У одной песни их может быть до 6: например, перебор во вступлении и бой в припеве.</li>
      <li><b>Что</b> — Перебор, Бой, Вступление, Риф или Проигрыш (это подпись на вкладке).</li>
      <li><b>Где играется</b> — название раздела <i>как в тексте песни</i>: Вступление, Куплет, Припев… Аккорды берутся из этого раздела сами: один круг, до 4 тактов, по такту на аккорд.</li>
      <li><b>Рисунок</b> — из списка; таб и звук построятся по аккордам песни и перестроятся, если посетитель сменит тон.</li>
      <li><b>Темп</b> — ударов в минуту; пусто — бой 96, перебор 80.</li>
      <li><b>Аккорды</b> — только если нужен другой порядок или больше тактов: через пробел, до 8 (<code>Am F C G</code>).</li>
      <li><b>Показать на странице</b> — проверить у себя. <b>Опубликовать</b> — для всех, появится через 1–2 минуты. Убрать часть — ✕ и «Опубликовать».</li></ol></div>
    <div class="rh1"><b>Обозначения</b><ul>
      <li><b>Б</b> — бас аккорда (большой палец), <b>Б₂</b> — соседняя басовая струна; <b>1 2 3</b> — струны, 1 — самая тонкая.</li>
      <li><b>↓</b> удар вниз · <b>↑</b> вверх · <b>✕</b> вниз с глушением · <b>·</b> пауза / звук тянется. Счёт: <b>1 и 2 и 3 и 4 и</b>.</li>
      <li><b>Свой бой</b>: выбери любой бой и нажимай на доли — удар меняется по кругу ↓ → ↑ → ✕ → Б → ·. «Как было» — вернуть стандартный.</li></ul></div>
    <div class="rh1"><b>Рисунки</b><table>${Object.values(PAT).map(P=>`<tr><td>${P.kind==='b'?'Бой':'Перебор'} «${H(P.name)}»</td><td><code>${P.kind==='b'?[...P.grid].map(c=>SYM[c]).join(' '):H(P.schema)}</code></td><td>${P.ts===3?'3/4':'4/4'}</td></tr>`).join('')}</table></div>
    <div class="rh1"><b>Своя партия</b> — рисунок «свой (файл GP / alphaTex)»:<ul>
      <li><b>Guitar Pro</b>: 2–4 такта, одна гитарная дорожка, до 2 МБ (gp, gp5, gpx…).</li>
      <li><b>alphaTex</b> — таб текстом: <code>лад.струна</code> — нота; <code>(0.1 1.2 0.3)</code> — несколько струн сразу; <code>:8</code> — дальше восьмые (<code>:4</code> четверти, <code>:16</code> шестнадцатые); <code>|</code> — новый такт; <code>{ch "Am"}</code> — название аккорда над нотой; <code>x.3</code> — глушёная струна; <code>{bd}</code> / <code>{bu}</code> — удар вниз / вверх; <code>r</code> — пауза.</li>
      <li>Пример (перебор Am, восьмые):<pre>\\tempo 80
.
:8 0.5{ch "Am"} 2.3 1.2 2.3 0.1 2.3 1.2 2.3 |</pre></li></ul></div>
  </details>`;
  const paint=()=>{f.innerHTML=`<h3>Как играть</h3>${help()}<datalist id="rSecs">${secs.map(s=>`<option value="${H(s)}">`).join('')}</datalist>
    <div class="rpl">${list.map(row).join('')||'<small>Пока пусто — добавь часть: например «Перебор · Куплет · восьмёрка» и «Бой · Припев · шестёрка».</small>'}</div>
    <div class="rb"><button type="button" id="rAdd">＋ Часть</button><button type="button" id="rPrev">Показать на странице</button><button class="go" type="submit">Опубликовать</button><button type="button" id="rX">Закрыть</button></div>
    <small>Аккорды берутся из раздела песни с тем же названием, что в «Где играется». Рисунок «свой» — для уникальной партии из Guitar Pro. «Показать на странице» — проверить у себя до публикации; посетители увидят через 1–2 минуты после «Опубликовать».</small>
    <div class="rmsg" id="rM"></div>`;
    f.querySelectorAll('[data-k]').forEach(el=>{el.addEventListener(el.type==='file'?'change':'input',()=>{const i=+el.closest('.rpi').dataset.i,k=el.dataset.k;
      if(k==='file'){list[i]._file=el.files[0]||null;return;}
      if(k==='chords')list[i].chords=el.value.trim()?el.value.trim().split(/[\s,]+/):undefined;
      else if(k==='bpm')list[i].bpm=+el.value||undefined;
      else list[i][k]=el.value;
      if(k==='pattern'){delete list[i].grid;}
      if(k==='pattern'||k==='where')paint();});});
    const hp=f.querySelector('.rhelp');if(hp)hp.ontoggle=()=>{helpOpen=hp.open;};
    f.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{list.splice(+b.dataset.del,1);paint();});
    f.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{const p=list[+b.dataset.row],P=PAT[p.pattern],g=[...gridOf(p,P)],k=+b.dataset.slot;
      g[k]=NEXT[g[k]];if(k===0&&g[0]==='-')g[0]='D';p.grid=g.join('');if(p.grid===P.grid)delete p.grid;paint();});
    f.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>{delete list[+b.dataset.reset].grid;paint();});
    $('rAdd').onclick=()=>{list.push({type:list.length?'Бой':'Перебор',where:secs[list.length]||secs[0]||'',pattern:list.length?'b6':'p8'});paint();};
    $('rPrev').onclick=()=>{window.SONG_RIFF={parts:clean(list,true)};const keep=list;mount();list=keep;$('rEdit').click();msg('Так это увидят посетители (пока только у тебя). Не забудь «Опубликовать».');};
    $('rX').onclick=()=>{f.hidden=true;};
  };
  const clean=(l,local)=>l.map(p=>{const o={type:TYPES.includes(p.type)?p.type:'Перебор'};if(p.where)o.where=String(p.where).slice(0,40);
    if(p.pattern&&PAT[p.pattern]){o.pattern=p.pattern;if(p.chords&&p.chords.length)o.chords=p.chords.slice(0,8);if(p.bpm)o.bpm=p.bpm;if(okGrid(p.grid,PAT[p.pattern])&&p.grid!==PAT[p.pattern].grid)o.grid=p.grid;}
    else{if(p.tex)o.tex=p.tex;if(p.src)o.src=p.src;if(local&&p._file)o._file=p._file;}
    return o;}).filter(o=>o.pattern||o.tex||o.src||o._file);
  const msg=(t,bad)=>{const m=$('rM');if(m){m.textContent=t;m.className='rmsg'+(bad?' bad':'');}};
  const tok=()=>{try{return (JSON.parse(localStorage.getItem('dgc_link')||'null')||{}).token;}catch(e){return null;}};
  const b64=async file=>{const buf=new Uint8Array(await file.arrayBuffer());let s='';for(let i=0;i<buf.length;i+=32768)s+=String.fromCharCode.apply(null,buf.subarray(i,i+32768));return btoa(s);};
  f.onsubmit=async e=>{e.preventDefault();
    try{
      const parts=[];
      for(const p of list){const o=clean([p])[0];if(!o&&!p._file)continue;const x=o||{type:p.type,where:p.where};
        if(!x.pattern&&p._file){const ext=(p._file.name.split('.').pop()||'').toLowerCase();
          if(!/^(gp|gp3|gp4|gp5|gpx)$/.test(ext))return msg('Нужен файл Guitar Pro: gp, gp3, gp4, gp5 или gpx.',true);
          if(p._file.size>2e6)return msg('Файл больше 2 МБ — для части песни хватит нескольких тактов.',true);
          x.file={ext,data:await b64(p._file)};delete x.src;}
        parts.push(x);}
      msg('Публикую…');
      const r=await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'publish_riff',token:tok(),id:SONG.id,parts})});
      const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||('ошибка '+r.status));
      msg(parts.length?'Готово! Посетители увидят через 1–2 минуты.':'Убрано. Со страницы пропадёт через 1–2 минуты.');
    }catch(err){msg('Не получилось: '+err.message+(String(err.message).includes('unknown')||String(err.message).includes('400')?' (обнови функцию на сервере — см. STATUS.md)':''),true);}};
  panel.before(bar,f);
  $('rEdit').onclick=()=>{f.hidden=!f.hidden;if(!f.hidden&&!f.innerHTML)paint();};
  paint();
}

window.RIFF={mount,update,PAT,buildTex,sectionChords};
// страница могла отрисоваться раньше, чем загрузился этот файл
if(document.querySelector('#content .panel')&&typeof SONG!=='undefined'&&SONG&&!SONG.tab)mount();
})();
