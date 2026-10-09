/* Рейтинг и «Сохранённые» для песенника на сайте.
   Сохранённые песни и своя оценка — в этом браузере; средний рейтинг — на сервере. */
(function(){
  const API='https://functions.yandexcloud.net/d4epurfr35kcn0fl97up';
  const get=(k,d)=>{try{return JSON.parse(localStorage.getItem(k)||'null')??d;}catch(e){return d;}};
  const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};
  let voter=get('dgc_voter',null);
  if(!voter){const a=new Uint8Array(18);crypto.getRandomValues(a);voter=btoa(String.fromCharCode(...a)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');put('dgc_voter',voter);}
  const post=body=>fetch(API,{method:'POST',headers:{'Content-Type':'text/plain'},body:JSON.stringify(body)}).then(r=>r.ok?r.json():Promise.reject(r.status));
  let cache=null,vcache=null;
  window.DR={
    saved:()=>get('dgc_saved',[]),
    isSaved:id=>get('dgc_saved',[]).includes(id),
    toggleSave(id){const l=get('dgc_saved',[]),i=l.indexOf(id);if(i<0)l.unshift(id);else l.splice(i,1);put('dgc_saved',l);return i<0;},
    mine:id=>get('dgc_votes',{})[id]||0,
    ratings(){return cache||(cache=post({action:'ratings'}).then(j=>j.ratings||{}).catch(()=>({})));},
    async rate(id,stars){
      const r=await post({action:'rate',song:id,stars,voter});
      const v=get('dgc_votes',{});v[id]=stars;put('dgc_votes',v);
      if(cache)cache=cache.then(all=>Object.assign(all,{[id]:{avg:r.avg,n:r.n}}));
      return r;
    },
    stars(avg){const f=Math.round(avg||0);return '★★★★★'.slice(0,f)+'☆☆☆☆☆'.slice(0,5-f);},
    // просмотры: число с глазиком
    views(){return vcache||(vcache=post({action:'views'}).then(j=>j.views||{}).catch(()=>({})));},
    view(id){
      const seen=get('dgc_viewed',{}),now=Date.now();
      if(seen[id]&&now-seen[id]<6*3600e3)return this.views().then(v=>v[id]||0);
      seen[id]=now;put('dgc_viewed',seen);
      return post({action:'view',song:id,voter}).then(r=>{if(vcache)vcache=vcache.then(v=>Object.assign(v,{[id]:r.n}));return r.n;}).catch(()=>this.views().then(v=>v[id]||0));
    },
    num:n=>n>=1e6?(n/1e6).toFixed(n<1e7?1:0).replace('.0','').replace('.',',')+'M':n>=1e3?(n/1e3).toFixed(n<1e4?1:0).replace('.0','').replace('.',',')+'K':String(n||0),
    eye:n=>`<span class="views" title="Просмотров: ${n||0}"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>${DR.num(n||0)}</span>`,
    plural:n=>n%10===1&&n%100!==11?'оценка':n%10>=2&&n%10<=4&&(n%100<10||n%100>=20)?'оценки':'оценок'
  };
})();
