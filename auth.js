/* Общий вход на сайт ditrihh: Яндекс ID (и VK ID, когда VK примет домен).
   Подключается на всех страницах сайта и в школе. Сессия одна на весь сайт: localStorage 'dgc_link'.
   Возврат от Яндекса и VK — всегда на login.html (один Redirect URI для всего сайта). */
(function(){
  const API='https://functions.yandexcloud.net/d4epurfr35kcn0fl97up';
  const VK=''; // 54812686 — включить, когда VK ID примет домен ditrihh.ru (сейчас считает его «вредоносным»)
  const YA='5bd936c6b76b4d91918fe1848e72189d';
  const KEY='dgc_link';
  const ROOT=new URL('.',document.currentScript.src).href;
  const CB=ROOT+'login.html';

  const getLink=()=>{try{const l=JSON.parse(localStorage.getItem(KEY)||'null');return l&&l.token?l:null;}catch(e){return null;}};
  const rnd=n=>{const a=new Uint8Array(n);crypto.getRandomValues(a);return b64u(a);};
  function b64u(buf){return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
  const esc=t=>String(t||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

  async function start(prov){
    const st={prov,state:rnd(24),ret:location.href.split('#')[0],t:Date.now()};
    if(prov==='vk'){
      st.verifier=rnd(48);
      const ch=b64u(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(st.verifier)));
      try{sessionStorage.setItem('dgc_oauth',JSON.stringify(st));}catch(e){}
      location.href='https://id.vk.ru/authorize?'+new URLSearchParams({response_type:'code',client_id:VK,redirect_uri:CB,state:st.state,code_challenge:ch,code_challenge_method:'S256',scope:'vkid.personal_info'});
    }else{
      try{sessionStorage.setItem('dgc_oauth',JSON.stringify(st));}catch(e){}
      location.href='https://oauth.yandex.ru/authorize?'+new URLSearchParams({response_type:'token',client_id:YA,redirect_uri:CB,state:st.state,force_confirm:'no'});
    }
  }
  async function logout(){
    const l=getLink();
    if(l){try{await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({initData:'',token:l.token,action:'unlink'})});}catch(e){}}
    try{localStorage.removeItem(KEY);}catch(e){}
    location.reload();
  }
  const name=u=>u?[u.first_name,u.last_name].filter(Boolean).join(' ')||u.username||'Гитарист':'Гитарист';

  /* ===== Рейтинг: время на сайте (раз в минуту, пока вкладка открыта и человек что-то делает), статусы, ачивки ===== */
  const post=b=>fetch(API,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(b)}).then(r=>r.ok?r.json():Promise.reject(r.status));
  const rated=()=>{const l=getLink();return l&&/^(ya|vk|admin)_/.test(String(l.user&&l.user.id))?l:null;};
  let lastAct=Date.now();
  ['mousemove','scroll','keydown','touchstart','click'].forEach(e=>addEventListener(e,()=>{lastAct=Date.now();},{passive:true}));
  setInterval(async()=>{
    const l=rated();if(!l||document.hidden||Date.now()-lastAct>120e3)return;
    try{const r=await post({action:'ping',token:l.token});toast(r.fresh,r.up,r.rub,r.notes);}catch(e){}
  },60e3);
  function toast(fresh,up,rub,notes){
    const items=(notes||[]).map(n=>`<a class="at-i" href="${esc(n.href||'#')}"><span>🎸</span><div><b>${esc(n.note)}</b><small>${esc(n.sub||'')}${n.href?' · открыть →':''}</small></div></a>`).concat((fresh||[]).map(a=>`<div class="at-i"><span>${a.icon||'🏆'}</span><div><b>Новая ачивка: ${esc(a.name)}</b><small>${esc(a.desc||'')}</small></div></div>`));
    if(rub)items.unshift(`<div class="at-i"><span>💛</span><div><b>Донат засчитан: +${Math.round(rub)} ₽</b><small>Спасибо за поддержку! +${Math.floor(rub/10)} очков</small></div></div>`);
    if(up)items.unshift(`<div class="at-i"><span>⭐</span><div><b>Новый статус: ${esc(up)}</b><small>Так держать!</small></div></div>`);
    if(!items.length)return;
    let box=document.getElementById('achToast');
    if(!box){box=document.createElement('div');box.id='achToast';document.body.appendChild(box);
      const css=document.createElement('style');css.textContent='#achToast{position:fixed;right:16px;top:84px;z-index:95;display:flex;flex-direction:column;gap:10px;max-width:min(340px,calc(100vw - 32px))}#achToast .at-i{display:flex;gap:12px;align-items:center;padding:12px 16px;border-radius:16px;background:#1C1848;border:1px solid rgba(240,168,48,.6);box-shadow:0 14px 34px rgba(0,0,0,.5);color:#EFECFB;font-family:Manrope,system-ui,sans-serif;animation:atin .4s ease-out}#achToast .at-i>span{font-size:28px}#achToast a.at-i{text-decoration:none}#achToast b{display:block;font-size:14px;font-weight:800}#achToast small{display:block;color:#B9B4E6;font-weight:600;font-size:12px;margin-top:2px}@keyframes atin{from{opacity:0;transform:translateY(-10px)}}';document.head.appendChild(css);}
    items.forEach(h=>{const d=document.createElement('div');d.innerHTML=h;const el=d.firstChild;box.appendChild(el);setTimeout(()=>el.remove(),el.tagName==='A'?15000:6000);});
  }
  /* бонусы: подключить Twitch (фоллоу/саб) и Telegram (подписка на канал) */
  async function connectTwitch(){
    const l=rated();if(!l)return;
    let id;try{id=(await post({action:'tw_client',token:l.token})).client_id;}catch(e){}
    if(!id){alert('Подключение Twitch пока не настроено.');return;}
    const st={prov:'tw',state:rnd(24),ret:location.href.split('#')[0],t:Date.now()};
    try{sessionStorage.setItem('dgc_oauth',JSON.stringify(st));}catch(e){}
    location.href='https://id.twitch.tv/oauth2/authorize?'+new URLSearchParams({response_type:'token',client_id:id,redirect_uri:CB,scope:'user:read:follows user:read:subscriptions',state:st.state,force_verify:'false'});
  }
  let tgPoll=null;
  async function tgCheck(el,quiet){
    const l=rated();if(!l)return;
    try{const r=await post({action:'tg_check',token:l.token});
      if(r.linked&&!r.member&&!quiet)alert('Подписки на t.me/ditrihh пока не видно. Подпишись и нажми «Проверить» ещё раз.');
      toast(r.fresh,r.up);paintStats(el);
    }catch(e){if(!quiet)alert(e===409?'Этот Telegram уже привязан к другому аккаунту сайта.':'Не получилось проверить подписку, попробуй позже.');}
  }
  function connectTg(el){
    const l=rated();if(!l)return;
    const nonce=rnd(18),since=Date.now();
    window.open(`https://t.me/ditrihh_bot?startapp=link_${nonce}`,'_blank');
    const b=el.querySelector('[data-tg]');if(b)b.textContent='Ждём подтверждения в Telegram…';
    clearInterval(tgPoll);
    tgPoll=setInterval(async()=>{
      if(Date.now()-since>15*60e3){clearInterval(tgPoll);return;}
      try{const r=await post({action:'claim',nonce,token:l.token});
        if(r.token){clearInterval(tgPoll);tgCheck(el,true);}else if(r.expired)clearInterval(tgPoll);}catch(e){}
    },2500);
  }
  try{const b=JSON.parse(sessionStorage.getItem('dgc_bonus')||'null');if(b){sessionStorage.removeItem('dgc_bonus');
    addEventListener('load',()=>{toast(b.fresh,b.up);if(!b.follow)setTimeout(()=>alert(`Twitch @${b.login} подключён, но фоллоу на twitch.tv/ditrihh пока нет. Зафоллоь и нажми «Проверить» в меню аккаунта.`),400);});}}catch(e){}
  const fmtTime=sec=>{const h=Math.floor(sec/3600),m=Math.floor(sec%3600/60);return h?`${h} ч ${m} мин`:`${m} мин`;};
  async function paintStats(el){
    const l=rated();if(!l||!el)return;
    el.innerHTML='<p class="ab-st-muted">Загружаю рейтинг…</p>';
    let r;try{r=await post({action:'stats',token:l.token});}catch(e){el.innerHTML='';return;}
    if(r.owner){el.innerHTML=`<div class="ab-rank"><b class="lvown">${esc(r.rank)}</b><span>Тот Самый · основатель</span></div>`;return;}
    const pct=r.next?Math.round((r.points-r.from)/(r.next.at-r.from)*100):100;
    el.innerHTML=`<div class="ab-rank"><b class="${l.prov==='admin'?'lvown':'lv'+r.level}">${esc(r.rank)}</b><span>уровень ${r.level}</span></div>
      <div class="ab-bar"><i style="width:${Math.max(3,Math.min(100,pct))}%"></i></div>
      <div class="ab-next">${r.next?`${r.points} / ${r.next.at} очков до «${esc(r.next.rank)}»`:`${r.points} очков — высший статус`}</div>
      <div class="ab-nums"><span>⏱️ ${fmtTime(r.sec)}</span><span>💬 ${r.comments}</span>${r.rub?`<span>💛 ${r.rub.toLocaleString('ru-RU')} ₽</span>`:''}</div>
      ${r.code?`<div class="ab-code"><span>Код для доната</span><b>${esc(r.code)}</b><button type="button" data-copy="${esc(r.code)}" title="Скопировать">⧉</button><button type="button" data-help title="Что это?">?</button><small hidden>Добавь код в сообщение к <a href="https://dalink.to/ditrihh" target="_blank" rel="noopener">донату</a> — сумма попадёт в рейтинг и ачивки.</small></div>`:''}
      <div class="ab-bon">
        <div class="ab-brow"><span>💜 Twitch</span>${r.twitch?`<em>${r.ach.find(a=>a.id==='tw').got?'фоллоу ✓':'нет фоллоу'}${r.ach.find(a=>a.id==='twsub').got?' · саб ✓':''}</em><button type="button" data-tw>Проверить</button>`:`<em>+100, саб +300</em><button type="button" data-tw>Подключить</button>`}</div>
        <div class="ab-brow"><span>✈️ Telegram</span>${r.ach.find(a=>a.id==='tg').got?'<em>подписка ✓</em>':r.tgLinked?'<em>+100</em><button type="button" data-tgc>Проверить</button>':'<em>+100</em><button type="button" data-tg>Подключить</button>'}</div>
      </div>
      <div class="ab-ach">${r.ach.map(a=>`<span class="${a.got?'on':''}" title="${esc(a.name)} — ${esc(a.desc)}${a.got?'':` (${a.k==='sec'?fmtTime(a.have)+' из '+fmtTime(a.need):a.k==='rub'?a.have+' ₽ из '+a.need+' ₽':['tw','twsub','tg'].includes(a.k)?'ещё не получено':a.have+' из '+a.need})`}">${a.icon}</span>`).join('')}</div>`;
    const cp=el.querySelector('[data-copy]');if(cp)cp.onclick=e=>{e.stopPropagation();try{navigator.clipboard.writeText(cp.dataset.copy);}catch(err){}cp.textContent='✓';setTimeout(()=>cp.textContent='⧉',1500);};
    const tw=el.querySelector('[data-tw]');if(tw)tw.onclick=e=>{e.stopPropagation();connectTwitch();};
    const tgb=el.querySelector('[data-tg]');if(tgb)tgb.onclick=e=>{e.stopPropagation();connectTg(el);};
    const tgc=el.querySelector('[data-tgc]');if(tgc)tgc.onclick=e=>{e.stopPropagation();tgc.textContent='…';tgCheck(el);};
    const hp=el.querySelector('[data-help]');if(hp)hp.onclick=e=>{e.stopPropagation();const sm=el.querySelector('.ab-code small');sm.hidden=!sm.hidden;};
  }

  /* кнопка «▶ Стрим» в шапке: когда эфир идёт — «Стрим онлайн», мягко пульсирует (статус с Twitch, раз в 2 минуты) */
  (function(){
    const btn=()=>document.querySelector('.nav a.btn[href*="#stream"]');
    async function check(){
      const b=btn();if(!b)return;
      let live=null;
      try{const c=JSON.parse(sessionStorage.getItem('dgc_live')||'null');if(c&&Date.now()-c.t<60e3)live=c.live;}catch(e){}
      if(live===null){try{const r=await fetch(API,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'live'})});live=!!(await r.json()).live;
        try{sessionStorage.setItem('dgc_live',JSON.stringify({t:Date.now(),live}));}catch(e){}}catch(e){return;}}
      b.classList.toggle('live',live);
      b.innerHTML=live?'<i class="ld"></i>Стрим онлайн':'▶ Стрим';
      b.title=live?'Сейчас в эфире — смотреть':'';
    }
    if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',check);else check();
    setInterval(()=>{if(!document.hidden)check();},120e3);
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)check();});
  })();
  window.DAuth={API,VK,YA,CB,start,logout,link:getLink,toast};

  /* ===== кнопка в шапке сайта ===== */
  function paint(){
    const wrap=document.querySelector('header.nav .wrap');
    if(!wrap||document.getElementById('authBox'))return;
    const css=document.createElement('style');
    css.textContent=`
#authBox{position:relative;flex:none}
#authBox .ab-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:38px;padding:0 16px;border:none;border-radius:12px;background:rgba(239,236,251,.1);color:#EFECFB;font:800 14px Manrope,system-ui,sans-serif;cursor:pointer;white-space:nowrap}
#authBox .ab-btn:hover{background:rgba(110,123,255,.24)}
#authBox .ab-ava{width:38px;height:38px;padding:0;border-radius:50%;background:#F0A830 center/cover;color:#1b1b1b;overflow:hidden}
#authBox .ab-pop{position:absolute;right:0;top:calc(100% + 10px);width:310px;box-sizing:border-box;padding:14px;border-radius:16px;background:#1C1848;border:1px solid rgba(110,123,255,.3);box-shadow:0 18px 40px rgba(0,0,0,.45);color:#EFECFB;font-family:Manrope,system-ui,sans-serif;z-index:50}
#authBox .ab-pop[hidden]{display:none}
#authBox .ab-pop h4{margin:0 0 4px;font-size:15px;font-weight:800}
#authBox .ab-pop p{margin:0 0 12px;font-size:13px;line-height:1.45;color:#B9B4E6;font-weight:600}
#authBox .ab-pop .ab-go{display:block;width:100%;margin-top:8px;padding:11px 14px;border:none;border-radius:12px;font:800 14px Manrope,system-ui,sans-serif;cursor:pointer;text-align:center;text-decoration:none;box-sizing:border-box}
#authBox .ab-ya{background:#FC3F1D;color:#fff}
#authBox .ab-vk{background:#0077FF;color:#fff}
#authBox .ab-ghost{background:rgba(239,236,251,.08);color:#EFECFB}
#authBox .ab-ghost:hover{background:rgba(239,236,251,.14)}
#authBox .ab-stats{margin:0 0 12px}
#authBox .ab-st-muted{margin:0;color:#B9B4E6;font-size:13px}
#authBox .ab-rank{display:flex;justify-content:space-between;align-items:baseline}
#authBox .ab-rank b{font-size:16px;font-weight:800}
#authBox .lv1{color:#9D9D9D}#authBox .lv2{color:#FFFFFF}#authBox .lv3{color:#1EFF00}#authBox .lv4{color:#2A8CFF}#authBox .lv5{color:#A335EE}#authBox .lv6{color:#00CCFF}#authBox .lv7{color:#E6CC80}#authBox .lv8{color:#E6CC80;text-shadow:0 0 6px rgba(230,204,128,.75)}
#authBox .lvown{color:#FF8000;text-shadow:0 0 8px rgba(255,128,0,.55)}

#authBox .ab-rank span{color:#B9B4E6;font-size:12px;font-weight:700}
#authBox .ab-bar{height:8px;border-radius:5px;background:rgba(239,236,251,.1);margin:8px 0 6px;overflow:hidden}
#authBox .ab-bar i{display:block;height:100%;border-radius:5px;background:linear-gradient(90deg,#6E7BFF,#F0A830)}
#authBox .ab-next{color:#B9B4E6;font-size:12px;font-weight:600}
#authBox .ab-nums{display:flex;gap:16px;margin:10px 0 8px;font-size:13px;font-weight:700}
#authBox .ab-ach{display:flex;flex-wrap:wrap;gap:5px}
#authBox .ab-bon{margin:0 0 10px;display:flex;flex-direction:column;gap:6px}
#authBox .ab-brow{display:flex;align-items:center;gap:8px;font-size:12px;font-weight:700}
#authBox .ab-brow span{flex:none;width:82px}
#authBox .ab-brow em{flex:1;font-style:normal;color:#B9B4E6;font-weight:600}
#authBox .ab-brow button{flex:none;border:none;border-radius:8px;padding:5px 9px;background:rgba(110,123,255,.25);color:#EFECFB;font:800 11px Manrope,system-ui,sans-serif;cursor:pointer}
#authBox .ab-code{display:flex;flex-wrap:wrap;align-items:center;gap:5px;margin:0 0 10px;padding:7px 10px;border-radius:10px;background:rgba(239,236,251,.06);font-size:12px;font-weight:700;color:#B9B4E6}
#authBox .ab-code b{color:#F0A830;letter-spacing:1px;font-size:13px;margin-left:auto}
#authBox .ab-code button{border:none;background:rgba(239,236,251,.1);color:#EFECFB;font:800 12px Manrope,system-ui,sans-serif;width:24px;height:24px;border-radius:7px;cursor:pointer;padding:0}
#authBox .ab-code small{flex-basis:100%;color:#B9B4E6;font-weight:600;font-size:12px;line-height:1.4}
#authBox .ab-code small[hidden]{display:none}
#authBox .ab-code a{color:#F0A830}
#authBox .ab-ach span{width:30px;height:30px;display:flex;align-items:center;justify-content:center;border-radius:10px;background:rgba(239,236,251,.06);font-size:16px;filter:grayscale(1);opacity:.35;cursor:default}
#authBox .ab-ach span.on{filter:none;opacity:1;background:rgba(240,168,48,.16);box-shadow:inset 0 0 0 1px rgba(240,168,48,.5)}
@media (max-width:820px){#authBox{margin-left:auto}.live-dot~#authBox{margin-left:0}}
@media (max-width:560px){.live-dot:not(.on)~#authBox{margin-left:auto}}
@media (max-width:560px){#authBox .ab-btn{padding:0 12px}#authBox .ab-pop{position:fixed;left:12px;right:12px;top:72px;min-width:0;width:auto}}`;
    document.head.appendChild(css);
    const box=document.createElement('div');box.id='authBox';
    const l=getLink();
    if(l){
      const u=l.user||{},nm=name(u),ini=nm.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'🎸';
      const photo=u.photo_url&&String(u.photo_url).replace(/"/g,'');
      box.innerHTML=`<button class="ab-btn ab-ava" aria-label="Мой аккаунт" aria-haspopup="true"${photo?` style="background-image:url(&quot;${esc(photo)}&quot;)"`:''}>${photo?'':esc(ini)}</button>
<div class="ab-pop" hidden><h4>${esc(nm)}</h4><p>Вход через ${({ya:'Яндекс ID',vk:'VK ID',tg:'Telegram',admin:'ключ владельца — все права'})[l.prov]||'аккаунт'}</p><div class="ab-stats" id="abStats"></div>
<button class="ab-go ab-ghost" data-out>Выйти</button></div>`;
    }else{
      box.innerHTML=`<button class="ab-btn" aria-haspopup="true">Войти</button>
<div class="ab-pop" hidden><h4>Вход на сайт</h4><p>Один аккаунт для всего сайта и школы: прогресс не потеряется и будет на любом устройстве.</p>
${YA?'<button class="ab-go ab-ya" data-p="ya">Войти через Яндекс ID</button>':''}${VK?'<button class="ab-go ab-vk" data-p="vk">Войти через VK ID</button>':''}</div>`;
    }
    wrap.appendChild(box);
    const btn=box.querySelector('.ab-btn'),pop=box.querySelector('.ab-pop');
    btn.addEventListener('click',e=>{e.stopPropagation();pop.hidden=!pop.hidden;if(!pop.hidden)paintStats(document.getElementById('abStats'));});
    pop.addEventListener('click',e=>{
      e.stopPropagation();
      const p=e.target.closest('[data-p]');if(p){start(p.dataset.p);return;}
      if(e.target.closest('[data-out]')&&confirm('Выйти из аккаунта? Прогресс останется на сервере — войдёшь снова, и он вернётся.'))logout();
    });
    document.addEventListener('click',()=>{pop.hidden=true;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')pop.hidden=true;});
    addEventListener('blur',()=>{setTimeout(()=>{if(document.activeElement&&document.activeElement.tagName==='IFRAME')pop.hidden=true;},0);});
    addEventListener('scroll',()=>{if(!pop.hidden&&window.scrollY>200)pop.hidden=true;},{passive:true});
  }
  /* ===== меню ☰ на телефоне: те же разделы, что в шапке ===== */
  function burger(){
    const wrap=document.querySelector('header.nav .wrap'),nav=wrap&&wrap.querySelector('nav');
    if(!nav||document.getElementById('navBurger'))return;
    const css=document.createElement('style');
    css.textContent=`#navBurger{display:none;flex:none;width:40px;height:38px;border:none;border-radius:12px;background:rgba(239,236,251,.1);color:#EFECFB;cursor:pointer;align-items:center;justify-content:center;padding:0}
#navBurger svg{width:20px;height:20px}
#navMenu{position:fixed;left:0;right:0;top:64px;z-index:19;background:rgba(12,10,36,.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border-bottom:1px solid rgba(110,123,255,.25);padding:8px 16px 16px;box-shadow:0 18px 40px rgba(0,0,0,.45)}
#navMenu[hidden]{display:none}
#navMenu a{display:block;padding:14px 12px;border-radius:12px;color:#EFECFB;font:800 17px Manrope,system-ui,sans-serif;text-decoration:none}
#navMenu a.on{color:#F0A830}
#navMenu a:active,#navMenu a:hover{background:rgba(110,123,255,.18)}
@media (max-width:820px){#navBurger{display:inline-flex}}`;
    document.head.appendChild(css);
    const b=document.createElement('button');b.id='navBurger';b.type='button';b.setAttribute('aria-label','Меню');b.setAttribute('aria-expanded','false');
    b.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';
    const m=document.createElement('div');m.id='navMenu';m.hidden=true;
    const fill=()=>{m.innerHTML=[...nav.querySelectorAll('a')].map(a=>`<a href="${esc(a.href)}"${a.classList.contains('on')?' class="on"':''}>${esc(a.textContent)}</a>`).join('');};
    wrap.appendChild(b);document.body.appendChild(m);
    const set=o=>{m.hidden=!o;b.setAttribute('aria-expanded',String(o));b.innerHTML=o?'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>':'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>';};
    b.addEventListener('click',e=>{e.stopPropagation();if(m.hidden)fill();set(m.hidden);});
    m.addEventListener('click',e=>{if(e.target.closest('a'))set(false);});
    document.addEventListener('click',e=>{if(!m.hidden&&!m.contains(e.target))set(false);});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')set(false);});
  }
  // разделы подсвечиваются скриптом страницы чуть позже — меню строим после него
  const go=()=>{paint();setTimeout(burger,0);};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',go);else go();
})();
