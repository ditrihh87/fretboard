/* Панель Twitch «Донаты ditrihh»: топ за месяц, за неделю и последние донаты из DonationAlerts. */
(function(){
  var API='https://functions.yandexcloud.net/d4epurfr35kcn0fl97up';
  var $=function(id){return document.getElementById(id);};
  var esc=function(t){return String(t).replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});};
  var fmt=function(n){return Math.round(n).toLocaleString('ru-RU');};
  var CUR={RUB:'₽',USD:'$',EUR:'€',KZT:'₸',BYN:'Br',UAH:'₴'};
  var DATA=null,tab='m';
  function ago(t){var d=(Date.now()-(Date.parse(String(t).replace(' ','T')+'Z')||Date.now()))/60000;
    return d<60?Math.max(1,Math.round(d))+' мин':d<1440?Math.round(d/60)+' ч':Math.round(d/1440)+' дн';}
  function paint(){
    if(!DATA){return;}
    if(!DATA.connected){$('list').innerHTML='<li class="empty">Статистика скоро появится</li>';return;}
    var l,html='';
    if(tab==='l'){l=DATA.last||[];
      l.forEach(function(e){html+='<li><span class="n">'+esc(e.name)+'</span><span class="s">'+fmt(e.amount)+' '+(CUR[e.currency]||esc(e.currency))+'</span><small>'+ago(e.t)+'</small></li>';});}
    else{l=(tab==='w'?DATA.topWeek:DATA.topMonth)||[];
      l.forEach(function(e,i){html+='<li><span class="p">'+(i+1)+'</span><span class="n">'+esc(e.name)+'</span><span class="s">'+fmt(e.rub)+' ₽</span></li>';});}
    $('list').innerHTML=html||'<li class="empty">Пока никого — будь первым!</li>';
    if(DATA.goal){var g=DATA.goal,p=Math.min(100,g.raised/g.target*100);
      $('goal').innerHTML='<div class="t"><span>🎯 '+esc(g.title)+'</span><small>'+fmt(g.raised)+' / '+fmt(g.target)+' ₽</small></div><div class="bar"><i style="width:'+p.toFixed(1)+'%"></i></div>';
      $('goal').hidden=false;}else $('goal').hidden=true;
  }
  function load(){
    fetch(API,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify({action:'donations'})})
      .then(function(r){return r.json();}).then(function(d){DATA=d;paint();})
      .catch(function(){if(!DATA)$('list').innerHTML='<li class="empty">Не удалось загрузить</li>';});
  }
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'),function(b){
    b.addEventListener('click',function(){tab=b.getAttribute('data-t');
      Array.prototype.forEach.call(document.querySelectorAll('#tabs button'),function(x){x.classList.toggle('on',x===b);});paint();});});
  if(window.Twitch&&Twitch.ext){Twitch.ext.onAuthorized(function(){});}
  load();setInterval(load,90000);
})();
