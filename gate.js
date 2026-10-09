/* Сайт открыт. Заставка «Скоро открытие» осталась только на power-chords.html (пока не готова).
   Доступ к ней: открой страницу с ?dev=КЛЮЧ (тот же ключ, что у школы) — браузер запомнит. ?dev=off — снова видеть заставку.
   Чтобы открыть и её: SITE_OPEN=true, убрать noindex из power-chords.html и строку Disallow из robots.txt. */
(function(){
  var SITE_OPEN=!/power-chords/.test(location.pathname), KEYHASH=3137592198;
  function h(s){var x=0x811c9dc5;s=unescape(encodeURIComponent(s));for(var i=0;i<s.length;i++){x^=s.charCodeAt(i);x=Math.imul(x,0x01000193)>>>0;}return x;}
  var q=new URLSearchParams(location.search),key=q.get('dev'),ok=false;
  try{
    if(key==='off')localStorage.removeItem('dgc_dev');
    else if(key&&h(key)===KEYHASH)localStorage.setItem('dgc_dev','1');
    ok=localStorage.getItem('dgc_dev')==='1';
  }catch(e){ok=!!key&&h(key)===KEYHASH;}
  if(SITE_OPEN||ok)return;
  document.documentElement.style.background='#0C0A24';
  document.write('<style>body>*:not(#soon){display:none!important}#soon{position:fixed;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;background:radial-gradient(700px 420px at 20% 0%,rgba(110,123,255,.25),transparent 60%),radial-gradient(600px 400px at 100% 100%,rgba(255,95,207,.15),transparent 60%),#0C0A24;color:#EFECFB;font-family:Manrope,system-ui,sans-serif;z-index:99}#soon img{width:min(320px,74vw)}#soon .sl{text-transform:uppercase;letter-spacing:3px;font-size:12px;font-weight:800;color:#9C97D6;margin-top:-4px}#soon h1{font-family:"Russo One",Manrope,sans-serif;font-weight:400;font-size:clamp(24px,5vw,34px);margin:14px 0 0}#soon p{color:#B9B4E6;font-weight:600;max-width:460px;line-height:1.5;margin:0}#soon .b{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:8px}#soon a{text-decoration:none;font-weight:800;padding:12px 18px;border-radius:14px;background:rgba(239,236,251,.1);color:#EFECFB}#soon a.m{background:#F0A830;color:#1b1b1b}</style>');
  document.addEventListener('DOMContentLoaded',function(){
    var d=document.createElement('div');d.id='soon';
    d.innerHTML='<img src="brand/ditrihh-logo.svg" alt="ditrihh"><div class="sl">играй как профи</div><h1>Скоро открытие</h1><p>Готовлю эксклюзивные табы и правильные аккорды. А пока — заходи на музыкальный стрим, каждый вечер с 00:00 по Москве.</p><div class="b"><a class="m" href="https://www.twitch.tv/ditrihh" target="_blank" rel="noopener">▶ Twitch</a><a href="https://www.youtube.com/@ditrihh" target="_blank" rel="noopener">YouTube</a><a href="https://live.vkvideo.ru/ditrihh" target="_blank" rel="noopener">VK Видео Live</a><a href="https://t.me/ditrihh" target="_blank" rel="noopener">Telegram</a></div>';
    document.body.appendChild(d);
    var T='ditrihh — скоро открытие';document.title=T;[500,1500,3000].forEach(function(ms){setTimeout(function(){document.title=T;},ms);});
  });
})();
