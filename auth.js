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

  window.DAuth={API,VK,YA,CB,start,logout,link:getLink};

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
#authBox .ab-pop{position:absolute;right:0;top:calc(100% + 10px);min-width:250px;padding:14px;border-radius:16px;background:#1C1848;border:1px solid rgba(110,123,255,.3);box-shadow:0 18px 40px rgba(0,0,0,.45);color:#EFECFB;font-family:Manrope,system-ui,sans-serif;z-index:50}
#authBox .ab-pop[hidden]{display:none}
#authBox .ab-pop h4{margin:0 0 4px;font-size:15px;font-weight:800}
#authBox .ab-pop p{margin:0 0 12px;font-size:13px;line-height:1.45;color:#B9B4E6;font-weight:600}
#authBox .ab-pop .ab-go{display:block;width:100%;margin-top:8px;padding:11px 14px;border:none;border-radius:12px;font:800 14px Manrope,system-ui,sans-serif;cursor:pointer;text-align:center;text-decoration:none;box-sizing:border-box}
#authBox .ab-ya{background:#FC3F1D;color:#fff}
#authBox .ab-vk{background:#0077FF;color:#fff}
#authBox .ab-ghost{background:rgba(239,236,251,.08);color:#EFECFB}
#authBox .ab-ghost:hover{background:rgba(239,236,251,.14)}
@media (max-width:820px){#authBox{margin-left:auto}.live-dot~#authBox{margin-left:0}}
@media (max-width:560px){#authBox .ab-btn{padding:0 12px}#authBox .ab-pop{position:fixed;left:12px;right:12px;top:72px;min-width:0}}`;
    document.head.appendChild(css);
    const box=document.createElement('div');box.id='authBox';
    const l=getLink();
    if(l){
      const u=l.user||{},nm=name(u),ini=nm.split(/\s+/).map(w=>w[0]).join('').slice(0,2).toUpperCase()||'🎸';
      const photo=u.photo_url&&String(u.photo_url).replace(/"/g,'');
      box.innerHTML=`<button class="ab-btn ab-ava" aria-label="Мой аккаунт" aria-haspopup="true"${photo?` style="background-image:url(&quot;${esc(photo)}&quot;)"`:''}>${photo?'':esc(ini)}</button>
<div class="ab-pop" hidden><h4>${esc(nm)}</h4><p>Вход через ${({ya:'Яндекс ID',vk:'VK ID',tg:'Telegram'})[l.prov]||'аккаунт'}</p>
<button class="ab-go ab-ghost" data-out>Выйти</button></div>`;
    }else{
      box.innerHTML=`<button class="ab-btn" aria-haspopup="true">Войти</button>
<div class="ab-pop" hidden><h4>Вход на сайт</h4><p>Один аккаунт для всего сайта и школы: прогресс не потеряется и будет на любом устройстве.</p>
${YA?'<button class="ab-go ab-ya" data-p="ya">Войти через Яндекс ID</button>':''}${VK?'<button class="ab-go ab-vk" data-p="vk">Войти через VK ID</button>':''}</div>`;
    }
    wrap.appendChild(box);
    const btn=box.querySelector('.ab-btn'),pop=box.querySelector('.ab-pop');
    btn.addEventListener('click',e=>{e.stopPropagation();pop.hidden=!pop.hidden;});
    pop.addEventListener('click',e=>{
      e.stopPropagation();
      const p=e.target.closest('[data-p]');if(p){start(p.dataset.p);return;}
      if(e.target.closest('[data-out]')&&confirm('Выйти из аккаунта? Прогресс останется на сервере — войдёшь снова, и он вернётся.'))logout();
    });
    document.addEventListener('click',()=>{pop.hidden=true;});
    document.addEventListener('keydown',e=>{if(e.key==='Escape')pop.hidden=true;});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',paint);else paint();
})();
