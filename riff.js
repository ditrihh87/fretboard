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
    let on=false,out=[],times=0;
    for(const line of t.split('\n')){
      const cm=line.match(/^\s*\{(?:comment|c):\s*(.*)\}\s*$/i);
      if(cm){if(on&&out.length)break;on=cm[1].toLowerCase().replace(/ё/g,'е').startsWith(w.replace(/ё/g,'е').split(/[\s,]+/)[0]);
        if(on){const r=cm[1].match(/[×xхX]\s*([2-8])\b/);times=r?+r[1]:0;}continue;}
      if(on)for(const m of line.matchAll(/\[([^\]]+)\]/g))out.push(m[1].trim());
    }
    // один круг: до 4 тактов (больше — только если аккорды заданы явно); «Вступление ×4» → повтор ×4
    if(out.length){const c=dedupRun(out).slice(0,4);return times?[...c,'x'+times]:c;}
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
  // длительность, которой нет у одной ноты (5 или 7 восьмых), — составляем из нескольких, связанных лигой
  const parts=[];let r=d;for(const k of [8,6,4,3,2,1])while(r>=k){parts.push(k);r-=k;}
  const one=(c,k,f)=>c+DUR[k]+((f=f.concat(dotted(k)?['d']:[])).length?`{${f.join(' ')}}`:'');
  const fx0=fx.filter(x=>x!=='d');
  if(parts.length===1)return one(core,d,fx0);
  // продолжение: те же струны с «-» вместо лада (лига); глушёный удар не тянется — пауза
  const tie=tok==='X'?'r':core.replace(/(^|[( ])\d+\./g,'$1-.');
  return parts.map((k,i)=>i?one(tie,k,[]):one(core,k,fx0)).join(' ');
}
const okGrid=(g,P)=>P&&P.kind==='b'&&typeof g==='string'&&g.length===P.grid.length&&/^[DUXB-]+$/.test(g)&&g[0]!=='-';
const gridOf=(p,P)=>okGrid(p.grid,P)?p.grid:P&&P.grid;
const gridEv=g=>{const ev=[];for(let i=0;i<g.length;i++){if(g[i]==='-')continue;let d=1;while(g[i+d]==='-')d++;ev.push([g[i],d]);}return ev;};
/* поле «Аккорды»: «Dm F Gm A x3 | Bb C» или «(Dm F) x2 Gm A» — x3 после группы = сыграть 3 раза;
   « | » (отдельным словом) отделяет группы; «×3» и «х3» тоже понимаем. Аккорд со своей аппликатурой (Am|5x5553) не трогаем. */
function chordTokens(str){
  const out=[];
  String(str||'').replace(/[×хХ](?=\s*[2-8](?:\b|$))/g,'x').replace(/(^|\s)x\s+(?=[2-8](?:\b|$))/g,'$1x').split(/[\s,]+/).filter(Boolean).forEach(t=>{
    while(t.startsWith('(')){out.push('(');t=t.slice(1);}
    let m=t.match(/^(.*)\)(x[2-8])?$/);
    if(m){if(m[1])out.push(m[1]);out.push(')');if(m[2])out.push(m[2]);return;}
    if(t==='|'||/^x[2-8]$/.test(t)){out.push(t);return;}
    m=!t.includes('|')&&t.match(/^([A-H].*?)x([2-8])$/);
    if(m){out.push(m[1],'x'+m[2]);return;}
    if(t)out.push(t);
  });
  return out.slice(0,96);
}
// токены → такты: {c: аккорд, ro: начало повтора, rc: сколько раз}
function seqOf(toks){
  const out=[];let seg=0,grp=null;
  for(const t of toks){
    if(t==='|'){seg=out.length;grp=null;continue;}
    if(t==='('){grp=out.length;continue;}
    if(t===')')continue;
    const m=/^x([2-8])$/.exec(t);
    if(m){const from=grp!=null?grp:seg;if(out.length>from){out[from].ro=true;out[out.length-1].rc=+m[1];}grp=null;seg=out.length;continue;}
    const eq=t.indexOf('=');   // «Gm+A5+C5=v.v^v.v.» — свой ритм такта
    out.push(eq>0?{c:t.slice(0,eq),g:t.slice(eq+1)}:{c:t});
  }
  return out.slice(0,32);   // до 32 тактов
}
/* ритм отдельного такта (только для боя): по восьмым, как «1 и 2 и…»:
   v ↓ D — вниз, ^ ↑ U — вверх, x ✕ — вниз с глушением, b Б — бас, . · - — пауза / звук тянется */
const barGrid=(g,P)=>{if(!g||!P||P.kind!=='b')return null;
  const n=[...String(g)].map(ch=>/[vVDвВ↓]/.test(ch)?'D':/[\^uU↑]/.test(ch)?'U':/[xXхХ✕]/.test(ch)?'X':/[bBбБ]/.test(ch)?'B':/[.\-·_]/.test(ch)?'-':'').join('');
  return n.length===P.grid.length&&n[0]!=='-'?n:null;};
// «Gm+Gm+A5+C5» — несколько аккордов в такте: делят такт поровну (Gm на 1–2, A5 на 3, C5 на 4)
const subs=c=>String(c).split('+').filter(Boolean);
const mapC=(c,map)=>subs(c).map(map).join('+');
const barName=c=>{const a=subs(c).map(x=>x.split('|')[0]),o=[];a.forEach(x=>{if(o[o.length-1]!==x)o.push(x);});return o.length>1?'['+o.join(' ')+']':o[0];};
const seqLabel=seq=>seq.map(x=>(x.ro?'‖: ':'')+barName(x.c)+(x.rc?' :‖ ×'+x.rc:'')).join(' · ');
function buildTex(part,map){
  const P=PAT[part.pattern];if(!P)return null;
  const seq=seqOf(part.chords&&part.chords.length?part.chords:sectionChords(part.where)).map(x=>Object.assign({},x,{c:mapC(x.c,map)})).filter(x=>x.c);
  if(!seq.length)return null;
  const ev=P.ev||gridEv(gridOf(part,P));
  const bars=[],used=[],grids=[];
  const slots=ev.reduce((t,[,d])=>t+d,0);
  for(const x of seq){
    const bg=barGrid(x.g,P),bev=bg?gridEv(bg):ev;
    // аккорды такта: делят такт поровну; лишние (не делят такт ровно) — отбрасываем до ближайшего делителя
    let cs=subs(x.c);while(cs.length>1&&slots%cs.length)cs=cs.slice(0,-1);
    const vs=cs.map(voices);if(vs.some(v=>!v))continue;
    const per=slots/cs.length;let t=0,prev=-1;
    grids.push(bg);bars.push((x.ro?'\\ro ':'')+(x.rc?`\\rc ${x.rc} `:'')+bev.map(([tok,d])=>{const k=Math.min(cs.length-1,Math.floor(t/per));t+=d;
      const nm=cs[k].split('|')[0],show=k!==prev&&(prev<0||nm!==cs[prev].split('|')[0]);prev=k;return beat(tok,vs[k],d,show,nm);}).join(' '));used.push(x);
  }
  if(!bars.length)return null;
  return {tex:`\\tempo ${part.bpm||(P.kind==='b'?96:80)}\n.\n\\ts ${P.ts} 4 `+bars.join(' |\n'),chords:used.map(x=>x.c),label:seqLabel(used),grids};
}

/* ===== внешний вид ===== */
const CSS=`
.riff{margin:0 0 22px;border-radius:20px;padding:18px 18px 14px;background:linear-gradient(160deg,rgba(37,31,94,.75),rgba(20,17,55,.88));box-shadow:inset 0 0 0 1px rgba(110,123,255,.28)}
.riff .rtabs{display:flex;gap:8px;overflow-x:auto;margin:12px 0 0;padding-bottom:2px}
.riff .rtabs button{flex:none;border:none;border-radius:13px;padding:11px 18px;background:var(--card);color:var(--muted);font:800 15px var(--body);cursor:pointer;white-space:nowrap;transition:background .15s,box-shadow .15s,transform .15s}
.riff .rtabs button[aria-selected="true"]{background:var(--amber);color:#1b1b1b}
.riff .rtabs button[style*="--sc"]{color:var(--sc);background:color-mix(in srgb,var(--sc) 14%,var(--card));box-shadow:inset 0 0 0 1.5px color-mix(in srgb,var(--sc) 55%,transparent)}
.riff .rtabs button[style*="--sc"]::before{content:"";display:inline-block;width:9px;height:9px;border-radius:50%;background:currentColor;margin-right:7px;vertical-align:1px}
.riff .rtabs button[style*="--sc"]:hover{background:color-mix(in srgb,var(--sc) 24%,var(--card));transform:translateY(-1px)}
.riff .rtabs button[style*="--sc"][aria-selected="true"]{background:var(--sc);color:#1b1b1b;box-shadow:0 0 18px color-mix(in srgb,var(--sc) 55%,transparent),0 4px 0 color-mix(in srgb,var(--sc) 55%,#000)}
.riff .chip.sec[style*="--sc"]{color:var(--sc);background:color-mix(in srgb,var(--sc) 16%,transparent)}
.riff .rh{display:flex;flex-wrap:wrap;align-items:center;gap:8px 10px;margin-bottom:8px}
.riff .rk{font-weight:800;font-size:12px;letter-spacing:1.6px;text-transform:uppercase;color:#B3AEE8}
.riff .chip{font-weight:800;font-size:12px;padding:4px 9px;border-radius:999px;background:rgba(239,236,251,.08);color:#CFCCF2}
.riff h2{font-family:var(--display);font-weight:400;font-size:22px;line-height:1.1;margin:0;flex-basis:100%}
.riff .rdesc{color:var(--paper);font-weight:600;font-size:16px;line-height:1.55;margin:0 0 14px;max-width:760px}
.riff .rleg{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.riff .rstr{align-items:center;gap:6px}
.riff .rstr i{font-style:normal;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:color-mix(in srgb,var(--c) 22%,transparent);box-shadow:inset 0 0 0 1.5px var(--c);color:var(--c);font-weight:800;font-size:13px}
.riff .rstr i{transition:background .06s,color .06s,transform .06s,box-shadow .06s}
.riff .rstr i.on{background:var(--c);color:#1b1b1b;transform:scale(1.18);box-shadow:0 0 14px var(--c)}
.riff .rstr i.hit{animation:strHit .22s ease-out}
@keyframes strHit{0%{transform:scale(1.42);box-shadow:0 0 24px var(--c)}100%{transform:scale(1.18)}}
/* белый режим: цифры и кружки белые, звучащая струна — оранжевая подсветка, как удары в схеме боя */
.riff.mono .rstr i{--c:#CFCCF2!important}
.riff.mono .rstr i.on{background:rgba(240,168,48,.22);color:var(--amber);box-shadow:inset 0 0 0 2px var(--amber),0 0 14px rgba(240,168,48,.45)}
.riff.mono .rstr i.hit{animation:strHitM .22s ease-out}
@keyframes strHitM{0%{transform:scale(1.42);box-shadow:inset 0 0 0 2px var(--amber),0 0 24px rgba(240,168,48,.7)}100%{transform:scale(1.18)}}
.riff .rstr .lt{background:none!important;box-shadow:none!important;padding:0 4px!important;color:var(--muted)!important;font-weight:700;font-size:13px}
.riff .rleg span{display:inline-flex;align-items:center;gap:8px;padding:6px 12px 6px 6px;border-radius:999px;background:rgba(239,236,251,.07);box-shadow:inset 0 0 0 1px rgba(110,123,255,.22);color:#E2DEFA;font-weight:700;font-size:14px}
.riff .rleg b{min-width:28px;height:28px;padding:0 6px;box-sizing:border-box;display:grid;place-items:center;border-radius:999px;background:rgba(7,6,26,.6);color:var(--paper);font-size:17px;font-weight:800}
.riff .rleg b.dn,.riff .rleg b.up{color:var(--paper)}.riff .rleg b.x{color:#FF7A7E}.riff .rleg b.bs{color:#F3C06A;font-size:15px}.riff .rleg b.h{color:rgba(239,236,251,.45)}
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
.riff .rv{position:relative;border-radius:14px;background:rgba(7,6,26,.55);overflow-x:auto;overflow-y:hidden;padding:4px 6px;min-height:140px;scrollbar-width:thin;scrollbar-color:rgba(110,123,255,.45) transparent}
.riff .rv.long{overflow-y:auto}
.riff .rv::-webkit-scrollbar{width:8px;height:8px}.riff .rv::-webkit-scrollbar-track{background:transparent}
.riff .rv::-webkit-scrollbar-thumb{background:rgba(110,123,255,.45);border-radius:8px}.riff .rv::-webkit-scrollbar-thumb:hover{background:rgba(110,123,255,.7)}
.riff .rv::-webkit-scrollbar-button{display:none}
.riff .rload{position:absolute;inset:0;display:grid;place-items:center;color:var(--muted);font-weight:700;font-size:14px;text-align:center;padding:10px}
.riff .rload[hidden]{display:none}
.riff .rc{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-top:12px}
.riff .rc .pl{width:46px;height:46px;border-radius:50%;border:none;background:var(--amber);color:#1b1b1b;font-size:18px;box-shadow:0 4px 0 var(--amber-d);cursor:pointer;padding-left:3px}
.riff .rc .pl.pause{padding-left:0}.riff .rc .pl:disabled{opacity:.5;cursor:default}
.riff .rc .b{border:none;border-radius:11px;padding:10px 13px;background:var(--card);color:var(--paper);font:800 13px var(--body);cursor:pointer}
.riff .rc .b:hover{background:var(--card2)}
.riff .rc .b.ic{width:42px;height:42px;padding:0;display:inline-grid;place-items:center}
.riff .rc .b.on{background:rgba(240,168,48,.18);color:#F3C06A;box-shadow:inset 0 0 0 1px rgba(240,168,48,.45)}
.riff .rc .sp{margin-left:auto;color:var(--muted);font-weight:700;font-size:12px}
.riff .at-cursor-beat{background:var(--amber);width:3px;border-radius:2px;box-shadow:0 0 8px rgba(240,168,48,.8)}
.riff .at-cursor-bar{background:transparent}
.riff .at-selection div{background:rgba(111,191,115,.22)}
@media (max-width:560px){.riff .rtabs button{padding:10px 14px;font-size:14px}.riff{padding:14px 12px 12px}.riff .rc .sp{flex-basis:100%;margin-left:0}.riff .rgrid span{min-width:32px}}
.rown{display:flex;justify-content:flex-end;margin:0 0 12px}
.rown[hidden]{display:none}
.riff .redit{margin-left:auto;border:none;border-radius:10px;padding:7px 12px;background:var(--card);color:#CFCCF2;font:800 13px var(--body);cursor:pointer}
.riff .redit:hover{background:var(--card2);color:var(--amber)}
.rform .rpi{transition:box-shadow .3s}.rform .rpi.hl{box-shadow:inset 0 0 0 2px var(--amber)}
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
.rform .rh1 table{border-collapse:collapse;width:100%;max-width:900px}
.rform .rh1 td:first-child,.rform .rh1 td:nth-child(2){white-space:nowrap}
.rform .rh1 table{display:block;overflow-x:auto}
.rform .rh1 td{padding:5px 12px 5px 0;border-bottom:1px solid rgba(110,123,255,.15);vertical-align:top}
.rform .rh1 td:nth-child(2) code{font-size:13px;letter-spacing:1px}
.rform .rfile{display:flex;flex-wrap:wrap;align-items:center;gap:10px}
.rform .rfbtn{display:inline-flex!important;align-items:center;gap:6px;padding:10px 14px;border-radius:11px;background:var(--amber);color:#1b1b1b!important;font:800 14px var(--body)!important;cursor:pointer}
.rform .rfile span{font-weight:600;font-size:13px;color:#CFCCF2}.rform .rfile b{color:var(--paper)}
.rform .rlab{display:grid;gap:8px}
.rform .rlab code{font:700 12px ui-monospace,Menlo,monospace;background:rgba(239,236,251,.08);border-radius:6px;padding:1px 5px;color:#F3C06A}
.rform .rlb{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.rform .rlb label{display:flex!important;align-items:center;gap:6px;padding:4px 6px 4px 10px;border-radius:10px;background:rgba(12,10,36,.6);box-shadow:inset 0 0 0 1px rgba(110,123,255,.2)}
.rform .rlb label.own{box-shadow:inset 0 0 0 1.5px var(--amber)}
.rform .rlb small{flex:none;min-width:18px;color:var(--muted);font-weight:800;font-size:11px}
.rform .rlb input{flex:1;min-width:0;padding:6px 8px;font:700 14px var(--body);background:transparent;box-shadow:none}
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
/* вкладка: просто раздел («Куплет», «Припев»); тип («бой», «перебор») — только если у раздела несколько частей */
function title(p){const P=PAT[p.pattern],w=String(p.where||'').trim();
  if(!w)return p.type+(P?' · '+P.name:'');
  const same=S.parts.filter(x=>String(x.where||'').trim().toLowerCase()===w.toLowerCase()).length>1;
  return w[0].toUpperCase()+w.slice(1)+(same?' · '+(P?(P.kind==='b'?'бой':'перебор'):'таб'):'');}

function mount(){
  if(!document.getElementById('riffCss')){const st=document.createElement('style');st.id='riffCss';st.textContent=CSS;document.head.appendChild(st);}
  const panel=document.querySelector('#content .panel');if(!panel)return false;
  const R=window.SONG_RIFF;const parts=(R&&Array.isArray(R.parts)?R.parts:[]).filter(p=>p&&(PAT[p.pattern]||p.src||p.tex||p._file));
  let own=false;try{const l=JSON.parse(localStorage.getItem('dgc_link')||'null');own=!!(l&&l.prov==='admin');}catch(e){}
  S={parts,cur:0,api:null,ready:false,map:window.RIFF_MAP||(c=>c),key:''};
  document.querySelectorAll('.riff,.rown,.rform').forEach(e=>e.remove());
  S.own=own;
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
  S.key=P?JSON.stringify((p.chords&&p.chords.length?p.chords:sectionChords(p.where)).map(c=>mapC(c,S.map)))+(p.grid||''):'';
  const sc=x=>{const c=window.secColor&&secColor(x.where||x.type);return c?` style="--sc:${c}"`:'';};
  const tabs=S.parts.length>1?`<div class="rtabs" role="tablist">${S.parts.map((x,i)=>`<button role="tab" data-i="${i}" aria-selected="${i===S.cur}"${sc(x)}>${H(title(x))}</button>`).join('')}</div>`:'';
  let scheme='';
  if(P&&P.kind==='b'){const g=gridOf(p,P),c=COUNT[P.ts];
    scheme=`<div class="rgrid" aria-label="Схема боя">${[...g].map((ch,i)=>`<span class="${i%2?'':'st'}"><b class="${ch==='X'?'x':ch==='-'?'h':ch==='B'?'bs':''}">${ch==='D'?'↓':ch==='U'?'↑':ch==='X'?'✕':ch==='B'?'Б':'·'}</b><small>${c[i]}</small></span>`).join('')}</div>`;}
  else if(P)scheme=`<div class="rseq" aria-label="Порядок струн">${P.schema.split(' ').map(x=>`<i class="${/Б/.test(x)?'bs':''}">${H(x)}</i>`).join('')}</div>`;
  const own=P&&okGrid(p.grid,P)&&p.grid!==P.grid;
  const head=P?(own?`${p.type==='Бой'?'Бой':p.type+': бой'} — свой рисунок`:`${p.type==='Бой'||p.type==='Перебор'?p.type+' «'+P.name+'»':p.type+': '+(P.kind==='b'?'бой':'перебор')+' «'+P.name+'»'}`):`${p.type} — партия ditrihh`;
  box.innerHTML=`<div class="rh"><span class="rk">Как играть</span>${p.where?`<span class="chip sec"${sc(p)}>${H(p.where)}</span>`:''}${P?`<span class="chip">${P.ts===3?'3/4':'4/4'}</span>`:''}${gen?`<span class="chip">${H(gen.label)}</span>`:'<span class="chip" id="rAuto" hidden></span>'}${S.own?`<button type="button" class="redit" id="rEditIn">✎ Редактировать</button>`:''}<h2>${H(head)}</h2></div>
    ${P?`<p class="rdesc">${own?'Свой вариант на основе боя «'+H(P.name)+'».':H(P.desc)}</p>`:`<p class="rdesc">Записано ditrihh нота в ноту: слушай, замедляй и играй вместе. Аккорды над табом — как в тексте песни.</p>`}${scheme}${P?legend(P,p):''}${P&&P.kind==='b'?'':strLegend()}
    <div class="rv"><div class="rload" id="rLoad">Загружаю таб…</div><div id="riffAt"></div></div>${tabs}
    <div class="rc"><button class="pl" id="rPlay" disabled aria-label="Играть">▶</button><button class="b" id="rSpd">Скорость 100%</button><button class="b ic" id="rLoop" aria-pressed="false" aria-label="Повтор" title="Повтор по кругу"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 2l4 4-4 4"/><path d="M3 11V9a3 3 0 0 1 3-3h15"/><path d="M7 22l-4-4 4-4"/><path d="M21 13v2a3 3 0 0 1-3 3H3"/></svg></button><button class="b" id="rCol" aria-pressed="true">🎨 Цвета</button><span class="sp">Пробел — играть / пауза</span></div>`;
  box.querySelectorAll('.rtabs button').forEach(b=>b.onclick=()=>{S.cur=+b.dataset.i;stop();draw();});
  const ed=box.querySelector('#rEditIn');if(ed)ed.onclick=()=>window.RIFF_EDIT&&RIFF_EDIT(S.cur);
  render(p,gen);
}
/* подпись «rendered by alphaTab» в самом низу — прячем, как на страницах табов */
function hideMark(){const surf=$('riffAt')&&$('riffAt').querySelector('.at-surface');if(!surf)return;const last=surf.lastElementChild;
  if(last&&last.tagName==='DIV'&&(parseFloat(last.style.height)||99)<24&&surf.children.length>1){last.style.display='none';const top=parseFloat(last.style.top);if(top>0)surf.style.height=top+'px';}
  const cu=$('riffAt').querySelector('.at-cursors');if(cu)cu.style.height=surf.style.height||surf.offsetHeight+'px';
  // окно — не выше двух строк таба; длиннее — прокрутка внутри окна
  const rv=$('riffAt').parentElement,rows=[...surf.children].filter(d=>d.tagName==='DIV'&&d.style.display!=='none');
  if(rows.length>2){rv.style.maxHeight=(parseFloat(rows[2].style.top)||rows[2].offsetTop)-18+'px'; /* строки разнесены systemPaddingBottom — режем по зазору */rv.classList.add('long');}else{rv.style.maxHeight='';rv.classList.remove('long');}}   // слой курсора — не выше таба, иначе в рамке появляется прокрутка
/* ===== свой таб (Guitar Pro / alphaTex): аккорды по нотам =====
   Если в файле аккорды не подписаны — определяем по звучащим нотам и подписываем над табом, как в наших табах:
   удар/щипок из 3+ струн — свой аккорд; перебор — по нотам половины такта. Подпись — только там, где аккорд меняется. */
const CH_TPL=[['',[0,4,7]],['m',[0,3,7]],['7',[0,4,7,10]],['m7',[0,3,7,10]],['maj7',[0,4,7,11]],['6',[0,4,7,9]],['m6',[0,3,7,9]],
  ['sus4',[0,5,7]],['sus2',[0,2,7]],['dim',[0,3,6]],['aug',[0,4,8]],['add9',[0,2,4,7]],['5',[0,7]]];
/* midis — звучащие ноты; simple — перебор с мелодией: только простые аккорды, бас решает, лишние ноты (мелодия) почти не мешают;
   prev — прошлая подпись: оставляем её, если она объясняет ноты почти так же хорошо (без лишнего мельтешения) */
const CH_SIMPLE=new Set(['','m','7','m7','5']);
function chordOf(midis,simple,prev){
  if(midis.length<2)return null;
  const w=new Array(12).fill(0);midis.forEach(m=>{w[((m%12)+12)%12]+=1;});
  const bass=((Math.min(...midis)%12)+12)%12,pcs=w.map((x,i)=>x?i:-1).filter(i=>i>=0);
  if(pcs.length<2)return null;
  const score=(r,q,t)=>{const set=t.map(i=>(i+r)%12);
    if(q!=='5'&&!w[set[1]])return null;                          // без терции (или кварты/секунды у sus) — не этот аккорд
    if(q==='5'&&pcs.some(pc=>[3,4].includes((pc-r+12)%12)))return null;
    const hit=set.reduce((a,pc)=>a+(w[pc]?Math.min(w[pc],2):0),0),miss=set.filter(pc=>!w[pc]).length,extra=pcs.filter(pc=>!set.includes(pc)).reduce((a,pc)=>a+w[pc],0);
    return hit-1.3*miss-(simple?0.35:0.9)*extra+(r===bass?(simple?3:1.6):0)-t.length*(simple?0.3:0.04);};
  let best=null;
  for(let r=0;r<12;r++){if(!w[r])continue;
    for(const [q,t] of CH_TPL){if(simple&&!CH_SIMPLE.has(q))continue;const sc=score(r,q,t);if(sc!=null&&(!best||sc>best.sc))best={sc,name:SHARP[r]+q};}}
  if(!best||best.sc<=1)return null;
  // квинта без терции (A5) при том же корне, что у прошлого аккорда (Am / A), — это он же, терцию просто не сыграли
  if(prev&&/5$/.test(best.name)&&prev.replace(/(m7|maj7|m6|m|7|6|5)$/,'')===best.name.slice(0,-1))return prev;
  if(prev&&prev!==best.name){const m=prev.match(/^([A-G][#b]?)(.*)$/),r=m&&SHARP.indexOf(m[1]),t=m&&CH_TPL.find(([q])=>q===m[2]);
    if(r>=0&&t){const sc=score(r,t[0],t[1]);if(sc!=null&&sc>=best.sc-(simple?1.2:0.4))return prev;}}
  return best.name;
}
/* аккорды из текста песни: раздел «Где играется» (в приоритете) и вся песня */
function songVocab(where){
  const t=String(SONG.text||''),clean=c=>c.split('|')[0].trim(),w=String(where||'').trim().toLowerCase().replace(/ё/g,'е');
  const all=[...new Set(chordsIn(t).map(clean))],sec=new Set();
  if(w){let on=false;for(const line of t.split('\n')){const cm=line.match(/^\s*\{(?:comment|c):\s*(.*)\}\s*$/i);
    if(cm){on=cm[1].toLowerCase().replace(/ё/g,'е').startsWith(w.split(/[\s,]+/)[0]);continue;}
    if(on)for(const m of line.matchAll(/\[([^\]]+)\]/g))sec.add(clean(m[1]));}}
  return all.length?{all,sec}:null;
}
// шаблон аккорда из названия в тексте: Am7 → m7, F#m → m, Cadd9 → add9, неизвестное — ближайшее (m…, …7, мажор)
const tplOf=q=>{q=normQ(String(q||'').split('/')[0]);const t=CH_TPL.find(([x])=>x===q);if(t)return t;
  const minor=/^m(?!aj)/.test(q),sev=/7/.test(q);return CH_TPL.find(([x])=>x===(minor?(sev?'m7':'m'):(sev?'7':'')));};
function fromVocab(midis,V,prev,simple){
  if(!V||midis.length<2)return null;
  const w=new Array(12).fill(0);midis.forEach(m=>{w[((m%12)+12)%12]+=1;});
  const bass=((Math.min(...midis)%12)+12)%12,pcs=w.map((x,i)=>x?i:-1).filter(i=>i>=0);
  let best=null;
  for(const name of V.all){const c=parseChord(name);if(!c)continue;const t=tplOf(c.q);if(!t)continue;
    const set=t[1].map(i=>(i+c.pc)%12);
    const hit=set.reduce((a,pc)=>a+(w[pc]?Math.min(w[pc],2):0),0),miss=set.filter(pc=>!w[pc]).length,extra=pcs.filter(pc=>!set.includes(pc)).reduce((a,pc)=>a+w[pc],0);
    if(!w[c.pc]&&bass!==c.pc)continue;                                    // корня нет вовсе — не он
    const sl=name.split('/')[1],sb=sl&&parseChord(sl);
    const sc=hit-1.1*miss-(simple?0.35:0.8)*extra+(bass===(sb?sb.pc:c.pc)?(simple?3:1.6):0)+(V.sec.has(name)?0.8:0)+(name===prev?(simple?1.2:0.5):0);
    if(!best||sc>best.sc)best={sc,name};}
  return best&&best.sc>1?best.name:null;
}
/* подписи аккордов по тактам: {"3":"Gm A5@3 C5@4"} — номер такта (с 1) → аккорды через пробел;
   «@3» — на 3-ю долю, «@2и» или «@2.5» — на «2 и»; без «@» — первый на 1-ю долю, остальные поровну по такту; пусто — без подписей */
const Q=960;   // тиков в четверти
const posTxt=t=>{const q=1+t/Q;return Math.abs(q-Math.round(q))<.01?String(Math.round(q)):Math.abs(q-Math.floor(q)-.5)<.01?Math.floor(q)+'и':q.toFixed(2);};
function parseBarLabels(str,barLen){
  const tk=String(str||'').trim().split(/\s+/).filter(Boolean).slice(0,16);if(!tk.length)return [];
  const free=tk.filter(t=>!t.includes('@')).length;let k=0;
  return tk.map(t=>{const [nm,ps]=t.split('@');let at;
    if(ps!=null){const m=ps.replace(',','.').match(/^(\d+(?:\.\d+)?)(и)?$/i);at=m?(+m[1]-1+(m[2]?.5:0))*Q:0;}
    else at=free>1&&barLen?Math.round(k++*barLen/free/Q*2)/2*Q:(k++,0);
    return {name:nm,at};}).filter(x=>/^[A-H]/.test(x.name));
}
function autoChords(score,V,labels){
  const tr=score.tracks[0];if(!tr)return null;
  const st=tr.staves[0];if(!st)return null;
  let has=false;st.bars.forEach(b=>b.voices.forEach(v=>v.beats.forEach(bt=>{if(bt.chordId)has=true;})));
  if(has)return null;                                             // в файле уже есть аккорды автора — не трогаем
  const live=bt=>bt.notes.filter(n=>!n.isDead&&!n.isTieDestination&&n.realValue!=null).map(n=>n.realValue);
  const names=[],bars={};let prev=null,id=0,cur=null;
  const mark=(bt,name)=>{const c=new alphaTab.model.Chord();c.name=name;c.showDiagram=false;c.showFingering=false;const key='auto'+(id++);st.addChord(key,c);bt.chordId=key;};
  const put=(bt,name)=>{if(!bt||!name||name===prev)return;prev=name;names.push(name);mark(bt,name);
    (bars[cur]=bars[cur]||[]).push(bt.playbackStart?name+'@'+posTxt(bt.playbackStart):name);};
  st.bars.forEach((bar,bi)=>{
    cur=bi+1;
    const all=[];bar.voices.forEach(v=>v.beats.forEach(bt=>all.push(bt)));all.sort((a,b)=>a.playbackStart-b.playbackStart);
    const beats=all.filter(bt=>!bt.isRest&&bt.notes.length);
    let len=0;try{len=bar.masterBar.calculateDuration();}catch(e){}
    // свои подписи владельца для этого такта
    if(labels&&Object.prototype.hasOwnProperty.call(labels,String(cur))){
      parseBarLabels(labels[cur],len).forEach(({name,at})=>{const bt=all.find(b=>b.playbackStart>=at-1)||all[all.length-1];if(!bt)return;
        if(bt.chordId){const c=st.getChord(bt.chordId);if(c)c.name+=' '+name;}else mark(bt,name);prev=name;names.push(name);});
      bars[cur]=String(labels[cur]).trim().split(/\s+/).filter(Boolean);
      return;}
    if(!beats.length)return;
    const pick=(m,simple,pv)=>fromVocab(m,V,pv,simple)||chordOf(m,simple,pv);
    const strums=beats.filter(bt=>live(bt).length>=3);
    if(strums.length>=Math.max(1,beats.length/2)){strums.forEach(bt=>put(bt,pick(live(bt),false,prev)));return;}
    // перебор: куски по половинам такта; удар (3+ струны) посреди перебора — подписываем отдельно
    const half=len?len/2:beats[beats.length-1].playbackStart+1;
    let grp=[],gh=-1;
    const flush=()=>{if(!grp.length)return;const n=pick(grp.flatMap(live),true,prev);if(n)put(grp[0],n);grp=[];};
    beats.forEach(bt=>{
      if(live(bt).length>=3){flush();put(bt,pick(live(bt),false,prev));return;}
      const h=bt.playbackStart<half?0:1;if(h!==gh){flush();gh=h;}grp.push(bt);});
    flush();
  });
  const out={};for(let k=1;k<=st.bars.length;k++)out[k]=(bars[k]||[]).join(' ');
  return {names,bars:out,count:st.bars.length};
}
/* раскраска цифр: цветной режим — цвет струны, белый — все белые; интервал / аккорд — стрелка удара (если в файле не задана) */
const colorMode=()=>{try{return prefs.tabColor!==false;}catch(e){return true;}};
function paintNotes(sc){
  const NS=alphaTab.model.NoteSubElement.GuitarTabFretNumber,BT=alphaTab.model.BrushType,cols=SCOL.map(c=>alphaTab.model.Color.fromJson(c)),white=alphaTab.model.Color.fromJson('#EFECFB'),on=colorMode();
  sc.tracks.forEach(t=>t.staves.forEach(stv=>{const n=stv.tuning&&stv.tuning.length||6;
    stv.bars.forEach(b=>b.voices.forEach(v=>v.beats.forEach(bt=>{const ns=bt.notes.filter(x=>!x.isTieDestination);
      if(ns.length>=2&&!bt.brushType)bt.brushType=BT.BrushDown;
      bt.notes.forEach(nt=>{if(!nt.style)nt.style=new alphaTab.model.NoteStyle();nt.style.colors.set(NS,on?cols[Math.max(0,Math.min(5,nt.string-1-Math.max(0,n-6)))]:white);});})));}));
}
/* цвета струн — как на страницах табов: 6-я (толстая) красная … 1-я (тонкая) сиреневая */
const SCOL=['#F26B6F','#F0A830','#E8D44D','#6FBF73','#7CC4F2','#CFA6F7'];
const strLegend=()=>`<div class="rleg rstr"><span class="lt">Струны:</span>${[1,2,3,4,5,6].map(k=>`<i data-s="${k}" style="--c:${SCOL[6-k]}">${k}</i>`).join('')}<span class="lt">1 — самая тонкая · ↑↓ над аккордом — удар вниз / вверх</span></div>`;
/* обозначения под схемой — только те, что встречаются в рисунке */
function legend(P,p){
  let it;
  if(P.kind==='b'){const g=gridOf(p,P)+(p.chords||[]).map(c=>{const e=String(c).indexOf('=');return e<0?'':barGrid(String(c).slice(e+1),P)||'';}).join('');
    it=[['D','↓','вниз','dn'],['U','↑','вверх','up'],['X','✕','вниз с глушением','x'],['B','Б','бас (большой палец)','bs'],['-','·','пауза — звук тянется','h']].filter(([k])=>g.includes(k));}
  else it=[['','Б','бас аккорда (большой палец)','bs'],...(/Б₂/.test(P.schema)?[['','Б₂','соседняя басовая струна','bs']]:[])];
  return `<div class="rleg">${it.map(([,sym,txt,c])=>`<span><b class="${c}">${sym}</b>${txt}</span>`).join('')}</div>`;
}
function stop(){try{S.api&&S.api.stop();}catch(e){}}
let SPEED=1;
function render(p,gen){
  const sp=[1,.75,.5];
  const ui=()=>{const b=$('rSpd');if(!b)return;b.textContent='Скорость '+Math.round(SPEED*100)+'%';b.classList.toggle('on',SPEED<1);
    const lp=!!(S.api&&S.api.isLooping);$('rLoop').classList.toggle('on',lp);$('rLoop').setAttribute('aria-pressed',lp);};
  if(PAT[p.pattern]&&!gen){$('rLoad').textContent='Не получилось разложить рисунок по аккордам этой части.';return;}
  loadAlphaTab().then(()=>{
    try{S.api&&S.api.destroy();}catch(e){}
    S.ready=false;
    const api=S.api=new alphaTab.AlphaTabApi($('riffAt'),{
      core:{fontDirectory:AT_DIR+'font/',scriptFile:AT_DIR+'alphaTab.min.js',useWorkers:true},
      display:{staveProfile:'Tab',scale:narrow()?.85:1,layoutMode:'Page',systemPaddingBottom:28,barsPerRow:narrow()?2:4,
        resources:{engravingSettings:{tabLineSpacing:14},staffLineColor:'rgba(138,132,214,0.38)',barSeparatorColor:'rgba(169,163,230,0.6)',mainGlyphColor:'rgba(225,220,255,0.85)',secondaryGlyphColor:'#A4A1D8',barNumberColor:'#A4A1D8',tablatureFont:'bold 15px Manrope, Arial, sans-serif',barNumberFont:'600 11px Manrope, Arial, sans-serif',markerFont:'800 14px Manrope, Arial, sans-serif'}},
      notation:{rhythmMode:'ShowWithBars',rhythmHeight:34,elements:{scoreTitle:false,scoreSubTitle:false,scoreArtist:false,scoreAlbum:false,scoreWords:false,scoreMusic:false,scoreWordsAndMusic:false,scoreCopyright:false,guitarTuning:false,trackNames:false,effectDynamics:false,effectCapo:false,effectTempo:false,chordDiagrams:false,effectPalmMute:false}},
      player:{playerMode:'EnabledSynthesizer',soundFont:AT_DIR+'soundfont/sonivox.sf3',enableCursor:true,enableUserInteraction:true,scrollMode:'Continuous',scrollElement:$('riffAt').parentElement,scrollOffsetY:-12}   // длинный таб едет внутри окна (не выше двух строк), страница стоит на месте
    });
    api.isLooping=false;api.playbackSpeed=SPEED;
    // названия аккордов над табом — шрифтом сайта, а не наклонным с засечками
    try{const r=api.settings.display.resources,F=alphaTab.model.Font.fromJson('800 16px Manrope, Arial, sans-serif');if(F){r.elementFonts.set(alphaTab.NotationElement.EffectChordNames,F);api.updateSettings();}}catch(e){}
    api.scoreLoaded.on(sc=>{
      if(!gen){try{const r=autoChords(sc,songVocab(p.where),p.labels),n=r&&r.names;const c=$('rAuto');if(c&&n&&n.length){const u=[];n.forEach(x=>{if(!u.includes(x))u.push(x);});c.textContent=u.slice(0,8).join(' · ');c.hidden=false;}}catch(e){console.warn('autoChords',e);}}
      // каждая цифра — цветом своей струны; интервал / аккорд — ещё и стрелка удара (если в файле не задана)
      S.score=sc;try{paintNotes(sc);}catch(e){console.warn('riff colors',e);}
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
    const bStarts=(gen&&gen.grids||[]).map(g=>{if(!g)return null;const a=[];let t=0;gridEv(g).forEach(([,d])=>{a.push(t);t+=d;});return a;});
    if(ev)api.playedBeatChanged.on(b=>{if(!b)return;const i=b.index;let bi=-1;try{bi=b.voice.bar.index;}catch(e){}
      const st=bStarts[bi]||starts;lit(P.kind==='b'?st[i]:i);});
    api.playerStateChanged.on(e=>{if(e.state!==1){lit(-1);strLit(null);}});
    // строка «Струны»: одна нота — горит её струна; интервал / аккорд — горят все его струны со стрелкой удара
    function strLit(bt){const row=S.box&&S.box.querySelector('.rstr');if(!row)return;
      const on=new Map();
      if(bt){const ns=bt.notes.filter(x=>!x.isTieDestination||bt.notes.length===1),n=(bt.voice&&bt.voice.bar.staff.tuning||[]).length||6;
        const arrow=ns.length>=2?(bt.brushType===alphaTab.model.BrushType.BrushUp||bt.brushType===alphaTab.model.BrushType.ArpeggioUp?'↑':'↓'):null;
        ns.forEach(nt=>{const disp=6-Math.max(0,Math.min(5,nt.string-1-Math.max(0,n-6)));on.set(disp,arrow);});}
      row.querySelectorAll('i[data-s]').forEach(el=>{const k=+el.dataset.s,hit=on.has(k);el.classList.toggle('on',hit);el.textContent=hit&&on.get(k)?on.get(k):k;
        el.classList.remove('hit');if(hit){void el.offsetWidth;el.classList.add('hit');}});}
    api.playedBeatChanged.on(b=>{if(b)strLit(b);});
    api.playerReady.on(()=>{S.ready=true;const b=$('rPlay');if(b)b.disabled=false;});
    api.playerStateChanged.on(e=>{const b=$('rPlay');if(!b)return;const on=e.state===1;b.textContent=on?'❚❚':'▶';b.classList.toggle('pause',on);});
    api.error.on(e=>{const l=$('rLoad');if(l){l.hidden=false;l.textContent='Не удалось открыть таб.';}console.error('riff',e);});
    if(gen)api.tex(gen.tex);else if(p._file)p._file.arrayBuffer().then(b=>api.load(new Uint8Array(b)));else if(p.tex)api.tex(p.tex);else api.load(new URL(p.src,document.baseURI).href);
    $('rPlay').onclick=()=>S.ready&&api.playPause();
    $('rSpd').onclick=()=>{SPEED=sp[(sp.indexOf(SPEED)+1)%sp.length];api.playbackSpeed=SPEED;ui();};
    $('rLoop').onclick=()=>{api.isLooping=!api.isLooping;ui();};
    const colUI=()=>{const on=colorMode(),b=$('rCol');if(b){b.classList.toggle('on',on);b.setAttribute('aria-pressed',on);b.textContent=on?'🎨 Цвета':'⚪ Белые';}S.box.classList.toggle('mono',!on);};
    $('rCol').onclick=()=>{try{prefs.tabColor=!colorMode();savePrefs();}catch(e){}colUI();if(S.score){paintNotes(S.score);api.render();}};
    colUI();
    ui();
  }).catch(()=>{const l=$('rLoad');if(l)l.textContent='Не удалось загрузить плеер табов.';});
}
/* пробел — играть / пауза (если курсор не в поле ввода) */
addEventListener('keydown',e=>{
  if(!(e.code==='Space'||e.key===' ')||!S||!S.api||!S.ready||e.ctrlKey||e.metaKey||e.altKey)return;
  const a=document.activeElement;if(a&&(/^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)||a.isContentEditable))return;
  if(a&&a.tagName==='BUTTON'&&!a.closest('.riff'))return;   // пробел на другой кнопке — пусть нажимает её
  e.preventDefault();S.api.playPause();
});
let wN=narrow();
addEventListener('resize',()=>{if(!S||!S.api||narrow()===wN)return;wN=narrow();const d=S.api.settings.display;d.barsPerRow=wN?2:4;d.scale=wN?.85:1;S.api.updateSettings();S.api.render();});

/* страница сменила тональность / «Простые аккорды»: map(аккорд песни) → аккорд на экране */
function update(map){
  if(!S)return;S.map=map;
  if(!S.box||!S.parts.length)return;
  const p=S.parts[S.cur];if(!PAT[p.pattern])return;
  const key=JSON.stringify((p.chords&&p.chords.length?p.chords:sectionChords(p.where)).map(c=>mapC(c,map)))+(p.grid||'');
  if(key===S.key)return;S.key=key;stop();draw();
}

/* ===== владелец: части песни правятся прямо на странице ===== */
function ownerUI(panel){
  const API='https://functions.yandexcloud.net/d4epurfr35kcn0fl97up';
  const bar=document.createElement('div');bar.className='rown';
  bar.innerHTML=`<button type="button" id="rEdit">＋ Добавить бой / перебор</button>`;if(S.parts.length)bar.hidden=true;
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
    ${p.pattern?'':'<!--'}<label class="wide">Аккорды (необязательно — иначе из раздела «${H(p.where||'…')}»). Повтор: x3 после группы, группы через « | »<input data-k="chords" value="${H((p.chords||[]).join(' ').replace(/\( /g,'(').replace(/ \)/g,')'))}" placeholder="${H(sectionChords(p.where).join(' '))}"></label>${p.pattern?'':'-->'}
    ${p.pattern?'':`<div class="wide rfile"><label class="rfbtn">📁 ${p._file||p.src?'Заменить файл':'Выбрать файл Guitar Pro'}<input type="file" data-k="file" accept=".gp,.gp3,.gp4,.gp5,.gpx" hidden></label>
      <span>${p._file?`Выбран: <b>${H(p._file.name)}</b> — нажми «Показать на странице», чтобы проверить`:p.src?`Сейчас: <b>${H(p.src.split('/').pop())}</b>`:'gp, gp3, gp4, gp5, gpx — до 2 МБ'}</span></div>
    <label class="wide">…или текст alphaTex<textarea data-k="tex" spellcheck="false">${H(p.tex||'')}</textarea></label>
    ${p._file||p.src||p.tex?`<div class="wide rlab" data-lab="${i}"><span class="rgl">Аккорды над табом — загружаю…</span></div>`:''}`}
  </div>`;
  const SYM={D:'↓',U:'↑',X:'✕',B:'Б','-':'·'},NEXT={D:'U',U:'X',X:'B',B:'-','-':'D'};
  const gridRow=(p,i)=>{const P=PAT[p.pattern],g=gridOf(p,P),c=COUNT[P.ts],own=g!==P.grid;
    return `<div class="wide rge"><span class="rgl">Удары по долям — нажми, чтобы сменить: ↓ → ↑ → ✕ глушение → Б бас → · пауза${own?' · <button type="button" class="rgr" data-reset="'+i+'">Как было</button>':''}</span>
      <div class="rgb">${[...g].map((ch,k)=>`<button type="button" data-slot="${k}" data-row="${i}" class="${ch==='X'?'x':ch==='-'?'h':''}"><b>${SYM[ch]}</b><small>${c[k]}</small></button>`).join('')}</div></div>`;};
  let helpOpen=!list.length;
  const help=()=>`<details class="rhelp"${helpOpen?' open':''}><summary>📖 Шпаргалка</summary>
    <div class="rh1"><b>Как добавить</b><ol>
      <li><b>＋ Часть</b> — новая часть песни. У одной песни до 6 частей: например, перебор во вступлении и бой в припеве. На странице они переключаются вкладками.</li>
      <li><b>Что</b> — Перебор, Бой, Вступление, Риф или Проигрыш (это подпись на вкладке).</li>
      <li><b>Где играется</b> — название раздела <i>как в тексте песни</i> (подсказки всплывают): Вступление, Куплет, Припев… Аккорды берутся из этого раздела сами: один круг, до 4 тактов, по такту на аккорд.</li>
      <li><b>Рисунок</b> — бой или перебор из списка; таб и звук построятся по аккордам песни сами. «Свой (файл GP / alphaTex)» — для уникальной партии.</li>
      <li><b>Темп</b> — ударов в минуту; пусто — бой 96, перебор 80.</li>
      <li><b>Аккорды</b> — заполняй, только если нужен другой порядок, больше тактов или повторы (см. ниже).</li>
      <li><b>Показать на странице</b> — увидеть результат у себя, никто кроме тебя не видит. <b>Опубликовать</b> — для всех, появится через 1–2 минуты (обнови страницу Ctrl+F5). Убрать часть — ✕ и «Опубликовать»; убрать всё — удалить все части и «Опубликовать».</li></ol></div>
    <div class="rh1"><b>Аккорды и повторы</b><table>
      <tr><td><code>Am F C G</code></td><td>4 такта, по такту на аккорд (через пробел или запятую)</td></tr>
      <tr><td><code>Am F C G x3</code></td><td>вся строка 3 раза (<code>×3</code> и русская «х3» тоже понимаются)</td></tr>
      <tr><td><code>Dm F Gm A x3 | Bb C</code></td><td>первая группа 3 раза, вторая один; « | » — отдельным словом, через пробелы</td></tr>
      <tr><td><code>(Dm F) x2 Gm A</code></td><td>повтор только того, что в скобках</td></tr>
      <tr><td><code>Gm+A5</code></td><td>два аккорда в одном такте — по половине такта (на «1–2» и «3–4»)</td></tr>
      <tr><td><code>Gm+Gm+A5+C5=v.v^v.v.</code></td><td>свой ритм этого такта (только бой): после «=» удары по восьмым «1 и 2 и 3 и 4 и» — <b>v</b> вниз, <b>^</b> вверх, <b>x</b> с глушением, <b>b</b> бас, <b>.</b> пауза / звук тянется. Здесь: Gm ↓ ↓↑, A5 ↓, C5 ↓</td></tr>
      <tr><td><code>Gm+Gm+A5+C5</code></td><td>Gm на «1–2», A5 на «3», C5 на «4»: аккорды через «+» делят такт поровну, повтор аккорда — дольше звучит</td></tr>
      <tr><td><code>Am|5x5553 C</code></td><td>аккорд со своей аппликатурой — как в тексте песни</td></tr>
      <tr><td>пусто</td><td>аккорды из раздела «Где играется»; раздел «Вступление ×4» сам даёт повтор ×4</td></tr></table>
      <ul><li>«+» без пробелов. В такте 4/4 можно 2, 4 или 8 аккордов, в 3/4 — 2, 3 или 6.</li>
      <li>До 32 тактов в части (8 строк по 4). Повтор x2…x8; на табе — знаки ‖: :‖ с «x3», звук повторяется нужное число раз.</li>
      <li>Аккорды пиши в тональности оригинала — тон посетителя и «Простые аккорды» применятся сами.</li></ul></div>
    <div class="rh1"><b>Свой бой</b><ul>
      <li>Выбери любой бой из списка — под строкой появятся доли «1 и 2 и 3 и 4 и». Нажимай на долю — удар меняется по кругу: <b>↓ → ↑ → ✕ → Б → ·</b>. Первая доля не может быть паузой.</li>
      <li>«Как было» — вернуть стандартный рисунок. На странице такой бой подписан «Бой — свой рисунок».</li>
      <li>Рисунок один на все такты части; если в каком-то месте бой другой — сделай отдельную часть.</li></ul></div>
    <div class="rh1"><b>Обозначения</b><ul>
      <li><b>Б</b> — бас аккорда (большой палец, самая низкая струна аппликатуры), <b>Б₂</b> — соседняя басовая струна; <b>1 2 3</b> — струны, 1 — самая тонкая. Если у аккорда меньше звучащих струн (например, квинта A5), берутся верхние из тех, что есть.</li>
      <li><b>↓</b> удар вниз · <b>↑</b> вверх (по 4 тонким струнам) · <b>✕</b> вниз с глушением · <b>Б</b> один бас · <b>·</b> пауза / звук тянется. Счёт: <b>1 и 2 и 3 и 4 и</b>.</li>
      <li>В табе стрелки удара нарисованы по правилам Guitar Pro: удар вниз идёт от толстой струны к тонкой, поэтому стрелка на табе смотрит вверх. Главная схема — крупные стрелки над табом.</li></ul></div>
    <div class="rh1"><b>Рисунки</b><table>${Object.values(PAT).map(P=>`<tr><td>${P.kind==='b'?'Бой':'Перебор'} «${H(P.name)}»</td><td><code>${P.kind==='b'?[...P.grid].map(c=>SYM[c]).join(' '):H(P.schema)}</code></td><td>${P.ts===3?'3/4':'4/4'}</td><td>${H(P.desc)}</td></tr>`).join('')}</table></div>
    <div class="rh1"><b>Что видят посетители</b><ul>
      <li>Вкладки частей, крупную схему боя стрелками со счётом (или порядок струн перебора) и короткое пояснение.</li>
      <li>Таб со звуком (стальная акустика): ▶ играть, <b>скорость</b> 100 / 75 / 50%, <b>повтор</b> по кругу (значок ⟳, по умолчанию выключен), <b>пробел</b> — играть / пауза. Можно выделить такты мышью — повторяется участок.</li>
      <li>Во время игры подсвечивается текущая стрелка или струна, курсор бежит по табу. Окно не выше двух строк — длинный таб прокручивается внутри, страница стоит на месте.</li>
      <li>Сменили тон или включили «Простые аккорды» — таб перестраивается под новые аккорды.</li>
      <li>Для поисковиков на странице появляется строчка «Как играть: бой «шестёрка» (куплет)…».</li></ul></div>
    <div class="rh1"><b>Своя партия</b> — рисунок «свой (файл GP / alphaTex)»:<ul>
      <li><b>Как загрузить:</b> кнопка <b>«📁 Загрузить свой таб»</b> внизу формы → выбери файл → укажи «Что» и «Где играется» → «Показать на странице» (проверить) → «Опубликовать». Заменить файл — «📁 Заменить файл» в этой части.</li>
      <li><b>Guitar Pro</b>: одна гитарная дорожка, до 2 МБ (gp, gp3, gp4, gp5, gpx). Свою партию тон посетителя не меняет.</li>
      <li><b>Поправить аккорды</b>: в части со своим табом есть блок «Аккорды над табом» — поле на каждый такт с тем, что распознал сайт. Пиши <code>Dm</code>, <code>Gm A5@3 C5@4</code> (@3 — на 3-ю долю, @2и — на «2 и»), стёр — без подписи. «Как распознал» — вернуть всё.</li>
      <li><b>Аккорды над табом</b> сайт подпишет сам — берёт аккорды из текста песни (сначала из раздела «Где играется», потом из всей песни) и по нотам каждого такта выбирает, какой звучит; если ни один не подходит — распознаёт по нотам (удар из 3+ струн — по нему, перебор — по басу половины такта) и покажет только там, где аккорд меняется. Если в файле аккорды уже подписаны (Guitar Pro: Текст аккорда), берутся твои. Распознавание примерное: в сложной аранжировке с мелодией лучше подписать аккорды в Guitar Pro.</li>
      <li><b>alphaTex</b> — таб текстом: <code>лад.струна</code> — нота (<code>0.1</code> — открытая 1-я); <code>(0.1 1.2 0.3)</code> — несколько струн сразу; <code>:8</code> — дальше восьмые (<code>:4</code> четверти, <code>:2</code> половинные, <code>:16</code> шестнадцатые); <code>{d}</code> — с точкой; <code>r</code> — пауза; <code>|</code> — новый такт; <code>{ch "Am"}</code> — название аккорда; <code>x.3</code> — глушёная струна; <code>{bd}</code> / <code>{bu}</code> — удар вниз / вверх; <code>\\ts 3 4</code> — размер 3/4; <code>\\ro</code> … <code>\\rc 3</code> в начале тактов — повтор 3 раза.</li>
      <li>Пример (перебор Am и E, восьмые, 2 раза):<pre>\\tempo 80
.
\\ro :8 0.5{ch "Am"} 2.3 1.2 2.3 0.1 2.3 1.2 2.3 |
\\rc 2 0.6{ch "E"} 1.3 0.2 1.3 0.1 1.3 0.2 1.3 |</pre></li></ul></div>
    <div class="rh1"><b>Если что-то не так</b><ul>
      <li>«Опубликовать» пишет ошибку — обнови серверную функцию (архив fretboard-lb.zip, Cloud Functions → fretboard-lb → Редактор → ZIP).</li>
      <li>«Не получилось разложить рисунок» — в разделе нет аккордов или название в «Где играется» не совпадает с текстом песни; впиши аккорды вручную.</li>
      <li>Опубликовал, а на странице старое — подожди 1–2 минуты и обнови Ctrl+F5.</li>
      <li>Можно просто написать Claude: «Кукла колдуна: вступление — перебор восьмёрка, куплет — бой шестёрка x2» — добавит сам.</li></ul></div>
  </details>`;
  /* «Аккорды над табом»: поле на каждый такт — то, что распознал сайт; правки сохраняются в part.labels */
  const loadScore=async p=>{await loadAlphaTab();const set=new alphaTab.Settings();
    if(p.tex&&!p._file){const t=new alphaTab.importer.AlphaTexImporter();t.initFromString(p.tex,set);return t.readScore();}
    const buf=p._file?await p._file.arrayBuffer():await (await fetch(new URL(p.src,document.baseURI).href)).arrayBuffer();
    return alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(buf),set);};
  async function labEditor(el,p){
    try{
      if(!p._auto){const sc=await loadScore(p);const r=autoChords(sc,songVocab(p.where));
        if(!r){el.innerHTML='<span class="rgl">В файле уже подписаны аккорды (Guitar Pro) — показываются они. Чтобы править здесь, убери их в Guitar Pro.</span>';return;}
        p._auto=r.bars;p._count=r.count;}
      const L=p.labels||{},n=Math.min(p._count,64);
      el.innerHTML=`<span class="rgl">Аккорды над табом — по тактам. Можно править: <code>Dm</code>, <code>Gm A5@3 C5@4</code> (@3 — 3-я доля, @2и — «2 и»). «—» — аккорд тянется с прошлого такта; стереть — без подписи. Правленые такты в оранжевой рамке, «Показать на странице» — проверить.${Object.keys(L).length?' · <button type="button" class="rgr" data-lreset>Как распознал</button>':''}</span>
        <div class="rlb">${Array.from({length:n},(_,k)=>{const b=k+1,v=Object.prototype.hasOwnProperty.call(L,b)?L[b]:p._auto[b]||'';
          return `<label class="${Object.prototype.hasOwnProperty.call(L,b)?'own':''}"><small>${b}</small><input data-bar="${b}" value="${H(v)}" placeholder="${H(p._auto[b]||'—')}" spellcheck="false"></label>`;}).join('')}</div>`;
      el.querySelectorAll('[data-bar]').forEach(inp=>inp.addEventListener('input',()=>{const b=inp.dataset.bar,v=inp.value.trim().replace(/\s+/g,' ');p.labels=p.labels||{};
        if(v===(p._auto[b]||''))delete p.labels[b];else p.labels[b]=v;inp.parentElement.classList.toggle('own',b in p.labels);}));
      const rs=el.querySelector('[data-lreset]');if(rs)rs.onclick=()=>{delete p.labels;labEditor(el,p);};
    }catch(e){el.innerHTML='<span class="rgl">Не удалось прочитать таб, чтобы показать аккорды.</span>';console.warn(e);}
  }
  const paint=()=>{f.innerHTML=`<h3>Как играть</h3>${help()}<datalist id="rSecs">${secs.map(s=>`<option value="${H(s)}">`).join('')}</datalist>
    <div class="rpl">${list.map(row).join('')||'<small>Пока пусто — добавь часть: например «Перебор · Куплет · восьмёрка» и «Бой · Припев · шестёрка».</small>'}</div>
    <div class="rb"><button type="button" id="rAdd">＋ Часть</button><button type="button" id="rUp">📁 Загрузить свой таб</button><button type="button" id="rPrev">Показать на странице</button><button class="go" type="submit">Опубликовать</button><button type="button" id="rX">Закрыть</button></div>
    <small>Аккорды берутся из раздела песни с тем же названием, что в «Где играется». Рисунок «свой» — для уникальной партии из Guitar Pro. «Показать на странице» — проверить у себя до публикации; посетители увидят через 1–2 минуты после «Опубликовать».</small>
    <div class="rmsg" id="rM"></div>`;
    f.querySelectorAll('[data-k]').forEach(el=>{el.addEventListener(el.type==='file'?'change':'input',()=>{const i=+el.closest('.rpi').dataset.i,k=el.dataset.k;
      if(k==='file'){list[i]._file=el.files[0]||null;if(list[i]._file)delete list[i].tex;delete list[i]._auto;delete list[i].labels;paint();return;}
      if(k==='chords'){list[i].chords=el.value.trim()?chordTokens(el.value):undefined;
        // подсказка: ритм такта после «=» должен быть ровно на весь такт
        const P=PAT[list[i].pattern],bad=[];
        if(P&&P.kind==='b')(list[i].chords||[]).forEach(t=>{const e=t.indexOf('=');if(e<0)return;const g=t.slice(e+1);
          if(!barGrid(g,P))bad.push(`«${t.slice(0,e)}=${g}»: ${[...g].length===P.grid.length?'первый знак не может быть точкой':`нужно ${P.grid.length} знаков (${P.ts===3?'«1 и 2 и 3 и»':'«1 и 2 и 3 и 4 и»'}), сейчас ${[...g].length}`}`);});
        msg(bad.length?'Ритм такта не подходит — '+bad.join('; ')+'. Такой такт сыграется обычным рисунком.':'',!!bad.length);}
      else if(k==='bpm')list[i].bpm=+el.value||undefined;
      else list[i][k]=el.value;
      if(k==='pattern'){delete list[i].grid;}
      if(k==='where'||k==='tex')delete list[i]._auto;
      if(k==='pattern'||k==='where')paint();});});
    const hp=f.querySelector('.rhelp');if(hp)hp.ontoggle=()=>{helpOpen=hp.open;};
    f.querySelectorAll('[data-del]').forEach(b=>b.onclick=()=>{list.splice(+b.dataset.del,1);paint();});
    f.querySelectorAll('[data-lab]').forEach(el=>labEditor(el,list[+el.dataset.lab]));
    f.querySelectorAll('[data-slot]').forEach(b=>b.onclick=()=>{const p=list[+b.dataset.row],P=PAT[p.pattern],g=[...gridOf(p,P)],k=+b.dataset.slot;
      g[k]=NEXT[g[k]];if(k===0&&g[0]==='-')g[0]='D';p.grid=g.join('');if(p.grid===P.grid)delete p.grid;paint();});
    f.querySelectorAll('[data-reset]').forEach(b=>b.onclick=()=>{delete list[+b.dataset.reset].grid;paint();});
    $('rUp').onclick=()=>{list.push({type:'Вступление',where:secs[0]||'',pattern:''});const i=list.length-1;paint();
      const inp=f.querySelector(`.rpi[data-i="${i}"] input[type=file]`);if(inp){inp.closest('.rpi').scrollIntoView({block:'center'});inp.click();}};
    $('rAdd').onclick=()=>{list.push({type:list.length?'Бой':'Перебор',where:secs[list.length]||secs[0]||'',pattern:list.length?'b6':'p8'});paint();};
    $('rPrev').onclick=()=>{window.SONG_RIFF={parts:clean(list,true)};const keep=list;mount();list=keep;$('rEdit').click();msg('Так это увидят посетители (пока только у тебя). Не забудь «Опубликовать».');};
    $('rX').onclick=()=>{f.hidden=true;};
  };
  const clean=(l,local)=>l.map(p=>{const o={type:TYPES.includes(p.type)?p.type:'Перебор'};if(p.where)o.where=String(p.where).slice(0,40);
    if(p.pattern&&PAT[p.pattern]){o.pattern=p.pattern;if(p.chords&&p.chords.length)o.chords=p.chords.slice(0,96);if(p.bpm)o.bpm=p.bpm;if(okGrid(p.grid,PAT[p.pattern])&&p.grid!==PAT[p.pattern].grid)o.grid=p.grid;}
    else{if(p.tex)o.tex=p.tex;if(p.src)o.src=p.src;if(local&&p._file)o._file=p._file;if(p.labels&&Object.keys(p.labels).length)o.labels=Object.assign({},p.labels);}
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
  // «✎ Редактировать» в блоке: открыть форму и подсветить ту часть, что сейчас на экране
  window.RIFF_EDIT=i=>{f.hidden=false;if(!f.innerHTML)paint();
    const row=f.querySelector(`.rpi[data-i="${i}"]`)||f;f.scrollIntoView({behavior:'smooth',block:'start'});
    if(row!==f){row.classList.add('hl');setTimeout(()=>row.classList.remove('hl'),1600);const inp=row.querySelector('select,input');if(inp)setTimeout(()=>inp.focus({preventScroll:true}),400);}};
  paint();
}

window.RIFF={mount,update,PAT,buildTex,sectionChords};
// страница могла отрисоваться раньше, чем загрузился этот файл
if(document.querySelector('#content .panel')&&typeof SONG!=='undefined'&&SONG&&!SONG.tab)mount();
})();
