/* Яндекс Метрика (счётчик 113576693) + плашка про cookie.
   Подключена на публичных страницах сайта и в школе; служебные (add-song, login, da-connect) не считаются.
   Заходы владельца не считаются: вход как «Тот Самый» (login.html?admin), dev-ключ школы или ?nostat=1 в адресе (один раз на браузер).
   Статистика — только в кабинете metrika.yandex.ru, на сайте её не видно. */
(function(){
  var ID=113576693;
  var owner=false;
  try{
    // ?nostat=1 — не считать этот браузер (свой телефон, рабочий комп); ?nostat=0 — снова считать
    var ns=new URLSearchParams(location.search).get('nostat');
    if(ns==='1')localStorage.setItem('dgc_nostat','1');else if(ns==='0')localStorage.removeItem('dgc_nostat');
    var l=JSON.parse(localStorage.getItem('dgc_link')||'null');
    owner=(l&&l.prov==='admin')||localStorage.getItem('dgc_dev')==='1'||localStorage.getItem('dgc_nostat')==='1';
  }catch(e){}
  if(!owner){
    (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();
      for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}
      k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
      (window,document,'script','https://mc.yandex.ru/metrika/tag.js?id='+ID,'ym');
    ym(ID,'init',{ssr:true,webvisor:true,clickmap:true,accurateTrackBounce:true,trackLinks:true});
  }

  /* плашка «Сайт использует cookie» — один раз, внутри Telegram не показываем */
  var seen=false;try{seen=localStorage.getItem('dgc_cookie')==='1';}catch(e){}
  var inTg=!!(window.Telegram&&Telegram.WebApp&&Telegram.WebApp.initData);
  if(seen||inTg)return;
  function show(){
    var d=document.createElement('div');d.id='cookieBar';
    d.innerHTML='<span>Сайт использует cookie и Яндекс Метрику, чтобы понимать, что читают чаще.</span><button type="button">Ок</button>';
    var css=document.createElement('style');
    css.textContent='#cookieBar{position:fixed;left:16px;right:16px;bottom:16px;z-index:90;max-width:560px;margin:0 auto;display:flex;gap:12px;align-items:center;padding:12px 14px 12px 16px;border-radius:16px;background:#1C1848;border:1px solid rgba(110,123,255,.3);box-shadow:0 14px 34px rgba(0,0,0,.45);color:#CFCCF2;font:600 13px/1.4 Manrope,system-ui,sans-serif}#cookieBar span{flex:1}#cookieBar button{flex:none;border:none;border-radius:10px;padding:9px 16px;background:#F0A830;color:#1b1b1b;font:800 14px Manrope,system-ui,sans-serif;cursor:pointer}';
    document.head.appendChild(css);document.body.appendChild(d);
    d.querySelector('button').onclick=function(){try{localStorage.setItem('dgc_cookie','1');}catch(e){}d.remove();};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',show);else show();
})();
