'use strict';
/* ============ utils ============ */
const STANDALONE=((document.querySelector('meta[name="ib-mode"]')||{}).content||'')==='standalone';   // the single-file build: no server, no accounts
const IS_TOUCH=('ontouchstart' in window)||(navigator.maxTouchPoints>0);
const $=(s,el=document)=>el.querySelector(s);
const $$=(s,el=document)=>Array.from(el.querySelectorAll(s));
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const lerp=(a,b,t)=>a+(b-a)*t;
const rand=(a,b)=>a+Math.random()*(b-a);
const pick=a=>a[Math.floor(Math.random()*a.length)];
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function hash(str){let h=2166136261;for(let i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}return h>>>0}
function rng(seed){let s=(seed>>>0)||1;return()=>{s^=s<<13;s>>>=0;s^=s>>>17;s^=s<<5;s>>>=0;return s/4294967296}}
function angLerp(a,b,t){let d=b-a;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return a+d*clamp(t,0,1)}
function shade(hex,f){
  const n=parseInt(hex.slice(1),16);let r=n>>16,g=(n>>8)&255,b=n&255;
  if(f<0){r*=1+f;g*=1+f;b*=1+f}else{r+=(255-r)*f;g+=(255-g)*f;b+=(255-b)*f}
  return '#'+[r,g,b].map(v=>Math.round(clamp(v,0,255)).toString(16).padStart(2,'0')).join('');
}
function hsl2hex(h,s,l){return '#'+new THREE.Color().setHSL(h%1,s,l).getHexString()}
function fmtNum(n){n=Math.round(n);if(n>=1e6)return (n/1e6).toFixed(1).replace(/\.0$/,'')+'M';if(n>=1e3)return (n/1e3).toFixed(1).replace(/\.0$/,'')+'K';return String(n)}
function fmtTime(s){s=Math.max(0,s);const m=Math.floor(s/60);return m+':'+String(Math.floor(s%60)).padStart(2,'0')}
function mkCanvas(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}

/* ============ storage + state ============ */
const Store=(()=>{
  let ok=true;const mem={};
  try{localStorage.setItem('_t','1');localStorage.removeItem('_t')}catch(e){ok=false}
  return{
    get(k,d){try{const v=ok?localStorage.getItem('ib:'+k):mem[k];return v==null?d:JSON.parse(v)}catch(e){return d}},
    set(k,v){try{const s=JSON.stringify(v);if(ok)localStorage.setItem('ib:'+k,s);else mem[k]=s}catch(e){}}
  };
})();
const S={user:Store.get('user',null),games:Store.get('games',[]),head:''};
function save(){Store.set('user',S.user);Store.set('games',S.games);try{Account.queueSync()}catch(e){}}

/* ============ sound ============ */
const Sfx={ac:null,on:true,vol:1,
  init(){if(!this.ac){try{this.ac=new(window.AudioContext||window.webkitAudioContext)()}catch(e){}}if(this.ac&&this.ac.state==='suspended')this.ac.resume()},
  tone(f,d,type,vol,slide,delay){
    if(!this.on||!this.ac||this.vol<=.001)return;type=type||'square';vol=(vol==null?.05:vol)*this.vol;
    const t=this.ac.currentTime+(delay||0),o=this.ac.createOscillator(),g=this.ac.createGain();
    o.type=type;o.frequency.setValueAtTime(f,t);
    if(slide)o.frequency.exponentialRampToValueAtTime(Math.max(30,f+slide),t+d);
    g.gain.setValueAtTime(vol,t);g.gain.exponentialRampToValueAtTime(.0001,t+d);
    o.connect(g);g.connect(this.ac.destination);o.start(t);o.stop(t+d+.02);
  },
  noise(d,vol){
    if(!this.on||!this.ac||this.vol<=.001)return;const n=Math.floor(this.ac.sampleRate*d),b=this.ac.createBuffer(1,n,this.ac.sampleRate),a=b.getChannelData(0);
    for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*(1-i/n);
    const s=this.ac.createBufferSource(),g=this.ac.createGain();g.gain.value=(vol||.06)*this.vol;s.buffer=b;s.connect(g);g.connect(this.ac.destination);s.start();
  },
  nav(n){   // every menu item has its own sound
    switch(n){
      case'home':[523,659,784].forEach((f,i)=>this.tone(f,.16,'triangle',.07,0,i*.09));break;                                   // warm welcome chime
      case'games':this.tone(320,.3,'sine',.07,900);this.tone(1500,.05,'triangle',.05,0,.27);break;                                 // compass sweep
      case'avatar':this.tone(240,.09,'square',.05,240);this.tone(480,.09,'square',.05,-160,.09);this.tone(660,.14,'triangle',.06,0,.18);break;   // boing-pop
      case'friends':this.tone(880,.16,'sine',.08);this.tone(1320,.1,'sine',.03,0,.02);this.tone(660,.28,'sine',.08,0,.16);break;   // ding-dong
      case'lan':this.tone(500,.05,'square',.03);this.tone(1500,.09,'sine',.08,0,.03);this.tone(1500,.09,'sine',.04,0,.24);this.tone(1500,.09,'sine',.02,0,.45);break;   // radar ping and echoes
      case'together':this.tone(720,.03,'square',.06);this.tone(540,.03,'square',.06,0,.07);this.tone(880,.1,'triangle',.06,0,.14);this.tone(1100,.14,'triangle',.05,0,.21);break;   // click-clack, link
      case'create':this.noise(.06,.09);this.tone(110,.13,'sawtooth',.09,-50);setTimeout(()=>{this.noise(.05,.07);this.tone(150,.1,'sawtooth',.08,-60)},130);break;   // hammer
      default:this.play('click');
    }
  },
  play(n){
    switch(n){
      case'jump':this.tone(300,.14,'square',.04,500);break;
      case'coin':this.tone(880,.08,'square',.04);this.tone(1320,.14,'square',.04,0,.07);break;
      case'die':this.tone(420,.5,'sawtooth',.06,-340);break;
      case'win':[523,659,784,1047].forEach((f,i)=>this.tone(f,.22,'triangle',.08,0,i*.1));break;
      case'click':this.tone(620,.05,'triangle',.05);break;
      case'buy':this.tone(700,.08,'square',.05);this.tone(1000,.12,'square',.05,0,.08);break;
      case'bounce':this.tone(200,.25,'sine',.1,700);break;
      case'shoot':this.noise(.07,.05);this.tone(900,.09,'sawtooth',.03,-700);break;
      case'hit':this.tone(140,.1,'square',.05,-60);break;
      case'check':this.tone(660,.1,'triangle',.07);this.tone(990,.15,'triangle',.07,0,.09);break;
      case'err':this.tone(160,.15,'square',.05);break;
      case'hurt':this.tone(220,.18,'sawtooth',.05,-120);break;
    }
  }
};

/* ============ icons ============ */
const ICONS={
  home:'<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  discover:'<circle cx="12" cy="12" r="9"/><path d="M15.5 8.5l-2 5-5 2 2-5z"/>',
  avatar:'<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  create:'<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
  app:'<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  thumb:'<path d="M7 11v9H4v-9zM7 11l4-8c1.5 0 2.5 1 2.5 2.5V9H19a2 2 0 0 1 2 2.3l-1 6.5A2 2 0 0 1 18 20H7"/>',
  thumbd:'<path d="M17 13V4h3v9zM17 13l-4 8c-1.5 0-2.5-1-2.5-2.5V15H5a2 2 0 0 1-2-2.3l1-6.5A2 2 0 0 1 6 4h11"/>',
  users:'<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6M17 5a3.5 3.5 0 0 1 0 7M22 20c0-3-2-5-5-5.7"/>',
  play:'<path d="M7 4l13 8-13 8z" fill="currentColor"/>',
  x:'<path d="M5 5l14 14M19 5L5 19"/>',
  menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  trash:'<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
  copy:'<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  edit:'<path d="M4 20h4l11-11-4-4L4 16z"/>',
  dice:'<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r="1" fill="currentColor"/><circle cx="15" cy="15" r="1" fill="currentColor"/><circle cx="15" cy="9" r="1" fill="currentColor"/><circle cx="9" cy="15" r="1" fill="currentColor"/>',
  globe:'<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18"/>',
  share:'<path d="M12 3v12M8 7l4-4 4 4M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  play2:'<path d="M8 5l11 7-11 7z"/>',
  back:'<path d="M15 5l-7 7 7 7"/>',
  plus2:'<circle cx="11" cy="11" r="7"/><path d="M11 8v6M8 11h6M20 20l-4-4"/>',
  minus2:'<circle cx="11" cy="11" r="7"/><path d="M8 11h6M20 20l-4-4"/>',
  sliders:'<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>',
  wifi:'<path d="M2 9a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16a5 5 0 0 1 6 0"/><circle cx="12" cy="19.5" r="1.3" fill="currentColor"/>',
  link:'<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>'
};
function ico(n,s){s=s||20;return `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[n]||''}</svg>`}
function coinIco(s){s=s||18;return `<svg class="i" width="${s}" height="${s}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="#ffb31a" stroke="#c77800" stroke-width="2"/><circle cx="12" cy="12" r="5.5" fill="none" stroke="#c77800" stroke-width="2"/></svg>`}

/* ============ avatar data ============ */
const SKIN_TONES=['#ffe0c2','#f8d5b5','#f2c28b','#e8b98a','#e0a877','#d99a6c','#c68642','#b5763f','#a86b3c','#8d5524','#6f4320','#5a3a22','#3f2a1a','#ffd23f','#ffb347','#ff9aa2','#ff6b6b','#7fbf5f','#3fb37f','#22c3c3','#8fd3ff','#6f8cff','#c9b6ff','#e8e8f0']
const PALETTE=['#ffffff','#c8ced6','#5b6470','#1f2430','#ff4d5e','#ff8a3d','#ffd23f','#7ed957','#1fc36b','#22c3c3','#3b8bff','#5b5bff','#a45cff','#ff5cae','#8a5a3a','#f2e2c9'];
const BOT_A=['Nova','Pixel','Turbo','Mango','Zappy','Blaze','Comet','Echo','Frost','Gizmo','Ninja','Rocket','Sunny','Cosmo','Ziggy'];
const BOT_B=['Fox','Wolf','Panda','Byte','Blox','Kid','Storm','Gamer','Chief','Tiger','Otter','Robot','Bean'];
function botName(){return pick(BOT_A)+pick(BOT_B)+(Math.random()<.6?Math.floor(rand(1,99)):'')}
const BOT_LINES=['gg','this game is so fun','anyone want to team up?','lol','nice avatar!','wait for me','omg','first try!','how do i get past this part?','let\'s go!','who wants to race?','love this one','brb','that was close','nooo','im so bad at this','wow','how many coins do you have?','follow me!','haha'];
const BOT_REPLIES=['hey!','lol yeah','haha same','nice one','thanks!','agreed','right?','yes!','no way','you got this'];

/* ============ avatar textures ============ */
function starPath(g,cx,cy,R,r,n){g.beginPath();for(let i=0;i<n*2;i++){const a=-Math.PI/2+i*Math.PI/n,rad=i%2?r:R;g.lineTo(cx+Math.cos(a)*rad,cy+Math.sin(a)*rad)}g.closePath()}
const LM=(c,extra)=>new THREE.MeshLambertMaterial(Object.assign({color:c},extra||{}));
function legacyHat(type,accent){
  const g=new THREE.Group();
  const B=(w,h,d,c,x,y,z,em)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),LM(c,em?{emissive:em}:null));m.position.set(x,y,z);m.castShadow=true;g.add(m);return m};
  const C=(rt,rb,h,c,x,y,z,seg,em)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(rt,rb,h,seg||14),LM(c,em?{emissive:em}:null));m.position.set(x,y,z);m.castShadow=true;g.add(m);return m};
  switch(type){
    case'cap':B(1.9,.55,1.9,accent,0,.98,0);B(1.5,.12,1,shade(accent,-.25),0,.76,1.25);break;
    case'beanie':B(1.9,.8,1.9,accent,0,1,0);B(1.98,.28,1.98,shade(accent,-.2),0,.75,0);B(.42,.42,.42,'#ffffff',0,1.6,0);break;
    case'headphones':B(.34,1,1,'#22252b',-1.02,.05,0);B(.34,1,1,'#22252b',1.02,.05,0);B(.22,.95,.3,accent,-.98,.55,0);B(.22,.95,.3,accent,.98,.55,0);B(2.2,.22,.3,accent,0,1.05,0);break;
    case'tophat':C(1.5,1.5,.14,'#1a1a1f',0,.92,0,18);C(.92,.92,1.2,'#1a1a1f',0,1.5,0,18);C(.95,.95,.26,accent,0,1.12,0,18);break;
    case'horns':{const a=C(0,.3,.95,'#d62828',-.55,1.25,0,10,'#330000');a.rotation.z=.35;const b=C(0,.3,.95,'#d62828',.55,1.25,0,10,'#330000');b.rotation.z=-.35;break}
    case'halo':{const t=new THREE.Mesh(new THREE.TorusGeometry(.85,.09,8,28),new THREE.MeshBasicMaterial({color:'#ffe066'}));t.rotation.x=Math.PI/2;t.position.y=1.5;g.add(t);break}
    case'crown':C(.95,.95,.5,'#ffcc33',0,1.1,0,10,'#553300');for(let i=0;i<5;i++){const a=i/5*Math.PI*2;C(0,.2,.55,'#ffcc33',Math.cos(a)*.72,1.6,Math.sin(a)*.72,8,'#553300')}break;
    case'cone':C(0,.75,1.7,accent,0,1.7,0,14);B(.28,.28,.28,'#ffffff',0,2.6,0);break;
  }
  return g;
}
function legacyBack(type,accent,U){
  const g=new THREE.Group();
  const B=(w,h,d,c,x,y,z,parent)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),LM(c));m.position.set(x,y,z);m.castShadow=true;(parent||g).add(m);return m};
  switch(type){
    case'backpack':B(1.5,1.8,.65,accent,0,3.2,-.85);B(1.2,.6,.2,shade(accent,-.25),0,2.7,-1.25);break;
    case'cape':{const piv=new THREE.Group();piv.position.set(0,3.95,-.58);g.add(piv);B(1.9,3.3,.1,accent,0,-1.65,-.05,piv);U.cape=piv;break}
    case'wings':{U.wings=[];[-1,1].forEach(s=>{const piv=new THREE.Group();piv.position.set(s*.5,3.7,-.65);g.add(piv);[2.6,2.1,1.6].forEach((len,k)=>B(len,.42,.12,k?'#f1f5ff':'#ffffff',s*(len/2+.1),.9-k*.55,0,piv));piv.rotation.y=s*.5;U.wings.push({piv,s})});break}
    case'jetpack':{[-.5,.5].forEach(x=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(.42,.42,1.7,12),LM('#9aa4b2'));m.position.set(x,3.3,-.9);m.castShadow=true;g.add(m);const n=new THREE.Mesh(new THREE.CylinderGeometry(.3,.2,.3,10),LM('#444b55'));n.position.set(x,2.3,-.9);g.add(n)});
      U.flames=[-.5,.5].map(x=>{const f=new THREE.Mesh(new THREE.ConeGeometry(.28,1.1,8),new THREE.MeshBasicMaterial({color:'#ff9a1f'}));f.rotation.x=Math.PI;f.position.set(x,1.6,-.9);f.visible=false;g.add(f);return f});
      B(1.5,.3,.3,'#666a72',0,3.7,-.7);break}
  }
  return g;
}
function rrect(g,x,y,w,h,r){g.beginPath();g.moveTo(x+r,y);g.arcTo(x+w,y,x+w,y+h,r);g.arcTo(x+w,y+h,x,y+h,r);g.arcTo(x,y+h,x,y,r);g.arcTo(x,y,x+w,y,r);g.closePath()}
function labelSprite(text,o){
  o=o||{};
  const c=mkCanvas(512,128),g=c.getContext('2d');const tex=new THREE.CanvasTexture(c);tex.anisotropy=2;
  const s=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,transparent:true,depthWrite:false}));
  const Wd=o.w||10;s.scale.set(Wd,Wd/4,1);
  s.userData.set=t=>{
    g.clearRect(0,0,512,128);const lines=String(t).split('\n'),two=lines.length>1;
    let fs=two?38:50,mw=0;g.textAlign='center';g.textBaseline='middle';
    do{g.font='600 '+fs+'px Rubik, system-ui, sans-serif';mw=Math.max.apply(null,lines.map(l=>g.measureText(l).width));fs-=2}while(mw>440&&fs>16);
    const tw=Math.min(496,mw+44),h=two?112:76;
    g.fillStyle=o.bg||'rgba(10,12,18,.66)';rrect(g,256-tw/2,64-h/2,tw,h,22);g.fill();
    g.fillStyle=o.color||'#ffffff';lines.forEach((l,i)=>g.fillText(l,256,64+(i-(lines.length-1)/2)*44+2));
    tex.needsUpdate=true;
  };
  s.userData.set(text);return s;
}
function animAvatar(av,t,spd,air,pose,dt,emote){
  const U=av.userData;if(!U.legL)return;
  const k=Math.min(1,(dt||.016)*18);
  const S_=(o,ax,v)=>{o.rotation[ax]+=(v-o.rotation[ax])*k};
  let lx=0,rx=0,alx=0,arx=0,alz=0,arz=0;const sw=Math.sin(t*11)*.95*spd;
  if(emote){
    if(emote.type==='dance'){alx=-2.7+Math.sin(t*12)*.6;arx=-2.7-Math.sin(t*12)*.6;lx=Math.sin(t*12)*.45;rx=-lx}
    else if(emote.type==='wave'){arx=-2.9;arz=Math.sin(t*10)*.5}
    else if(emote.type==='atk'){const ph=Math.min(1,emote.t/(emote.dur||.3)),sw=Math.sin(ph*Math.PI),P=emote.pose;
      if(P==='punch'){arx=-1.5-sw*1.3;alx=.5-sw*.3;lx=.35}
      else if(P==='hook'){arx=-1.6;arz=-sw*1.5;alx=.4}
      else if(P==='slash'){arx=-2.6+ph*2.4;alx=-.6}
      else if(P==='cast'){alx=arx=-1.5-sw*.9}
      else if(P==='kick'){lx=-1.5*sw;rx=.4;alx=.6;arx=-.6}
      else if(P==='spin'){alx=arx=-1.5;lx=.3;rx=-.3}
      else if(P==='slam'){alx=arx=-3.1+ph*2.9}
      else if(P==='block'){alx=arx=-1.4;alz=.5;arz=-.5}
    }
    else{alx=arx=-3}
  }else if(pose==='zombie'){alx=arx=-1.45+Math.sin(t*3)*.08;lx=sw;rx=-sw}
  else if(air){alx=arx=-2.7;lx=.35;rx=-.35}
  else{lx=sw;rx=-sw;alx=-sw;arx=sw;const br=Math.sin(t*2)*.03*(1-spd);alz=-.04-br;arz=.04+br}
  S_(U.legL,'x',lx);S_(U.legR,'x',rx);S_(U.armL,'x',alx);S_(U.armR,'x',arx);S_(U.armL,'z',alz);S_(U.armR,'z',arz);
  if(U.cape)S_(U.cape,'x',.06+spd*.55+(air?.35:0));
  if(U.tail)S_(U.tail,'y',Math.sin(t*4)*.25*(.4+spd));
  if(U.wings){const f=Math.sin(t*(air?16:3))*(air?.45:.12);U.wings.forEach(w=>S_(w.piv,'y',w.s*(.5+f)))}
  if(U.flames)U.flames.forEach(f=>{f.visible=!!air;f.scale.y=.8+Math.random()*.5});
}

/* ============ thumbnail art (svg) ============ */
function isoC(cx,cy,s,top,cl,cr){
  const a=s*.866,b=s*.5;
  return `<polygon points="${cx},${cy} ${cx+a},${cy+b} ${cx},${cy+s} ${cx-a},${cy+b}" fill="${shade(top,.16)}"/>`+
    `<polygon points="${cx-a},${cy+b} ${cx},${cy+s} ${cx},${cy+2*s} ${cx-a},${cy+b+s}" fill="${cl||shade(top,-.16)}"/>`+
    `<polygon points="${cx+a},${cy+b} ${cx},${cy+s} ${cx},${cy+2*s} ${cx+a},${cy+b+s}" fill="${cr||shade(top,-.34)}"/>`;
}
const _artCache={};
function art(kind,seed){
  const key=kind+'|'+(seed||'');if(_artCache[key])return _artCache[key];
  const R=rng(hash(key));let d='',b='';
  const sky=(a,c)=>`<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${c}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/>`;
  const cloud=(x,y,s)=>`<g fill="#fff" opacity=".92"><ellipse cx="${x}" cy="${y}" rx="${30*s}" ry="${12*s}"/><ellipse cx="${x+16*s}" cy="${y-8*s}" rx="${20*s}" ry="${12*s}"/><ellipse cx="${x-14*s}" cy="${y-5*s}" rx="${16*s}" ry="${9*s}"/></g>`;
  const RB=['#ff4d5e','#ff8a3d','#ffd23f','#7ed957','#22c3c3','#3b8bff','#a45cff'];
  switch(kind){
    case'obby':
      b=sky('#3d9cff','#d5f0ff')+cloud(70,58,1.1)+cloud(232,120,.8)+'<circle cx="238" cy="44" r="20" fill="#fff3a8"/>';
      for(let i=6;i>=0;i--)d+=isoC(38+i*37,215-i*27,34,RB[i]);
      d+='<rect x="258" y="20" width="4" height="48" fill="#fff"/><polygon points="262,20 288,30 262,40" fill="#ff4d5e"/>';break;
    case'lava':
      b=sky('#2b0f3a','#ff8a4c')+'<circle cx="150" cy="250" r="90" fill="#ffb02e" opacity=".28"/>';
      for(let i=5;i>=0;i--)d+=isoC(150+(i%2?28:-28),185-i*30,30,hsl2hex(.5+i*.08,.7,.55));
      d+='<rect y="236" width="300" height="70" fill="#ff5a1f"/><path d="M0 244 Q38 228 76 244 T152 244 T228 244 T300 240 V300 H0Z" fill="#ffb02e" opacity=".85"/>';break;
    case'coins':
      b=sky('#5cc8ff','#eafaff')+cloud(60,50,1)+cloud(240,80,.8);
      d=isoC(150,112,84,'#6fd66f','#8a5a3a','#6d4630')+isoC(112,96,9,'#8a5a3a')+isoC(112,72,24,'#3cbf5a');
      [[190,118],[150,100],[218,64],[76,66],[136,150],[180,150]].forEach(p=>{d+=`<circle cx="${p[0]}" cy="${p[1]}" r="14" fill="#ffcf33" stroke="#c98a00" stroke-width="3"/><circle cx="${p[0]}" cy="${p[1]}" r="7" fill="none" stroke="#e5a800" stroke-width="2.5"/>`});break;
    case'zombie':{
      b=sky('#0b1020','#3a4a7a')+'<circle cx="238" cy="60" r="30" fill="#f4f1d0"/><circle cx="228" cy="52" r="6" fill="#dcd8b0"/><rect y="244" width="300" height="60" fill="#232830"/>';
      d=isoC(150,70,84,'#8fd06a','#6fb04e','#5a9a3e');
      const cx=150,cy=70,s=84,a=s*.866,bb=s*.5;
      const P=(u,v)=>`${(cx-a+u*a).toFixed(1)},${(cy+bb+u*bb+v*s).toFixed(1)}`;
      const fr=(u0,u1,v0,v1,f)=>`<polygon points="${P(u0,v0)} ${P(u1,v0)} ${P(u1,v1)} ${P(u0,v1)}" fill="${f}"/>`;
      d+=fr(.14,.42,.26,.46,'#ff3b3b')+fr(.58,.86,.26,.46,'#ff3b3b')+fr(.2,.8,.66,.78,'#2a1a1a');
      d+=isoC(56,228,34,'#8a5a3a')+isoC(246,236,28,'#9a6a44');break}
    case'battle':
      b=sky('#6fa8ff','#ffd9a8')+'<circle cx="238" cy="52" r="26" fill="#fff3c4"/>';
      d=isoC(150,74,104,'#8b93a3','#6b7280','#5a6270')+isoC(150,104,54,'#b7bfcc','#8b93a3','#737b89');
      d+='<rect x="140" y="88" width="20" height="30" rx="4" fill="#d9b77c"/><circle cx="150" cy="82" r="9" fill="#e6c890"/><rect x="128" y="96" width="44" height="6" fill="#8a5a3a"/>';
      d+=isoC(70,192,26,'#ff8a3d')+isoC(232,186,26,'#3b8bff')+'<circle cx="70" cy="170" r="7" fill="#f2c28b"/><circle cx="232" cy="164" r="7" fill="#f2c28b"/><polygon points="118,214 132,196 140,214" fill="#ffd23f"/>';
      break;
    case'tycoon':
      b=sky('#8fd3ff','#fff3d6')+cloud(70,48,.9);
      for(let i=0;i<5;i++)d+=isoC(46+i*42,150+i*21,30,'#5b6470');
      [[70,144,'#ff4d5e'],[122,166,'#3b8bff'],[164,186,'#ffd23f'],[206,208,'#7ed957']].forEach(g=>{d+=`<polygon points="${g[0]},${g[1]-12} ${g[0]+10},${g[1]} ${g[0]},${g[1]+12} ${g[0]-10},${g[1]}" fill="${g[2]}" stroke="#fff" stroke-width="2"/>`});
      d+='<rect x="238" y="20" width="14" height="42" fill="#6b3a1a"/><circle cx="246" cy="14" r="9" fill="#fff" opacity=".8"/>'+isoC(226,64,58,'#ff8a3d');break;
    default:{
      const th=(seed||'').split('|')[1]||'day';
      const sk={day:['#3d9cff','#d5f0ff'],sunset:['#5b2a86','#ff9a5c'],night:['#0a0f24','#2d3b69'],space:['#02030a','#1a1440']}[th]||['#3d9cff','#d5f0ff'];
      b=sky(sk[0],sk[1]);if(th==='day')b+=cloud(70,60,1);
      for(let i=5;i>=0;i--)d+=isoC(50+R()*200,80+i*30+R()*20,26+R()*14,hsl2hex(R(),.65,.55));
    }
  }
  return _artCache[key]='data:image/svg+xml;utf8,'+encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300">${b}${d}</svg>`);
}

//---------------------------------------------------------------------
//
// QR Code Generator for JavaScript
//
// Copyright (c) 2009 Kazuhiko Arase
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//
// The word 'QR Code' is registered trademark of
// DENSO WAVE INCORPORATED
//  http://www.denso-wave.com/qrcode/faqpatent-e.html
//
//---------------------------------------------------------------------

var qrcode = function() {

  //---------------------------------------------------------------------
  // qrcode
  //---------------------------------------------------------------------

  /**
   * qrcode
   * @param typeNumber 1 to 40
   * @param errorCorrectionLevel 'L','M','Q','H'
   */
  var qrcode = function(typeNumber, errorCorrectionLevel) {

    var PAD0 = 0xEC;
    var PAD1 = 0x11;

    var _typeNumber = typeNumber;
    var _errorCorrectionLevel = QRErrorCorrectionLevel[errorCorrectionLevel];
    var _modules = null;
    var _moduleCount = 0;
    var _dataCache = null;
    var _dataList = [];

    var _this = {};

    var makeImpl = function(test, maskPattern) {

      _moduleCount = _typeNumber * 4 + 17;
      _modules = function(moduleCount) {
        var modules = new Array(moduleCount);
        for (var row = 0; row < moduleCount; row += 1) {
          modules[row] = new Array(moduleCount);
          for (var col = 0; col < moduleCount; col += 1) {
            modules[row][col] = null;
          }
        }
        return modules;
      }(_moduleCount);

      setupPositionProbePattern(0, 0);
      setupPositionProbePattern(_moduleCount - 7, 0);
      setupPositionProbePattern(0, _moduleCount - 7);
      setupPositionAdjustPattern();
      setupTimingPattern();
      setupTypeInfo(test, maskPattern);

      if (_typeNumber >= 7) {
        setupTypeNumber(test);
      }

      if (_dataCache == null) {
        _dataCache = createData(_typeNumber, _errorCorrectionLevel, _dataList);
      }

      mapData(_dataCache, maskPattern);
    };

    var setupPositionProbePattern = function(row, col) {

      for (var r = -1; r <= 7; r += 1) {

        if (row + r <= -1 || _moduleCount <= row + r) continue;

        for (var c = -1; c <= 7; c += 1) {

          if (col + c <= -1 || _moduleCount <= col + c) continue;

          if ( (0 <= r && r <= 6 && (c == 0 || c == 6) )
              || (0 <= c && c <= 6 && (r == 0 || r == 6) )
              || (2 <= r && r <= 4 && 2 <= c && c <= 4) ) {
            _modules[row + r][col + c] = true;
          } else {
            _modules[row + r][col + c] = false;
          }
        }
      }
    };

    var getBestMaskPattern = function() {

      var minLostPoint = 0;
      var pattern = 0;

      for (var i = 0; i < 8; i += 1) {

        makeImpl(true, i);

        var lostPoint = QRUtil.getLostPoint(_this);

        if (i == 0 || minLostPoint > lostPoint) {
          minLostPoint = lostPoint;
          pattern = i;
        }
      }

      return pattern;
    };

    var setupTimingPattern = function() {

      for (var r = 8; r < _moduleCount - 8; r += 1) {
        if (_modules[r][6] != null) {
          continue;
        }
        _modules[r][6] = (r % 2 == 0);
      }

      for (var c = 8; c < _moduleCount - 8; c += 1) {
        if (_modules[6][c] != null) {
          continue;
        }
        _modules[6][c] = (c % 2 == 0);
      }
    };

    var setupPositionAdjustPattern = function() {

      var pos = QRUtil.getPatternPosition(_typeNumber);

      for (var i = 0; i < pos.length; i += 1) {

        for (var j = 0; j < pos.length; j += 1) {

          var row = pos[i];
          var col = pos[j];

          if (_modules[row][col] != null) {
            continue;
          }

          for (var r = -2; r <= 2; r += 1) {

            for (var c = -2; c <= 2; c += 1) {

              if (r == -2 || r == 2 || c == -2 || c == 2
                  || (r == 0 && c == 0) ) {
                _modules[row + r][col + c] = true;
              } else {
                _modules[row + r][col + c] = false;
              }
            }
          }
        }
      }
    };

    var setupTypeNumber = function(test) {

      var bits = QRUtil.getBCHTypeNumber(_typeNumber);

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[Math.floor(i / 3)][i % 3 + _moduleCount - 8 - 3] = mod;
      }

      for (var i = 0; i < 18; i += 1) {
        var mod = (!test && ( (bits >> i) & 1) == 1);
        _modules[i % 3 + _moduleCount - 8 - 3][Math.floor(i / 3)] = mod;
      }
    };

    var setupTypeInfo = function(test, maskPattern) {

      var data = (_errorCorrectionLevel << 3) | maskPattern;
      var bits = QRUtil.getBCHTypeInfo(data);

      // vertical
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 6) {
          _modules[i][8] = mod;
        } else if (i < 8) {
          _modules[i + 1][8] = mod;
        } else {
          _modules[_moduleCount - 15 + i][8] = mod;
        }
      }

      // horizontal
      for (var i = 0; i < 15; i += 1) {

        var mod = (!test && ( (bits >> i) & 1) == 1);

        if (i < 8) {
          _modules[8][_moduleCount - i - 1] = mod;
        } else if (i < 9) {
          _modules[8][15 - i - 1 + 1] = mod;
        } else {
          _modules[8][15 - i - 1] = mod;
        }
      }

      // fixed module
      _modules[_moduleCount - 8][8] = (!test);
    };

    var mapData = function(data, maskPattern) {

      var inc = -1;
      var row = _moduleCount - 1;
      var bitIndex = 7;
      var byteIndex = 0;
      var maskFunc = QRUtil.getMaskFunction(maskPattern);

      for (var col = _moduleCount - 1; col > 0; col -= 2) {

        if (col == 6) col -= 1;

        while (true) {

          for (var c = 0; c < 2; c += 1) {

            if (_modules[row][col - c] == null) {

              var dark = false;

              if (byteIndex < data.length) {
                dark = ( ( (data[byteIndex] >>> bitIndex) & 1) == 1);
              }

              var mask = maskFunc(row, col - c);

              if (mask) {
                dark = !dark;
              }

              _modules[row][col - c] = dark;
              bitIndex -= 1;

              if (bitIndex == -1) {
                byteIndex += 1;
                bitIndex = 7;
              }
            }
          }

          row += inc;

          if (row < 0 || _moduleCount <= row) {
            row -= inc;
            inc = -inc;
            break;
          }
        }
      }
    };

    var createBytes = function(buffer, rsBlocks) {

      var offset = 0;

      var maxDcCount = 0;
      var maxEcCount = 0;

      var dcdata = new Array(rsBlocks.length);
      var ecdata = new Array(rsBlocks.length);

      for (var r = 0; r < rsBlocks.length; r += 1) {

        var dcCount = rsBlocks[r].dataCount;
        var ecCount = rsBlocks[r].totalCount - dcCount;

        maxDcCount = Math.max(maxDcCount, dcCount);
        maxEcCount = Math.max(maxEcCount, ecCount);

        dcdata[r] = new Array(dcCount);

        for (var i = 0; i < dcdata[r].length; i += 1) {
          dcdata[r][i] = 0xff & buffer.getBuffer()[i + offset];
        }
        offset += dcCount;

        var rsPoly = QRUtil.getErrorCorrectPolynomial(ecCount);
        var rawPoly = qrPolynomial(dcdata[r], rsPoly.getLength() - 1);

        var modPoly = rawPoly.mod(rsPoly);
        ecdata[r] = new Array(rsPoly.getLength() - 1);
        for (var i = 0; i < ecdata[r].length; i += 1) {
          var modIndex = i + modPoly.getLength() - ecdata[r].length;
          ecdata[r][i] = (modIndex >= 0)? modPoly.getAt(modIndex) : 0;
        }
      }

      var totalCodeCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalCodeCount += rsBlocks[i].totalCount;
      }

      var data = new Array(totalCodeCount);
      var index = 0;

      for (var i = 0; i < maxDcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < dcdata[r].length) {
            data[index] = dcdata[r][i];
            index += 1;
          }
        }
      }

      for (var i = 0; i < maxEcCount; i += 1) {
        for (var r = 0; r < rsBlocks.length; r += 1) {
          if (i < ecdata[r].length) {
            data[index] = ecdata[r][i];
            index += 1;
          }
        }
      }

      return data;
    };

    var createData = function(typeNumber, errorCorrectionLevel, dataList) {

      var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, errorCorrectionLevel);

      var buffer = qrBitBuffer();

      for (var i = 0; i < dataList.length; i += 1) {
        var data = dataList[i];
        buffer.put(data.getMode(), 4);
        buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
        data.write(buffer);
      }

      // calc num max data.
      var totalDataCount = 0;
      for (var i = 0; i < rsBlocks.length; i += 1) {
        totalDataCount += rsBlocks[i].dataCount;
      }

      if (buffer.getLengthInBits() > totalDataCount * 8) {
        throw 'code length overflow. ('
          + buffer.getLengthInBits()
          + '>'
          + totalDataCount * 8
          + ')';
      }

      // end code
      if (buffer.getLengthInBits() + 4 <= totalDataCount * 8) {
        buffer.put(0, 4);
      }

      // padding
      while (buffer.getLengthInBits() % 8 != 0) {
        buffer.putBit(false);
      }

      // padding
      while (true) {

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD0, 8);

        if (buffer.getLengthInBits() >= totalDataCount * 8) {
          break;
        }
        buffer.put(PAD1, 8);
      }

      return createBytes(buffer, rsBlocks);
    };

    _this.addData = function(data, mode) {

      mode = mode || 'Byte';

      var newData = null;

      switch(mode) {
      case 'Numeric' :
        newData = qrNumber(data);
        break;
      case 'Alphanumeric' :
        newData = qrAlphaNum(data);
        break;
      case 'Byte' :
        newData = qr8BitByte(data);
        break;
      case 'Kanji' :
        newData = qrKanji(data);
        break;
      default :
        throw 'mode:' + mode;
      }

      _dataList.push(newData);
      _dataCache = null;
    };

    _this.isDark = function(row, col) {
      if (row < 0 || _moduleCount <= row || col < 0 || _moduleCount <= col) {
        throw row + ',' + col;
      }
      return _modules[row][col];
    };

    _this.getModuleCount = function() {
      return _moduleCount;
    };

    _this.make = function() {
      if (_typeNumber < 1) {
        var typeNumber = 1;

        for (; typeNumber < 40; typeNumber++) {
          var rsBlocks = QRRSBlock.getRSBlocks(typeNumber, _errorCorrectionLevel);
          var buffer = qrBitBuffer();

          for (var i = 0; i < _dataList.length; i++) {
            var data = _dataList[i];
            buffer.put(data.getMode(), 4);
            buffer.put(data.getLength(), QRUtil.getLengthInBits(data.getMode(), typeNumber) );
            data.write(buffer);
          }

          var totalDataCount = 0;
          for (var i = 0; i < rsBlocks.length; i++) {
            totalDataCount += rsBlocks[i].dataCount;
          }

          if (buffer.getLengthInBits() <= totalDataCount * 8) {
            break;
          }
        }

        _typeNumber = typeNumber;
      }

      makeImpl(false, getBestMaskPattern() );
    };

    _this.createTableTag = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var qrHtml = '';

      qrHtml += '<table style="';
      qrHtml += ' border-width: 0px; border-style: none;';
      qrHtml += ' border-collapse: collapse;';
      qrHtml += ' padding: 0px; margin: ' + margin + 'px;';
      qrHtml += '">';
      qrHtml += '<tbody>';

      for (var r = 0; r < _this.getModuleCount(); r += 1) {

        qrHtml += '<tr>';

        for (var c = 0; c < _this.getModuleCount(); c += 1) {
          qrHtml += '<td style="';
          qrHtml += ' border-width: 0px; border-style: none;';
          qrHtml += ' border-collapse: collapse;';
          qrHtml += ' padding: 0px; margin: 0px;';
          qrHtml += ' width: ' + cellSize + 'px;';
          qrHtml += ' height: ' + cellSize + 'px;';
          qrHtml += ' background-color: ';
          qrHtml += _this.isDark(r, c)? '#000000' : '#ffffff';
          qrHtml += ';';
          qrHtml += '"/>';
        }

        qrHtml += '</tr>';
      }

      qrHtml += '</tbody>';
      qrHtml += '</table>';

      return qrHtml;
    };

    _this.createSvgTag = function(cellSize, margin, alt, title) {

      var opts = {};
      if (typeof arguments[0] == 'object') {
        // Called by options.
        opts = arguments[0];
        // overwrite cellSize and margin.
        cellSize = opts.cellSize;
        margin = opts.margin;
        alt = opts.alt;
        title = opts.title;
      }

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      // Compose alt property surrogate
      alt = (typeof alt === 'string') ? {text: alt} : alt || {};
      alt.text = alt.text || null;
      alt.id = (alt.text) ? alt.id || 'qrcode-description' : null;

      // Compose title property surrogate
      title = (typeof title === 'string') ? {text: title} : title || {};
      title.text = title.text || null;
      title.id = (title.text) ? title.id || 'qrcode-title' : null;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var c, mc, r, mr, qrSvg='', rect;

      rect = 'l' + cellSize + ',0 0,' + cellSize +
        ' -' + cellSize + ',0 0,-' + cellSize + 'z ';

      qrSvg += '<svg version="1.1" xmlns="http://www.w3.org/2000/svg"';
      qrSvg += !opts.scalable ? ' width="' + size + 'px" height="' + size + 'px"' : '';
      qrSvg += ' viewBox="0 0 ' + size + ' ' + size + '" ';
      qrSvg += ' preserveAspectRatio="xMinYMin meet"';
      qrSvg += (title.text || alt.text) ? ' role="img" aria-labelledby="' +
          escapeXml([title.id, alt.id].join(' ').trim() ) + '"' : '';
      qrSvg += '>';
      qrSvg += (title.text) ? '<title id="' + escapeXml(title.id) + '">' +
          escapeXml(title.text) + '</title>' : '';
      qrSvg += (alt.text) ? '<description id="' + escapeXml(alt.id) + '">' +
          escapeXml(alt.text) + '</description>' : '';
      qrSvg += '<rect width="100%" height="100%" fill="white" cx="0" cy="0"/>';
      qrSvg += '<path d="';

      for (r = 0; r < _this.getModuleCount(); r += 1) {
        mr = r * cellSize + margin;
        for (c = 0; c < _this.getModuleCount(); c += 1) {
          if (_this.isDark(r, c) ) {
            mc = c*cellSize+margin;
            qrSvg += 'M' + mc + ',' + mr + rect;
          }
        }
      }

      qrSvg += '" stroke="transparent" fill="black"/>';
      qrSvg += '</svg>';

      return qrSvg;
    };

    _this.createDataURL = function(cellSize, margin) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      return createDataURL(size, size, function(x, y) {
        if (min <= x && x < max && min <= y && y < max) {
          var c = Math.floor( (x - min) / cellSize);
          var r = Math.floor( (y - min) / cellSize);
          return _this.isDark(r, c)? 0 : 1;
        } else {
          return 1;
        }
      } );
    };

    _this.createImgTag = function(cellSize, margin, alt) {

      cellSize = cellSize || 2;
      margin = (typeof margin == 'undefined')? cellSize * 4 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;

      var img = '';
      img += '<img';
      img += '\u0020src="';
      img += _this.createDataURL(cellSize, margin);
      img += '"';
      img += '\u0020width="';
      img += size;
      img += '"';
      img += '\u0020height="';
      img += size;
      img += '"';
      if (alt) {
        img += '\u0020alt="';
        img += escapeXml(alt);
        img += '"';
      }
      img += '/>';

      return img;
    };

    var escapeXml = function(s) {
      var escaped = '';
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charAt(i);
        switch(c) {
        case '<': escaped += '&lt;'; break;
        case '>': escaped += '&gt;'; break;
        case '&': escaped += '&amp;'; break;
        case '"': escaped += '&quot;'; break;
        default : escaped += c; break;
        }
      }
      return escaped;
    };

    var _createHalfASCII = function(margin) {
      var cellSize = 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r1, r2, p;

      var blocks = {
        'â–ˆâ–ˆ': 'â–ˆ',
        'â–ˆ ': 'â–€',
        ' â–ˆ': 'â–„',
        '  ': ' '
      };

      var blocksLastLineNoMargin = {
        'â–ˆâ–ˆ': 'â–€',
        'â–ˆ ': 'â–€',
        ' â–ˆ': ' ',
        '  ': ' '
      };

      var ascii = '';
      for (y = 0; y < size; y += 2) {
        r1 = Math.floor((y - min) / cellSize);
        r2 = Math.floor((y + 1 - min) / cellSize);
        for (x = 0; x < size; x += 1) {
          p = 'â–ˆ';

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r1, Math.floor((x - min) / cellSize))) {
            p = ' ';
          }

          if (min <= x && x < max && min <= y+1 && y+1 < max && _this.isDark(r2, Math.floor((x - min) / cellSize))) {
            p += ' ';
          }
          else {
            p += 'â–ˆ';
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          ascii += (margin < 1 && y+1 >= max) ? blocksLastLineNoMargin[p] : blocks[p];
        }

        ascii += '\n';
      }

      if (size % 2 && margin > 0) {
        return ascii.substring(0, ascii.length - size - 1) + Array(size+1).join('â–€');
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.createASCII = function(cellSize, margin) {
      cellSize = cellSize || 1;

      if (cellSize < 2) {
        return _createHalfASCII(margin);
      }

      cellSize -= 1;
      margin = (typeof margin == 'undefined')? cellSize * 2 : margin;

      var size = _this.getModuleCount() * cellSize + margin * 2;
      var min = margin;
      var max = size - margin;

      var y, x, r, p;

      var white = Array(cellSize+1).join('â–ˆâ–ˆ');
      var black = Array(cellSize+1).join('  ');

      var ascii = '';
      var line = '';
      for (y = 0; y < size; y += 1) {
        r = Math.floor( (y - min) / cellSize);
        line = '';
        for (x = 0; x < size; x += 1) {
          p = 1;

          if (min <= x && x < max && min <= y && y < max && _this.isDark(r, Math.floor((x - min) / cellSize))) {
            p = 0;
          }

          // Output 2 characters per pixel, to create full square. 1 character per pixels gives only half width of square.
          line += p ? white : black;
        }

        for (r = 0; r < cellSize; r += 1) {
          ascii += line + '\n';
        }
      }

      return ascii.substring(0, ascii.length-1);
    };

    _this.renderTo2dContext = function(context, cellSize) {
      cellSize = cellSize || 2;
      var length = _this.getModuleCount();
      for (var row = 0; row < length; row++) {
        for (var col = 0; col < length; col++) {
          context.fillStyle = _this.isDark(row, col) ? 'black' : 'white';
          context.fillRect(row * cellSize, col * cellSize, cellSize, cellSize);
        }
      }
    }

    return _this;
  };

  //---------------------------------------------------------------------
  // qrcode.stringToBytes
  //---------------------------------------------------------------------

  qrcode.stringToBytesFuncs = {
    'default' : function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        bytes.push(c & 0xff);
      }
      return bytes;
    }
  };

  qrcode.stringToBytes = qrcode.stringToBytesFuncs['default'];

  //---------------------------------------------------------------------
  // qrcode.createStringToBytes
  //---------------------------------------------------------------------

  /**
   * @param unicodeData base64 string of byte array.
   * [16bit Unicode],[16bit Bytes], ...
   * @param numChars
   */
  qrcode.createStringToBytes = function(unicodeData, numChars) {

    // create conversion map.

    var unicodeMap = function() {

      var bin = base64DecodeInputStream(unicodeData);
      var read = function() {
        var b = bin.read();
        if (b == -1) throw 'eof';
        return b;
      };

      var count = 0;
      var unicodeMap = {};
      while (true) {
        var b0 = bin.read();
        if (b0 == -1) break;
        var b1 = read();
        var b2 = read();
        var b3 = read();
        var k = String.fromCharCode( (b0 << 8) | b1);
        var v = (b2 << 8) | b3;
        unicodeMap[k] = v;
        count += 1;
      }
      if (count != numChars) {
        throw count + ' != ' + numChars;
      }

      return unicodeMap;
    }();

    var unknownChar = '?'.charCodeAt(0);

    return function(s) {
      var bytes = [];
      for (var i = 0; i < s.length; i += 1) {
        var c = s.charCodeAt(i);
        if (c < 128) {
          bytes.push(c);
        } else {
          var b = unicodeMap[s.charAt(i)];
          if (typeof b == 'number') {
            if ( (b & 0xff) == b) {
              // 1byte
              bytes.push(b);
            } else {
              // 2bytes
              bytes.push(b >>> 8);
              bytes.push(b & 0xff);
            }
          } else {
            bytes.push(unknownChar);
          }
        }
      }
      return bytes;
    };
  };

  //---------------------------------------------------------------------
  // QRMode
  //---------------------------------------------------------------------

  var QRMode = {
    MODE_NUMBER :    1 << 0,
    MODE_ALPHA_NUM : 1 << 1,
    MODE_8BIT_BYTE : 1 << 2,
    MODE_KANJI :     1 << 3
  };

  //---------------------------------------------------------------------
  // QRErrorCorrectionLevel
  //---------------------------------------------------------------------

  var QRErrorCorrectionLevel = {
    L : 1,
    M : 0,
    Q : 3,
    H : 2
  };

  //---------------------------------------------------------------------
  // QRMaskPattern
  //---------------------------------------------------------------------

  var QRMaskPattern = {
    PATTERN000 : 0,
    PATTERN001 : 1,
    PATTERN010 : 2,
    PATTERN011 : 3,
    PATTERN100 : 4,
    PATTERN101 : 5,
    PATTERN110 : 6,
    PATTERN111 : 7
  };

  //---------------------------------------------------------------------
  // QRUtil
  //---------------------------------------------------------------------

  var QRUtil = function() {

    var PATTERN_POSITION_TABLE = [
      [],
      [6, 18],
      [6, 22],
      [6, 26],
      [6, 30],
      [6, 34],
      [6, 22, 38],
      [6, 24, 42],
      [6, 26, 46],
      [6, 28, 50],
      [6, 30, 54],
      [6, 32, 58],
      [6, 34, 62],
      [6, 26, 46, 66],
      [6, 26, 48, 70],
      [6, 26, 50, 74],
      [6, 30, 54, 78],
      [6, 30, 56, 82],
      [6, 30, 58, 86],
      [6, 34, 62, 90],
      [6, 28, 50, 72, 94],
      [6, 26, 50, 74, 98],
      [6, 30, 54, 78, 102],
      [6, 28, 54, 80, 106],
      [6, 32, 58, 84, 110],
      [6, 30, 58, 86, 114],
      [6, 34, 62, 90, 118],
      [6, 26, 50, 74, 98, 122],
      [6, 30, 54, 78, 102, 126],
      [6, 26, 52, 78, 104, 130],
      [6, 30, 56, 82, 108, 134],
      [6, 34, 60, 86, 112, 138],
      [6, 30, 58, 86, 114, 142],
      [6, 34, 62, 90, 118, 146],
      [6, 30, 54, 78, 102, 126, 150],
      [6, 24, 50, 76, 102, 128, 154],
      [6, 28, 54, 80, 106, 132, 158],
      [6, 32, 58, 84, 110, 136, 162],
      [6, 26, 54, 82, 110, 138, 166],
      [6, 30, 58, 86, 114, 142, 170]
    ];
    var G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | (1 << 0);
    var G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | (1 << 0);
    var G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);

    var _this = {};

    var getBCHDigit = function(data) {
      var digit = 0;
      while (data != 0) {
        digit += 1;
        data >>>= 1;
      }
      return digit;
    };

    _this.getBCHTypeInfo = function(data) {
      var d = data << 10;
      while (getBCHDigit(d) - getBCHDigit(G15) >= 0) {
        d ^= (G15 << (getBCHDigit(d) - getBCHDigit(G15) ) );
      }
      return ( (data << 10) | d) ^ G15_MASK;
    };

    _this.getBCHTypeNumber = function(data) {
      var d = data << 12;
      while (getBCHDigit(d) - getBCHDigit(G18) >= 0) {
        d ^= (G18 << (getBCHDigit(d) - getBCHDigit(G18) ) );
      }
      return (data << 12) | d;
    };

    _this.getPatternPosition = function(typeNumber) {
      return PATTERN_POSITION_TABLE[typeNumber - 1];
    };

    _this.getMaskFunction = function(maskPattern) {

      switch (maskPattern) {

      case QRMaskPattern.PATTERN000 :
        return function(i, j) { return (i + j) % 2 == 0; };
      case QRMaskPattern.PATTERN001 :
        return function(i, j) { return i % 2 == 0; };
      case QRMaskPattern.PATTERN010 :
        return function(i, j) { return j % 3 == 0; };
      case QRMaskPattern.PATTERN011 :
        return function(i, j) { return (i + j) % 3 == 0; };
      case QRMaskPattern.PATTERN100 :
        return function(i, j) { return (Math.floor(i / 2) + Math.floor(j / 3) ) % 2 == 0; };
      case QRMaskPattern.PATTERN101 :
        return function(i, j) { return (i * j) % 2 + (i * j) % 3 == 0; };
      case QRMaskPattern.PATTERN110 :
        return function(i, j) { return ( (i * j) % 2 + (i * j) % 3) % 2 == 0; };
      case QRMaskPattern.PATTERN111 :
        return function(i, j) { return ( (i * j) % 3 + (i + j) % 2) % 2 == 0; };

      default :
        throw 'bad maskPattern:' + maskPattern;
      }
    };

    _this.getErrorCorrectPolynomial = function(errorCorrectLength) {
      var a = qrPolynomial([1], 0);
      for (var i = 0; i < errorCorrectLength; i += 1) {
        a = a.multiply(qrPolynomial([1, QRMath.gexp(i)], 0) );
      }
      return a;
    };

    _this.getLengthInBits = function(mode, type) {

      if (1 <= type && type < 10) {

        // 1 - 9

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 10;
        case QRMode.MODE_ALPHA_NUM : return 9;
        case QRMode.MODE_8BIT_BYTE : return 8;
        case QRMode.MODE_KANJI     : return 8;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 27) {

        // 10 - 26

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 12;
        case QRMode.MODE_ALPHA_NUM : return 11;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 10;
        default :
          throw 'mode:' + mode;
        }

      } else if (type < 41) {

        // 27 - 40

        switch(mode) {
        case QRMode.MODE_NUMBER    : return 14;
        case QRMode.MODE_ALPHA_NUM : return 13;
        case QRMode.MODE_8BIT_BYTE : return 16;
        case QRMode.MODE_KANJI     : return 12;
        default :
          throw 'mode:' + mode;
        }

      } else {
        throw 'type:' + type;
      }
    };

    _this.getLostPoint = function(qrcode) {

      var moduleCount = qrcode.getModuleCount();

      var lostPoint = 0;

      // LEVEL1

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount; col += 1) {

          var sameCount = 0;
          var dark = qrcode.isDark(row, col);

          for (var r = -1; r <= 1; r += 1) {

            if (row + r < 0 || moduleCount <= row + r) {
              continue;
            }

            for (var c = -1; c <= 1; c += 1) {

              if (col + c < 0 || moduleCount <= col + c) {
                continue;
              }

              if (r == 0 && c == 0) {
                continue;
              }

              if (dark == qrcode.isDark(row + r, col + c) ) {
                sameCount += 1;
              }
            }
          }

          if (sameCount > 5) {
            lostPoint += (3 + sameCount - 5);
          }
        }
      };

      // LEVEL2

      for (var row = 0; row < moduleCount - 1; row += 1) {
        for (var col = 0; col < moduleCount - 1; col += 1) {
          var count = 0;
          if (qrcode.isDark(row, col) ) count += 1;
          if (qrcode.isDark(row + 1, col) ) count += 1;
          if (qrcode.isDark(row, col + 1) ) count += 1;
          if (qrcode.isDark(row + 1, col + 1) ) count += 1;
          if (count == 0 || count == 4) {
            lostPoint += 3;
          }
        }
      }

      // LEVEL3

      for (var row = 0; row < moduleCount; row += 1) {
        for (var col = 0; col < moduleCount - 6; col += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row, col + 1)
              &&  qrcode.isDark(row, col + 2)
              &&  qrcode.isDark(row, col + 3)
              &&  qrcode.isDark(row, col + 4)
              && !qrcode.isDark(row, col + 5)
              &&  qrcode.isDark(row, col + 6) ) {
            lostPoint += 40;
          }
        }
      }

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount - 6; row += 1) {
          if (qrcode.isDark(row, col)
              && !qrcode.isDark(row + 1, col)
              &&  qrcode.isDark(row + 2, col)
              &&  qrcode.isDark(row + 3, col)
              &&  qrcode.isDark(row + 4, col)
              && !qrcode.isDark(row + 5, col)
              &&  qrcode.isDark(row + 6, col) ) {
            lostPoint += 40;
          }
        }
      }

      // LEVEL4

      var darkCount = 0;

      for (var col = 0; col < moduleCount; col += 1) {
        for (var row = 0; row < moduleCount; row += 1) {
          if (qrcode.isDark(row, col) ) {
            darkCount += 1;
          }
        }
      }

      var ratio = Math.abs(100 * darkCount / moduleCount / moduleCount - 50) / 5;
      lostPoint += ratio * 10;

      return lostPoint;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // QRMath
  //---------------------------------------------------------------------

  var QRMath = function() {

    var EXP_TABLE = new Array(256);
    var LOG_TABLE = new Array(256);

    // initialize tables
    for (var i = 0; i < 8; i += 1) {
      EXP_TABLE[i] = 1 << i;
    }
    for (var i = 8; i < 256; i += 1) {
      EXP_TABLE[i] = EXP_TABLE[i - 4]
        ^ EXP_TABLE[i - 5]
        ^ EXP_TABLE[i - 6]
        ^ EXP_TABLE[i - 8];
    }
    for (var i = 0; i < 255; i += 1) {
      LOG_TABLE[EXP_TABLE[i] ] = i;
    }

    var _this = {};

    _this.glog = function(n) {

      if (n < 1) {
        throw 'glog(' + n + ')';
      }

      return LOG_TABLE[n];
    };

    _this.gexp = function(n) {

      while (n < 0) {
        n += 255;
      }

      while (n >= 256) {
        n -= 255;
      }

      return EXP_TABLE[n];
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrPolynomial
  //---------------------------------------------------------------------

  function qrPolynomial(num, shift) {

    if (typeof num.length == 'undefined') {
      throw num.length + '/' + shift;
    }

    var _num = function() {
      var offset = 0;
      while (offset < num.length && num[offset] == 0) {
        offset += 1;
      }
      var _num = new Array(num.length - offset + shift);
      for (var i = 0; i < num.length - offset; i += 1) {
        _num[i] = num[i + offset];
      }
      return _num;
    }();

    var _this = {};

    _this.getAt = function(index) {
      return _num[index];
    };

    _this.getLength = function() {
      return _num.length;
    };

    _this.multiply = function(e) {

      var num = new Array(_this.getLength() + e.getLength() - 1);

      for (var i = 0; i < _this.getLength(); i += 1) {
        for (var j = 0; j < e.getLength(); j += 1) {
          num[i + j] ^= QRMath.gexp(QRMath.glog(_this.getAt(i) ) + QRMath.glog(e.getAt(j) ) );
        }
      }

      return qrPolynomial(num, 0);
    };

    _this.mod = function(e) {

      if (_this.getLength() - e.getLength() < 0) {
        return _this;
      }

      var ratio = QRMath.glog(_this.getAt(0) ) - QRMath.glog(e.getAt(0) );

      var num = new Array(_this.getLength() );
      for (var i = 0; i < _this.getLength(); i += 1) {
        num[i] = _this.getAt(i);
      }

      for (var i = 0; i < e.getLength(); i += 1) {
        num[i] ^= QRMath.gexp(QRMath.glog(e.getAt(i) ) + ratio);
      }

      // recursive call
      return qrPolynomial(num, 0).mod(e);
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // QRRSBlock
  //---------------------------------------------------------------------

  var QRRSBlock = function() {

    var RS_BLOCK_TABLE = [

      // L
      // M
      // Q
      // H

      // 1
      [1, 26, 19],
      [1, 26, 16],
      [1, 26, 13],
      [1, 26, 9],

      // 2
      [1, 44, 34],
      [1, 44, 28],
      [1, 44, 22],
      [1, 44, 16],

      // 3
      [1, 70, 55],
      [1, 70, 44],
      [2, 35, 17],
      [2, 35, 13],

      // 4
      [1, 100, 80],
      [2, 50, 32],
      [2, 50, 24],
      [4, 25, 9],

      // 5
      [1, 134, 108],
      [2, 67, 43],
      [2, 33, 15, 2, 34, 16],
      [2, 33, 11, 2, 34, 12],

      // 6
      [2, 86, 68],
      [4, 43, 27],
      [4, 43, 19],
      [4, 43, 15],

      // 7
      [2, 98, 78],
      [4, 49, 31],
      [2, 32, 14, 4, 33, 15],
      [4, 39, 13, 1, 40, 14],

      // 8
      [2, 121, 97],
      [2, 60, 38, 2, 61, 39],
      [4, 40, 18, 2, 41, 19],
      [4, 40, 14, 2, 41, 15],

      // 9
      [2, 146, 116],
      [3, 58, 36, 2, 59, 37],
      [4, 36, 16, 4, 37, 17],
      [4, 36, 12, 4, 37, 13],

      // 10
      [2, 86, 68, 2, 87, 69],
      [4, 69, 43, 1, 70, 44],
      [6, 43, 19, 2, 44, 20],
      [6, 43, 15, 2, 44, 16],

      // 11
      [4, 101, 81],
      [1, 80, 50, 4, 81, 51],
      [4, 50, 22, 4, 51, 23],
      [3, 36, 12, 8, 37, 13],

      // 12
      [2, 116, 92, 2, 117, 93],
      [6, 58, 36, 2, 59, 37],
      [4, 46, 20, 6, 47, 21],
      [7, 42, 14, 4, 43, 15],

      // 13
      [4, 133, 107],
      [8, 59, 37, 1, 60, 38],
      [8, 44, 20, 4, 45, 21],
      [12, 33, 11, 4, 34, 12],

      // 14
      [3, 145, 115, 1, 146, 116],
      [4, 64, 40, 5, 65, 41],
      [11, 36, 16, 5, 37, 17],
      [11, 36, 12, 5, 37, 13],

      // 15
      [5, 109, 87, 1, 110, 88],
      [5, 65, 41, 5, 66, 42],
      [5, 54, 24, 7, 55, 25],
      [11, 36, 12, 7, 37, 13],

      // 16
      [5, 122, 98, 1, 123, 99],
      [7, 73, 45, 3, 74, 46],
      [15, 43, 19, 2, 44, 20],
      [3, 45, 15, 13, 46, 16],

      // 17
      [1, 135, 107, 5, 136, 108],
      [10, 74, 46, 1, 75, 47],
      [1, 50, 22, 15, 51, 23],
      [2, 42, 14, 17, 43, 15],

      // 18
      [5, 150, 120, 1, 151, 121],
      [9, 69, 43, 4, 70, 44],
      [17, 50, 22, 1, 51, 23],
      [2, 42, 14, 19, 43, 15],

      // 19
      [3, 141, 113, 4, 142, 114],
      [3, 70, 44, 11, 71, 45],
      [17, 47, 21, 4, 48, 22],
      [9, 39, 13, 16, 40, 14],

      // 20
      [3, 135, 107, 5, 136, 108],
      [3, 67, 41, 13, 68, 42],
      [15, 54, 24, 5, 55, 25],
      [15, 43, 15, 10, 44, 16],

      // 21
      [4, 144, 116, 4, 145, 117],
      [17, 68, 42],
      [17, 50, 22, 6, 51, 23],
      [19, 46, 16, 6, 47, 17],

      // 22
      [2, 139, 111, 7, 140, 112],
      [17, 74, 46],
      [7, 54, 24, 16, 55, 25],
      [34, 37, 13],

      // 23
      [4, 151, 121, 5, 152, 122],
      [4, 75, 47, 14, 76, 48],
      [11, 54, 24, 14, 55, 25],
      [16, 45, 15, 14, 46, 16],

      // 24
      [6, 147, 117, 4, 148, 118],
      [6, 73, 45, 14, 74, 46],
      [11, 54, 24, 16, 55, 25],
      [30, 46, 16, 2, 47, 17],

      // 25
      [8, 132, 106, 4, 133, 107],
      [8, 75, 47, 13, 76, 48],
      [7, 54, 24, 22, 55, 25],
      [22, 45, 15, 13, 46, 16],

      // 26
      [10, 142, 114, 2, 143, 115],
      [19, 74, 46, 4, 75, 47],
      [28, 50, 22, 6, 51, 23],
      [33, 46, 16, 4, 47, 17],

      // 27
      [8, 152, 122, 4, 153, 123],
      [22, 73, 45, 3, 74, 46],
      [8, 53, 23, 26, 54, 24],
      [12, 45, 15, 28, 46, 16],

      // 28
      [3, 147, 117, 10, 148, 118],
      [3, 73, 45, 23, 74, 46],
      [4, 54, 24, 31, 55, 25],
      [11, 45, 15, 31, 46, 16],

      // 29
      [7, 146, 116, 7, 147, 117],
      [21, 73, 45, 7, 74, 46],
      [1, 53, 23, 37, 54, 24],
      [19, 45, 15, 26, 46, 16],

      // 30
      [5, 145, 115, 10, 146, 116],
      [19, 75, 47, 10, 76, 48],
      [15, 54, 24, 25, 55, 25],
      [23, 45, 15, 25, 46, 16],

      // 31
      [13, 145, 115, 3, 146, 116],
      [2, 74, 46, 29, 75, 47],
      [42, 54, 24, 1, 55, 25],
      [23, 45, 15, 28, 46, 16],

      // 32
      [17, 145, 115],
      [10, 74, 46, 23, 75, 47],
      [10, 54, 24, 35, 55, 25],
      [19, 45, 15, 35, 46, 16],

      // 33
      [17, 145, 115, 1, 146, 116],
      [14, 74, 46, 21, 75, 47],
      [29, 54, 24, 19, 55, 25],
      [11, 45, 15, 46, 46, 16],

      // 34
      [13, 145, 115, 6, 146, 116],
      [14, 74, 46, 23, 75, 47],
      [44, 54, 24, 7, 55, 25],
      [59, 46, 16, 1, 47, 17],

      // 35
      [12, 151, 121, 7, 152, 122],
      [12, 75, 47, 26, 76, 48],
      [39, 54, 24, 14, 55, 25],
      [22, 45, 15, 41, 46, 16],

      // 36
      [6, 151, 121, 14, 152, 122],
      [6, 75, 47, 34, 76, 48],
      [46, 54, 24, 10, 55, 25],
      [2, 45, 15, 64, 46, 16],

      // 37
      [17, 152, 122, 4, 153, 123],
      [29, 74, 46, 14, 75, 47],
      [49, 54, 24, 10, 55, 25],
      [24, 45, 15, 46, 46, 16],

      // 38
      [4, 152, 122, 18, 153, 123],
      [13, 74, 46, 32, 75, 47],
      [48, 54, 24, 14, 55, 25],
      [42, 45, 15, 32, 46, 16],

      // 39
      [20, 147, 117, 4, 148, 118],
      [40, 75, 47, 7, 76, 48],
      [43, 54, 24, 22, 55, 25],
      [10, 45, 15, 67, 46, 16],

      // 40
      [19, 148, 118, 6, 149, 119],
      [18, 75, 47, 31, 76, 48],
      [34, 54, 24, 34, 55, 25],
      [20, 45, 15, 61, 46, 16]
    ];

    var qrRSBlock = function(totalCount, dataCount) {
      var _this = {};
      _this.totalCount = totalCount;
      _this.dataCount = dataCount;
      return _this;
    };

    var _this = {};

    var getRsBlockTable = function(typeNumber, errorCorrectionLevel) {

      switch(errorCorrectionLevel) {
      case QRErrorCorrectionLevel.L :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 0];
      case QRErrorCorrectionLevel.M :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 1];
      case QRErrorCorrectionLevel.Q :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 2];
      case QRErrorCorrectionLevel.H :
        return RS_BLOCK_TABLE[(typeNumber - 1) * 4 + 3];
      default :
        return undefined;
      }
    };

    _this.getRSBlocks = function(typeNumber, errorCorrectionLevel) {

      var rsBlock = getRsBlockTable(typeNumber, errorCorrectionLevel);

      if (typeof rsBlock == 'undefined') {
        throw 'bad rs block @ typeNumber:' + typeNumber +
            '/errorCorrectionLevel:' + errorCorrectionLevel;
      }

      var length = rsBlock.length / 3;

      var list = [];

      for (var i = 0; i < length; i += 1) {

        var count = rsBlock[i * 3 + 0];
        var totalCount = rsBlock[i * 3 + 1];
        var dataCount = rsBlock[i * 3 + 2];

        for (var j = 0; j < count; j += 1) {
          list.push(qrRSBlock(totalCount, dataCount) );
        }
      }

      return list;
    };

    return _this;
  }();

  //---------------------------------------------------------------------
  // qrBitBuffer
  //---------------------------------------------------------------------

  var qrBitBuffer = function() {

    var _buffer = [];
    var _length = 0;

    var _this = {};

    _this.getBuffer = function() {
      return _buffer;
    };

    _this.getAt = function(index) {
      var bufIndex = Math.floor(index / 8);
      return ( (_buffer[bufIndex] >>> (7 - index % 8) ) & 1) == 1;
    };

    _this.put = function(num, length) {
      for (var i = 0; i < length; i += 1) {
        _this.putBit( ( (num >>> (length - i - 1) ) & 1) == 1);
      }
    };

    _this.getLengthInBits = function() {
      return _length;
    };

    _this.putBit = function(bit) {

      var bufIndex = Math.floor(_length / 8);
      if (_buffer.length <= bufIndex) {
        _buffer.push(0);
      }

      if (bit) {
        _buffer[bufIndex] |= (0x80 >>> (_length % 8) );
      }

      _length += 1;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrNumber
  //---------------------------------------------------------------------

  var qrNumber = function(data) {

    var _mode = QRMode.MODE_NUMBER;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var data = _data;

      var i = 0;

      while (i + 2 < data.length) {
        buffer.put(strToNum(data.substring(i, i + 3) ), 10);
        i += 3;
      }

      if (i < data.length) {
        if (data.length - i == 1) {
          buffer.put(strToNum(data.substring(i, i + 1) ), 4);
        } else if (data.length - i == 2) {
          buffer.put(strToNum(data.substring(i, i + 2) ), 7);
        }
      }
    };

    var strToNum = function(s) {
      var num = 0;
      for (var i = 0; i < s.length; i += 1) {
        num = num * 10 + chatToNum(s.charAt(i) );
      }
      return num;
    };

    var chatToNum = function(c) {
      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      }
      throw 'illegal char :' + c;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrAlphaNum
  //---------------------------------------------------------------------

  var qrAlphaNum = function(data) {

    var _mode = QRMode.MODE_ALPHA_NUM;
    var _data = data;

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _data.length;
    };

    _this.write = function(buffer) {

      var s = _data;

      var i = 0;

      while (i + 1 < s.length) {
        buffer.put(
          getCode(s.charAt(i) ) * 45 +
          getCode(s.charAt(i + 1) ), 11);
        i += 2;
      }

      if (i < s.length) {
        buffer.put(getCode(s.charAt(i) ), 6);
      }
    };

    var getCode = function(c) {

      if ('0' <= c && c <= '9') {
        return c.charCodeAt(0) - '0'.charCodeAt(0);
      } else if ('A' <= c && c <= 'Z') {
        return c.charCodeAt(0) - 'A'.charCodeAt(0) + 10;
      } else {
        switch (c) {
        case ' ' : return 36;
        case '$' : return 37;
        case '%' : return 38;
        case '*' : return 39;
        case '+' : return 40;
        case '-' : return 41;
        case '.' : return 42;
        case '/' : return 43;
        case ':' : return 44;
        default :
          throw 'illegal char :' + c;
        }
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qr8BitByte
  //---------------------------------------------------------------------

  var qr8BitByte = function(data) {

    var _mode = QRMode.MODE_8BIT_BYTE;
    var _data = data;
    var _bytes = qrcode.stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return _bytes.length;
    };

    _this.write = function(buffer) {
      for (var i = 0; i < _bytes.length; i += 1) {
        buffer.put(_bytes[i], 8);
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // qrKanji
  //---------------------------------------------------------------------

  var qrKanji = function(data) {

    var _mode = QRMode.MODE_KANJI;
    var _data = data;

    var stringToBytes = qrcode.stringToBytesFuncs['SJIS'];
    if (!stringToBytes) {
      throw 'sjis not supported.';
    }
    !function(c, code) {
      // self test for sjis support.
      var test = stringToBytes(c);
      if (test.length != 2 || ( (test[0] << 8) | test[1]) != code) {
        throw 'sjis not supported.';
      }
    }('\u53cb', 0x9746);

    var _bytes = stringToBytes(data);

    var _this = {};

    _this.getMode = function() {
      return _mode;
    };

    _this.getLength = function(buffer) {
      return ~~(_bytes.length / 2);
    };

    _this.write = function(buffer) {

      var data = _bytes;

      var i = 0;

      while (i + 1 < data.length) {

        var c = ( (0xff & data[i]) << 8) | (0xff & data[i + 1]);

        if (0x8140 <= c && c <= 0x9FFC) {
          c -= 0x8140;
        } else if (0xE040 <= c && c <= 0xEBBF) {
          c -= 0xC140;
        } else {
          throw 'illegal char at ' + (i + 1) + '/' + c;
        }

        c = ( (c >>> 8) & 0xff) * 0xC0 + (c & 0xff);

        buffer.put(c, 13);

        i += 2;
      }

      if (i < data.length) {
        throw 'illegal char at ' + (i + 1);
      }
    };

    return _this;
  };

  //=====================================================================
  // GIF Support etc.
  //

  //---------------------------------------------------------------------
  // byteArrayOutputStream
  //---------------------------------------------------------------------

  var byteArrayOutputStream = function() {

    var _bytes = [];

    var _this = {};

    _this.writeByte = function(b) {
      _bytes.push(b & 0xff);
    };

    _this.writeShort = function(i) {
      _this.writeByte(i);
      _this.writeByte(i >>> 8);
    };

    _this.writeBytes = function(b, off, len) {
      off = off || 0;
      len = len || b.length;
      for (var i = 0; i < len; i += 1) {
        _this.writeByte(b[i + off]);
      }
    };

    _this.writeString = function(s) {
      for (var i = 0; i < s.length; i += 1) {
        _this.writeByte(s.charCodeAt(i) );
      }
    };

    _this.toByteArray = function() {
      return _bytes;
    };

    _this.toString = function() {
      var s = '';
      s += '[';
      for (var i = 0; i < _bytes.length; i += 1) {
        if (i > 0) {
          s += ',';
        }
        s += _bytes[i];
      }
      s += ']';
      return s;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64EncodeOutputStream
  //---------------------------------------------------------------------

  var base64EncodeOutputStream = function() {

    var _buffer = 0;
    var _buflen = 0;
    var _length = 0;
    var _base64 = '';

    var _this = {};

    var writeEncoded = function(b) {
      _base64 += String.fromCharCode(encode(b & 0x3f) );
    };

    var encode = function(n) {
      if (n < 0) {
        // error.
      } else if (n < 26) {
        return 0x41 + n;
      } else if (n < 52) {
        return 0x61 + (n - 26);
      } else if (n < 62) {
        return 0x30 + (n - 52);
      } else if (n == 62) {
        return 0x2b;
      } else if (n == 63) {
        return 0x2f;
      }
      throw 'n:' + n;
    };

    _this.writeByte = function(n) {

      _buffer = (_buffer << 8) | (n & 0xff);
      _buflen += 8;
      _length += 1;

      while (_buflen >= 6) {
        writeEncoded(_buffer >>> (_buflen - 6) );
        _buflen -= 6;
      }
    };

    _this.flush = function() {

      if (_buflen > 0) {
        writeEncoded(_buffer << (6 - _buflen) );
        _buffer = 0;
        _buflen = 0;
      }

      if (_length % 3 != 0) {
        // padding
        var padlen = 3 - _length % 3;
        for (var i = 0; i < padlen; i += 1) {
          _base64 += '=';
        }
      }
    };

    _this.toString = function() {
      return _base64;
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // base64DecodeInputStream
  //---------------------------------------------------------------------

  var base64DecodeInputStream = function(str) {

    var _str = str;
    var _pos = 0;
    var _buffer = 0;
    var _buflen = 0;

    var _this = {};

    _this.read = function() {

      while (_buflen < 8) {

        if (_pos >= _str.length) {
          if (_buflen == 0) {
            return -1;
          }
          throw 'unexpected end of file./' + _buflen;
        }

        var c = _str.charAt(_pos);
        _pos += 1;

        if (c == '=') {
          _buflen = 0;
          return -1;
        } else if (c.match(/^\s$/) ) {
          // ignore if whitespace.
          continue;
        }

        _buffer = (_buffer << 6) | decode(c.charCodeAt(0) );
        _buflen += 6;
      }

      var n = (_buffer >>> (_buflen - 8) ) & 0xff;
      _buflen -= 8;
      return n;
    };

    var decode = function(c) {
      if (0x41 <= c && c <= 0x5a) {
        return c - 0x41;
      } else if (0x61 <= c && c <= 0x7a) {
        return c - 0x61 + 26;
      } else if (0x30 <= c && c <= 0x39) {
        return c - 0x30 + 52;
      } else if (c == 0x2b) {
        return 62;
      } else if (c == 0x2f) {
        return 63;
      } else {
        throw 'c:' + c;
      }
    };

    return _this;
  };

  //---------------------------------------------------------------------
  // gifImage (B/W)
  //---------------------------------------------------------------------

  var gifImage = function(width, height) {

    var _width = width;
    var _height = height;
    var _data = new Array(width * height);

    var _this = {};

    _this.setPixel = function(x, y, pixel) {
      _data[y * _width + x] = pixel;
    };

    _this.write = function(out) {

      //---------------------------------
      // GIF Signature

      out.writeString('GIF87a');

      //---------------------------------
      // Screen Descriptor

      out.writeShort(_width);
      out.writeShort(_height);

      out.writeByte(0x80); // 2bit
      out.writeByte(0);
      out.writeByte(0);

      //---------------------------------
      // Global Color Map

      // black
      out.writeByte(0x00);
      out.writeByte(0x00);
      out.writeByte(0x00);

      // white
      out.writeByte(0xff);
      out.writeByte(0xff);
      out.writeByte(0xff);

      //---------------------------------
      // Image Descriptor

      out.writeString(',');
      out.writeShort(0);
      out.writeShort(0);
      out.writeShort(_width);
      out.writeShort(_height);
      out.writeByte(0);

      //---------------------------------
      // Local Color Map

      //---------------------------------
      // Raster Data

      var lzwMinCodeSize = 2;
      var raster = getLZWRaster(lzwMinCodeSize);

      out.writeByte(lzwMinCodeSize);

      var offset = 0;

      while (raster.length - offset > 255) {
        out.writeByte(255);
        out.writeBytes(raster, offset, 255);
        offset += 255;
      }

      out.writeByte(raster.length - offset);
      out.writeBytes(raster, offset, raster.length - offset);
      out.writeByte(0x00);

      //---------------------------------
      // GIF Terminator
      out.writeString(';');
    };

    var bitOutputStream = function(out) {

      var _out = out;
      var _bitLength = 0;
      var _bitBuffer = 0;

      var _this = {};

      _this.write = function(data, length) {

        if ( (data >>> length) != 0) {
          throw 'length over';
        }

        while (_bitLength + length >= 8) {
          _out.writeByte(0xff & ( (data << _bitLength) | _bitBuffer) );
          length -= (8 - _bitLength);
          data >>>= (8 - _bitLength);
          _bitBuffer = 0;
          _bitLength = 0;
        }

        _bitBuffer = (data << _bitLength) | _bitBuffer;
        _bitLength = _bitLength + length;
      };

      _this.flush = function() {
        if (_bitLength > 0) {
          _out.writeByte(_bitBuffer);
        }
      };

      return _this;
    };

    var getLZWRaster = function(lzwMinCodeSize) {

      var clearCode = 1 << lzwMinCodeSize;
      var endCode = (1 << lzwMinCodeSize) + 1;
      var bitLength = lzwMinCodeSize + 1;

      // Setup LZWTable
      var table = lzwTable();

      for (var i = 0; i < clearCode; i += 1) {
        table.add(String.fromCharCode(i) );
      }
      table.add(String.fromCharCode(clearCode) );
      table.add(String.fromCharCode(endCode) );

      var byteOut = byteArrayOutputStream();
      var bitOut = bitOutputStream(byteOut);

      // clear code
      bitOut.write(clearCode, bitLength);

      var dataIndex = 0;

      var s = String.fromCharCode(_data[dataIndex]);
      dataIndex += 1;

      while (dataIndex < _data.length) {

        var c = String.fromCharCode(_data[dataIndex]);
        dataIndex += 1;

        if (table.contains(s + c) ) {

          s = s + c;

        } else {

          bitOut.write(table.indexOf(s), bitLength);

          if (table.size() < 0xfff) {

            if (table.size() == (1 << bitLength) ) {
              bitLength += 1;
            }

            table.add(s + c);
          }

          s = c;
        }
      }

      bitOut.write(table.indexOf(s), bitLength);

      // end code
      bitOut.write(endCode, bitLength);

      bitOut.flush();

      return byteOut.toByteArray();
    };

    var lzwTable = function() {

      var _map = {};
      var _size = 0;

      var _this = {};

      _this.add = function(key) {
        if (_this.contains(key) ) {
          throw 'dup key:' + key;
        }
        _map[key] = _size;
        _size += 1;
      };

      _this.size = function() {
        return _size;
      };

      _this.indexOf = function(key) {
        return _map[key];
      };

      _this.contains = function(key) {
        return typeof _map[key] != 'undefined';
      };

      return _this;
    };

    return _this;
  };

  var createDataURL = function(width, height, getPixel) {
    var gif = gifImage(width, height);
    for (var y = 0; y < height; y += 1) {
      for (var x = 0; x < width; x += 1) {
        gif.setPixel(x, y, getPixel(x, y) );
      }
    }

    var b = byteArrayOutputStream();
    gif.write(b);

    var base64 = base64EncodeOutputStream();
    var bytes = b.toByteArray();
    for (var i = 0; i < bytes.length; i += 1) {
      base64.writeByte(bytes[i]);
    }
    base64.flush();

    return 'data:image/gif;base64,' + base64;
  };

  //---------------------------------------------------------------------
  // returns qrcode function.

  return qrcode;
}();

// multibyte support
!function() {

  qrcode.stringToBytesFuncs['UTF-8'] = function(s) {
    // http://stackoverflow.com/questions/18729405/how-to-convert-utf8-string-to-byte-array
    function toUTF8Array(str) {
      var utf8 = [];
      for (var i=0; i < str.length; i++) {
        var charcode = str.charCodeAt(i);
        if (charcode < 0x80) utf8.push(charcode);
        else if (charcode < 0x800) {
          utf8.push(0xc0 | (charcode >> 6),
              0x80 | (charcode & 0x3f));
        }
        else if (charcode < 0xd800 || charcode >= 0xe000) {
          utf8.push(0xe0 | (charcode >> 12),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
        // surrogate pair
        else {
          i++;
          // UTF-16 encodes 0x10000-0x10FFFF by
          // subtracting 0x10000 and splitting the
          // 20 bits of 0x0-0xFFFFF into two halves
          charcode = 0x10000 + (((charcode & 0x3ff)<<10)
            | (str.charCodeAt(i) & 0x3ff));
          utf8.push(0xf0 | (charcode >>18),
              0x80 | ((charcode>>12) & 0x3f),
              0x80 | ((charcode>>6) & 0x3f),
              0x80 | (charcode & 0x3f));
        }
      }
      return utf8;
    }
    return toUTF8Array(s);
  };

}();

(function (factory) {
  if (typeof define === 'function' && define.amd) {
      define([], factory);
  } else if (typeof exports === 'object') {
      module.exports = factory();
  }
}(function () {
    return qrcode;
}));

/* ============ avatars: thousands of looks ============ */
/* Every category has many shapes. Most shapes come in any colour (16 ready-made colours plus a colour picker).
   A face is built from eyes + mouth + brows + extras. Body height, width and head size can be changed too.
   An item is stored as "shape" or "shape~rrggbb" (for example "wizard~a45cff"). */
const AV_DEFAULT={skin:'#f2c28b',torso:'#3b8bff',arms:'#3b8bff',legs:'#2b2f3a',face:'smile',hat:'none',hair:'none',acc:'none',back:'none',shirt:'none',pants:'none',shoe:'none',accent:'#ff5a5f',bh:1,bw:1,hs:1};
const VCOL=['#ff4d5e','#ff8a3d','#ffd23f','#7ed957','#1fc36b','#22c3c3','#3b8bff','#5b5bd6','#a45cff','#ff5cae','#ffffff','#c8ced6','#5b6470','#1f2430','#8a5a3a','#e8c66a'];
const parseItem=id=>{id=String(id||'none');const i=id.indexOf('~');return i<0?[id,null]:[id.slice(0,i),'#'+id.slice(i+1)]};
const mkItem=(shape,col)=>col&&/^#[0-9a-f]{6}$/i.test(col)?shape+'~'+col.slice(1).toLowerCase():shape;

/* ---- small 3D helpers (head space: the head is a 1.7 cube around 0,0,0; its front faces +z) ---- */
const avM=(g,geo,c,x,y,z,em)=>{const m=new THREE.Mesh(geo,LM(c,em?{emissive:em}:null));m.position.set(x,y,z);m.castShadow=true;g.add(m);return m};
const abx=(g,w,h,d,c,x,y,z,em)=>avM(g,new THREE.BoxGeometry(w,h,d),c,x,y,z,em);
const acy=(g,rt,rb,h,c,x,y,z,seg,em)=>avM(g,new THREE.CylinderGeometry(rt,rb,h,seg||12),c,x,y,z,em);
const asp=(g,r,c,x,y,z,em)=>avM(g,new THREE.SphereGeometry(r,12,9),c,x,y,z,em);
const adome=(g,r,c,x,y,z)=>avM(g,new THREE.SphereGeometry(r,14,8,0,Math.PI*2,0,Math.PI/2),c,x,y,z);
const ato=(g,R,r,c,x,y,z)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(R,r,6,20),LM(c));m.position.set(x,y,z);g.add(m);return m};
const arot=(m,x,y,z)=>{m.rotation.set(x||0,y||0,z||0);return m};
const FZ=.87,EYE_Y=.19;
const crownN=(g,c,n)=>{acy(g,.95,.95,.5,c,0,1.1,0,10,'#553300');for(let i=0;i<n;i++){const a=i/n*Math.PI*2;acy(g,0,.2,.55,c,Math.cos(a)*.72,1.6,Math.sin(a)*.72,8,'#553300')}};

/* ---------- HATS ---------- [id, name, price, builder(group, colour), default colour] ---------- */
const HATS=[
['none','None',0,null],
['cap','Cap',0,(g,c)=>g.add(legacyHat('cap',c))],
['beanie','Beanie',0,(g,c)=>g.add(legacyHat('beanie',c))],
['headphones','Headphones',80,(g,c)=>g.add(legacyHat('headphones',c))],
['tophat','Top hat',120,(g,c)=>g.add(legacyHat('tophat',c))],
['cone','Party hat',60,(g,c)=>g.add(legacyHat('cone',c))],
['horns','Horns',150,(g,c)=>{[-1,1].forEach(s=>arot(acy(g,0,.3,.95,c,s*.55,1.25,0,10,'#330000'),0,0,-s*.35))},'#d62828'],
['halo','Halo',200,(g,c)=>{const t=new THREE.Mesh(new THREE.TorusGeometry(.85,.09,8,28),new THREE.MeshBasicMaterial({color:c}));t.rotation.x=Math.PI/2;t.position.y=1.5;g.add(t)},'#ffe066'],
['crown','Gold crown',400,(g,c)=>crownN(g,c,5),'#ffcc33'],
['cowboy','Cowboy hat',90,(g,c)=>{acy(g,1.65,1.65,.1,c,0,.9,0,18);acy(g,.85,.95,.75,c,0,1.3,0,16);acy(g,.97,.97,.16,shade(c,-.35),0,1.02,0,16)},'#a86b3c'],
['wizard','Wizard hat',160,(g,c)=>{acy(g,1.45,1.45,.1,c,0,.9,0,16);arot(acy(g,0,.85,2.1,c,0,1.95,0,14),0,0,.08);acy(g,.9,.9,.14,'#ffd23f',0,1.0,0,14)},'#5b5bd6'],
['pirate','Pirate hat',180,(g,c)=>{abx(g,2.5,.32,1.5,c,0,.95,0);arot(abx(g,.5,.5,1.7,c,-1.15,.85,0),0,0,.5);arot(abx(g,.5,.5,1.7,c,1.15,.85,0),0,0,-.5);abx(g,.36,.36,.06,'#ffffff',0,.97,.78)},'#1f2430'],
['chef','Chef hat',70,(g,c)=>{acy(g,.95,.85,.5,c,0,1.05,0,16);asp(g,1.05,c,0,1.6,0)},'#ffffff'],
['knight','Knight helmet',220,(g,c)=>{adome(g,1.06,c,0,.55,0);abx(g,.16,.6,.1,shade(c,-.4),0,.75,1.02);abx(g,.16,.7,.16,'#ff4d5e',0,1.65,0)},'#aab4c0'],
['viking','Viking helmet',230,(g,c)=>{adome(g,1.06,c,0,.55,0);[-1,1].forEach(s=>arot(acy(g,.05,.2,.9,'#f3ecd8',s*1.05,.95,0,8),0,0,-s*.7))},'#8a8f99'],
['sombrero','Sombrero',110,(g,c)=>{acy(g,2.6,2.6,.1,c,0,.85,0,20);acy(g,.7,.9,.8,c,0,1.3,0,16);acy(g,.92,.92,.14,'#ffd23f',0,1.0,0,16)},'#e8c66a'],
['fez','Fez',90,(g,c)=>{acy(g,.72,.92,.75,c,0,1.15,0,14);asp(g,.12,'#ffd23f',.3,1.55,0);abx(g,.05,.5,.05,'#ffd23f',.3,1.3,0)},'#c0392b'],
['beret','Beret',80,(g,c)=>{acy(g,1.15,1.15,.34,c,.2,.98,0,16);acy(g,.08,.08,.2,c,.2,1.25,0,6)},'#c0392b'],
['bucket','Bucket hat',60,(g,c)=>{acy(g,1.0,1.1,.7,c,0,1.0,0,14);acy(g,1.5,1.5,.1,shade(c,-.15),0,.7,0,16)},'#7ed957'],
['straw','Straw hat',70,(g,c)=>{acy(g,1.7,1.7,.08,'#e8c66a',0,.85,0,18);acy(g,.9,.95,.5,'#e8c66a',0,1.1,0,16);acy(g,.97,.97,.14,c,0,.98,0,16)},'#ff4d5e'],
['headband','Headband',0,(g,c)=>{abx(g,1.92,.3,1.92,c,0,.5,0);abx(g,.3,.3,.3,c,-1.0,.55,-.2)},'#ff4d5e'],
['santa','Santa hat',120,(g,c)=>{acy(g,.95,.95,.35,'#ffffff',0,.95,0,14);arot(acy(g,0,.85,1.5,c,0,1.65,0,14),0,0,.25);asp(g,.22,'#ffffff',.55,2.3,0)},'#d62828'],
['witch','Witch hat',150,(g,c)=>{acy(g,1.5,1.5,.1,c,0,.9,0,16);arot(acy(g,0,.8,1.9,c,0,1.85,0,14),0,0,-.12);acy(g,.83,.83,.16,'#ffd23f',0,1.02,0,14)},'#1f2430'],
['tiara','Tiara',260,(g,c)=>{abx(g,1.8,.12,1.0,c,0,.9,.4);for(let i=-2;i<=2;i++)acy(g,0,.14,.5-Math.abs(i)*.08,c,i*.36,1.15-Math.abs(i)*.04,.86,6);asp(g,.12,'#ff5cae',0,1.15,.9)},'#ffd23f'],
['laurel','Laurel wreath',140,(g,c)=>{for(let i=0;i<14;i++){const a=i/14*Math.PI*2;if(Math.sin(a)>-.35)arot(abx(g,.32,.16,.2,c,Math.cos(a)*.98,.62,Math.sin(a)*.98),0,-a,0)}},'#1fc36b'],
['antlers','Antlers',170,(g,c)=>{[-1,1].forEach(s=>{arot(acy(g,.06,.09,1.3,c,s*.6,1.4,0,6),0,0,-s*.3);arot(acy(g,.05,.07,.6,c,s*.95,1.65,0,6),0,0,-s*.9);arot(acy(g,.05,.07,.5,c,s*.75,1.3,0,6),0,0,-s*.9)})},'#a86b3c'],
['cat','Cat ears',90,(g,c)=>{[-1,1].forEach(s=>{arot(acy(g,0,.42,.7,c,s*.6,1.2,0,4),0,Math.PI/4,0);arot(acy(g,0,.24,.5,'#ff9ec7',s*.6,1.17,.1,4),0,Math.PI/4,0)})},'#8a8f99'],
['bear','Bear ears',90,(g,c)=>{[-1,1].forEach(s=>{asp(g,.42,c,s*.68,1.05,0);asp(g,.22,shade(c,.3),s*.68,1.05,.25)})},'#8a5a3a'],
['bunny','Bunny ears',120,(g,c)=>{[-1,1].forEach(s=>{arot(abx(g,.42,1.7,.14,c,s*.45,1.7,0),0,0,-s*.12);arot(abx(g,.24,1.4,.16,'#ff9ec7',s*.45,1.7,.02),0,0,-s*.12)})},'#ffffff'],
['wolf','Wolf ears',110,(g,c)=>{[-1,1].forEach(s=>{arot(acy(g,0,.4,1.0,c,s*.62,1.35,0,4),0,Math.PI/4,-s*.12)})},'#5b6470'],
['propeller','Propeller cap',100,(g,c)=>{g.add(legacyHat('beanie',c));acy(g,.05,.05,.35,'#ddd',0,1.85,0,6);abx(g,1.7,.06,.3,'#ff4d5e',0,2.05,0);abx(g,.3,.06,1.7,'#3b8bff',0,2.05,0)},'#ffd23f'],
['flowers','Flower crown',130,(g,c)=>{for(let i=0;i<10;i++){const a=i/10*Math.PI*2;asp(g,.2,i%2?c:'#ffd23f',Math.cos(a)*.98,.72,Math.sin(a)*.98);asp(g,.13,'#1fc36b',Math.cos(a+.3)*.98,.68,Math.sin(a+.3)*.98)}},'#ff5cae'],
['mushroom','Mushroom cap',140,(g,c)=>{adome(g,1.2,c,0,.7,0);[[.5,1.2,.4],[-.5,1.1,.5],[.1,1.65,.0],[-.6,1.0,-.4]].forEach(p=>asp(g,.16,'#ffffff',p[0],p[1],p[2]))},'#d62828'],
['pineapple','Pineapple',120,(g,c)=>{acy(g,.65,.75,1.1,c,0,1.25,0,10);[-.3,0,.3].forEach((x,i)=>arot(abx(g,.16,.9,.06,'#1fc36b',x,2.1,0),0,i,x))},'#ffd23f'],
['trafficcone','Traffic cone',60,(g,c)=>{acy(g,.12,.75,1.5,c,0,1.55,0,12);acy(g,.36,.5,.28,'#ffffff',0,1.6,0,12);abx(g,1.4,.1,1.4,shade(c,-.2),0,.85,0)},'#ff7a1a'],
['astronaut','Space helmet',260,(g,c)=>{const m=asp(g,1.5,c,0,.1,0);m.material.transparent=true;m.material.opacity=.32;abx(g,.3,.2,.3,'#ff4d5e',0,1.4,.0);acy(g,.5,.5,.2,'#c8ced6',0,-.9,0,12)},'#8fd3ff'],
['bowler','Bowler hat',100,(g,c)=>{adome(g,1.05,c,0,.7,0);acy(g,1.25,1.25,.1,c,0,.7,0,16);acy(g,1.07,1.07,.14,'#ff4d5e',0,.84,0,14)},'#2b2f3a'],
['graduate','Graduation cap',150,(g,c)=>{abx(g,2.3,.14,2.3,c,0,1.1,0);acy(g,.75,.85,.4,c,0,.85,0,12);abx(g,.06,.8,.06,'#ffd23f',1.0,.7,1.0);asp(g,.14,'#ffd23f',1.0,.3,1.0)},'#1f2430'],
['police','Police cap',130,(g,c)=>{acy(g,1.1,1.1,.6,c,0,1.0,0,16);abx(g,1.6,.1,1.0,'#111',0,.72,.95);abx(g,.36,.36,.08,'#ffd23f',0,1.05,.98)},'#2b3a67'],
['flag','Flag topper',60,(g,c)=>{acy(g,.05,.05,1.5,'#ddd',0,1.55,0,6);abx(g,.9,.55,.06,c,.47,2.05,0)},'#ff4d5e'],
['antennae','Alien antennae',90,(g,c)=>{[-1,1].forEach(s=>{arot(acy(g,.04,.05,1.0,'#7ed957',s*.4,1.3,0,6),0,0,-s*.25);asp(g,.16,c,s*.55,1.85,0,'#113311')})},'#39f0ff'],
['imp','Little horns',70,(g,c)=>{[-1,1].forEach(s=>arot(acy(g,0,.16,.55,c,s*.45,1.05,0,8),0,0,-s*.2))},'#d62828'],
['unicorn','Unicorn horn',200,(g,c)=>{arot(acy(g,0,.22,1.3,c,0,1.5,.2,10),.15,0,0);[0,1,2].forEach(i=>acy(g,.24-i*.05,.24-i*.05,.06,['#ff5cae','#ffd23f','#22c3c3'][i],0,1.1+i*.3,.2-i*.03,10))},'#ffffff'],
['ninja','Ninja band',90,(g,c)=>{abx(g,1.92,.34,1.92,c,0,.52,0);abx(g,.8,.3,.06,'#c8ced6',0,.52,.98);abx(g,.3,.6,.1,c,-.9,.2,-1.0)},'#1f2430'],
['pizza','Pizza slice',110,(g,c)=>{acy(g,1.0,1.0,.2,'#f2c14e',0,.95,0,10);[[.3,.3],[-.4,.1],[.1,-.5],[-.2,.6]].forEach(p=>acy(g,.16,.16,.06,c,p[0],1.08,p[1],8))},'#d62828'],
['duck','Rubber duck',130,(g,c)=>{asp(g,.62,c,0,1.15,0);asp(g,.38,c,0,1.7,.15);abx(g,.36,.14,.28,'#ff8a3d',0,1.66,.5);asp(g,.06,'#111',.16,1.78,.42);asp(g,.06,'#111',-.16,1.78,.42)},'#ffd23f'],
['pumpkin','Pumpkin',110,(g,c)=>{asp(g,.85,c,0,1.15,0);abx(g,.16,.4,.16,'#1fc36b',0,1.95,0)},'#ff8a3d'],
['cactus','Cactus',120,(g,c)=>{acy(g,.3,.3,1.4,c,0,1.4,0,8);arot(acy(g,.16,.16,.7,c,.45,1.5,0,8),0,0,1.2);acy(g,.16,.16,.5,c,.72,1.72,0,8);arot(acy(g,.16,.16,.7,c,-.45,1.3,0,8),0,0,-1.2);acy(g,.16,.16,.5,c,-.72,1.52,0,8)},'#1fc36b'],
['sprout','Sprout',50,(g,c)=>{acy(g,.05,.06,.7,'#1fc36b',0,1.2,0,6);arot(abx(g,.5,.08,.24,c,.28,1.6,0),0,0,.5);arot(abx(g,.5,.08,.24,c,-.28,1.6,0),0,0,-.5)},'#7ed957'],
['punk','Punk spikes',120,(g,c)=>{for(let i=-3;i<=3;i++)acy(g,0,.18,.9-Math.abs(i)*.09,c,0,1.15,i*.24,6)},'#ff5cae'],
['halo2','Double halo',260,(g,c)=>{[1.4,1.75].forEach(y=>{const t=new THREE.Mesh(new THREE.TorusGeometry(.8,.07,8,26),new THREE.MeshBasicMaterial({color:c}));t.rotation.x=Math.PI/2;t.position.y=y;g.add(t)})},'#ffe066'],
['star','Star topper',90,(g,c)=>{for(let i=0;i<5;i++){arot(abx(g,.28,.9,.14,c,0,1.75,0),0,0,i*Math.PI*2/5)}asp(g,.22,c,0,1.75,0)},'#ffd23f'],
['fedora','Fedora',100,(g,c)=>{acy(g,1.4,1.4,.1,c,0,.85,0,16);acy(g,.85,.95,.6,c,0,1.2,0,14);acy(g,.97,.97,.16,shade(c,-.4),0,1.02,0,14)},'#8a5a3a'],
['hardhat','Hard hat',80,(g,c)=>{adome(g,1.05,c,0,.6,0);abx(g,.3,.1,1.6,shade(c,-.2),0,1.65,0);abx(g,1.9,.1,1.3,c,0,.6,.55)},'#ffd23f'],
['tinfoil','Tin foil hat',60,(g,c)=>{arot(acy(g,0,.95,1.6,c,0,1.45,0,5),0,.3,0)},'#c8ced6'],
['snorkel','Goggles',90,(g,c)=>{abx(g,1.95,.16,1.95,'#1f2430',0,.6,0);ato(g,.38,.08,c,-.42,.72,.9);ato(g,.38,.08,c,.42,.72,.9)},'#22c3c3'],
['leaf','Leaf crown',70,(g,c)=>{for(let i=0;i<8;i++){const a=i/8*Math.PI*2;arot(abx(g,.5,.08,.28,c,Math.cos(a)*.95,.8,Math.sin(a)*.95),0,-a,.5)}},'#1fc36b'],
['cloud','Little cloud',140,(g,c)=>{[[0,1.6,0,.45],[.4,1.5,0,.34],[-.4,1.5,0,.34],[0,1.45,.3,.3]].forEach(p=>asp(g,p[3],c,p[0],p[1],p[2]))},'#ffffff'],
['flame','Flame',150,(g,c)=>{[[0,1.35,.5],[.25,1.2,.3],[-.25,1.15,.3]].forEach((p,i)=>arot(acy(g,0,.3,p[2]*2.2,['#ff4d1a','#ff9a1a','#ffd23f'][i],p[0],p[1]+.3,0,6,'#552200'),0,0,i*.1))},'#ff4d1a'],
];
for(const n of [3,4,6,7,8,9])HATS.push(['crown'+n,'Crown '+n,150+n*15,(g,c)=>crownN(g,c,n),'#ffcc33']);
HATS.push(['cone2','Tiny party hat',40,(g,c)=>{acy(g,0,.55,1.1,c,0,1.4,0,12);asp(g,.12,'#fff',0,2.0,0)}],['cone3','Tall party hat',80,(g,c)=>{acy(g,0,.7,2.6,c,0,2.1,0,12);asp(g,.16,'#fff',0,3.45,0)}]);

/* ---------- HAIR ---------- */
const hairBase=(g,c,h)=>{abx(g,1.86,h||.5,1.86,c,0,.88,0);abx(g,1.86,1.0,.3,c,0,.3,-.78)};
const HAIRS=[
['none','None',0,null],
['short','Short cut',0,(g,c)=>hairBase(g,c)],
['buzz','Buzz cut',0,(g,c)=>abx(g,1.78,.22,1.78,c,0,.9,0)],
['spiky','Spiky',20,(g,c)=>{hairBase(g,c,.4);for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)acy(g,0,.28,.7,c,x*.55,1.3,z*.55,5)}],
['mohawk','Mohawk',30,(g,c)=>{abx(g,.34,.9,1.7,c,0,1.15,0);abx(g,.34,.5,1.2,c,0,1.75,0)}],
['afro','Afro',40,(g,c)=>{asp(g,1.45,c,0,.6,-.05)}],
['bun','Bun',10,(g,c)=>{hairBase(g,c);asp(g,.5,c,0,1.4,-.2)}],
['topknot','Top knot',20,(g,c)=>{hairBase(g,c);acy(g,.15,.2,.4,c,0,1.3,0,8);asp(g,.42,c,0,1.7,0)}],
['ponytail','Ponytail',10,(g,c)=>{hairBase(g,c);abx(g,.36,1.7,.36,c,0,-.2,-1.2);abx(g,.42,.2,.42,'#ff4d5e',0,.6,-1.05)}],
['pigtails','Pigtails',20,(g,c)=>{hairBase(g,c);[-1,1].forEach(s=>{abx(g,.4,1.3,.4,c,s*1.2,.1,-.3);abx(g,.46,.16,.46,'#ff5cae',s*1.15,.75,-.3)})}],
['long','Long hair',30,(g,c)=>{hairBase(g,c);abx(g,1.95,2.3,.28,c,0,-.4,-.85);[-1,1].forEach(s=>abx(g,.22,2.0,1.0,c,s*.98,-.25,-.3))}],
['bob','Bob',30,(g,c)=>{hairBase(g,c,.55);abx(g,2.0,1.2,.3,c,0,.2,-.85);[-1,1].forEach(s=>abx(g,.22,1.2,1.3,c,s*.98,.15,-.2))}],
['curly','Curly',40,(g,c)=>{for(let i=0;i<16;i++){const a=i/16*Math.PI*2,r=.75+(i%2)*.1;asp(g,.32,c,Math.cos(a)*r,.95+(i%3)*.08,Math.sin(a)*r)}asp(g,.55,c,0,1.15,0)}],
['messy','Messy',20,(g,c)=>{hairBase(g,c);[[.5,.4,.3],[-.6,.45,.2],[.1,.5,-.5],[-.2,.55,.5],[.7,.3,-.3]].forEach((p,i)=>arot(abx(g,.5,.5,.5,c,p[0],1.15+p[1]*.3,p[2]),i,i*2,i))}],
['sidepart','Side part',10,(g,c)=>{hairBase(g,c);abx(g,1.1,.3,.3,c,.4,.7,.9);arot(abx(g,.9,.14,.3,shade(c,-.3),-.2,1.15,.7),0,0,.15)}],
['braid','Braid',20,(g,c)=>{hairBase(g,c);for(let i=0;i<5;i++)asp(g,.26-i*.02,c,i%2?.1:-.1,.5-i*.42,-1.05)}],
['bangs','Bangs',10,(g,c)=>{hairBase(g,c);abx(g,1.7,.42,.2,c,0,.62,.9)}],
['undercut','Undercut',30,(g,c)=>{abx(g,1.9,.42,1.9,c,0,.98,0);abx(g,1.9,.14,1.9,shade(c,-.2),0,.6,-.1)}],
['wavy','Wavy',30,(g,c)=>{hairBase(g,c);for(let i=0;i<6;i++)abx(g,.5,.3,.32,c,-1.0+i*.4,1.12,.6+(i%2)*.1)}],
['twinbuns','Twin buns',30,(g,c)=>{hairBase(g,c);[-1,1].forEach(s=>asp(g,.42,c,s*.7,1.4,-.1))}],
['mullet','Mullet',30,(g,c)=>{hairBase(g,c,.42);abx(g,1.7,1.6,.3,c,0,-.4,-.85)}],
['pompadour','Pompadour',40,(g,c)=>{hairBase(g,c);arot(abx(g,1.5,.7,.8,c,0,1.4,.55),-.3,0,0)}],
['dreads','Dreadlocks',50,(g,c)=>{hairBase(g,c,.45);for(let i=-3;i<=3;i++)acy(g,.11,.11,1.5+(i%2)*.4,c,i*.28,.05,-.9,6)}],
['flattop','Flat top',20,(g,c)=>{abx(g,1.86,.8,1.86,c,0,1.1,0);abx(g,1.86,.5,.3,c,0,.5,-.78)}],
['bowl','Bowl cut',10,(g,c)=>{adome(g,1.02,c,0,.55,-.02);abx(g,1.9,.4,1.9,c,0,.6,-.02)}],
['wild','Wild',40,(g,c)=>{for(let i=0;i<14;i++){const a=i/14*Math.PI*2;arot(acy(g,0,.22,.9,c,Math.cos(a)*.7,1.1,Math.sin(a)*.7,5),Math.sin(a)*.6,0,-Math.cos(a)*.6)}}],
['vikingbraids','Braids',40,(g,c)=>{hairBase(g,c);[-1,1].forEach(s=>{for(let i=0;i<4;i++)asp(g,.24,c,s*1.05,.3-i*.4,.2)})}],
['emo','Emo fringe',30,(g,c)=>{hairBase(g,c);arot(abx(g,1.5,.9,.2,c,.3,.35,.9),0,0,-.25)}],
['cone','Cone hair',60,(g,c)=>{acy(g,0,.9,1.6,c,0,1.6,0,12)}],
['ringlets','Ringlets',40,(g,c)=>{hairBase(g,c);[-1,1].forEach(s=>{for(let i=0;i<4;i++)ato(g,.24,.09,c,s*1.0,.4-i*.42,.1)})}],
];
HAIRS.forEach(h=>{if(h[0]!=='none')h[4]='#3a2a1a'});

/* ---------- FACE GEAR (glasses, moustaches, masks...) ---------- */
const ACCS=[
['none','None',0,null],
['glasses','Round glasses',0,(g,c)=>{[-1,1].forEach(s=>ato(g,.27,.045,c,s*.34,EYE_Y,FZ));abx(g,.16,.05,.05,c,0,EYE_Y,FZ);[-1,1].forEach(s=>abx(g,.05,.05,.85,c,s*.87,EYE_Y,.45))},'#1f2430'],
['squareglass','Square glasses',0,(g,c)=>{[-1,1].forEach(s=>{const x=s*.34;abx(g,.66,.05,.05,c,x,EYE_Y+.25,FZ);abx(g,.66,.05,.05,c,x,EYE_Y-.25,FZ);abx(g,.05,.5,.05,c,x-.33,EYE_Y,FZ);abx(g,.05,.5,.05,c,x+.33,EYE_Y,FZ);abx(g,.05,.05,.85,c,s*.87,EYE_Y,.45)});abx(g,.12,.05,.05,c,0,EYE_Y+.2,FZ)},'#ff4d5e'],
['shades','Sunglasses',30,(g,c)=>{abx(g,1.55,.34,.08,c,0,EYE_Y,FZ);abx(g,.16,.06,.06,c,0,EYE_Y+.1,FZ);abx(g,.36,.06,.09,'#ffffff',-.45,EYE_Y+.08,FZ+.01)},'#111111'],
['monocle','Monocle',60,(g,c)=>{ato(g,.3,.05,c,.34,EYE_Y,FZ);abx(g,.03,.9,.03,c,.62,-.3,FZ)},'#ffd23f'],
['eyepatch','Eye patch',30,(g,c)=>{abx(g,.6,.5,.06,c,.34,EYE_Y,FZ);abx(g,1.9,.06,.06,c,0,EYE_Y+.25,FZ-.02)},'#111111'],
['mustache','Moustache',20,(g,c)=>{abx(g,.8,.16,.08,c,0,-.1,FZ);abx(g,.3,.14,.08,c,-.5,-.18,FZ);abx(g,.3,.14,.08,c,.5,-.18,FZ)},'#3a2a1a'],
['handlebar','Handlebar moustache',40,(g,c)=>{abx(g,.7,.16,.08,c,0,-.1,FZ);[-1,1].forEach(s=>{abx(g,.4,.12,.08,c,s*.55,-.16,FZ);asp(g,.12,c,s*.82,-.02,FZ)})},'#3a2a1a'],
['walrus','Walrus moustache',50,(g,c)=>{abx(g,1.1,.36,.12,c,0,-.18,FZ);abx(g,.16,.4,.1,c,-.5,-.4,FZ);abx(g,.16,.4,.1,c,.5,-.4,FZ)},'#8a5a3a'],
['beard','Beard',60,(g,c)=>{abx(g,1.7,.55,.16,c,0,-.55,.8);abx(g,.2,.9,1.0,c,-.85,-.3,.1);abx(g,.2,.9,1.0,c,.85,-.3,.1);abx(g,1.0,.2,.1,c,0,-.1,FZ)},'#3a2a1a'],
['goatee','Goatee',40,(g,c)=>{abx(g,.34,.5,.14,c,0,-.55,FZ-.03);abx(g,.6,.12,.08,c,0,-.12,FZ)},'#3a2a1a'],
['fullbeard','Full beard',90,(g,c)=>{abx(g,1.78,.9,.2,c,0,-.5,.78);abx(g,.2,1.1,1.5,c,-.86,-.2,-.1);abx(g,.2,1.1,1.5,c,.86,-.2,-.1);abx(g,1.1,.24,.1,c,0,-.1,FZ);abx(g,.5,.4,.3,c,0,-.95,.7)},'#5b3a1a'],
['bandana','Bandana mask',40,(g,c)=>{abx(g,1.78,.75,.14,c,0,-.4,.82);abx(g,1.8,.14,1.8,c,0,-.05,-.02);abx(g,.36,.5,.12,c,-.9,-.6,-.9)},'#d62828'],
['surgical','Face mask',30,(g,c)=>{abx(g,1.6,.68,.1,c,0,-.38,.84);[-1,1].forEach(s=>abx(g,.05,.05,.7,'#e6f0ff',s*.83,-.2,.5))},'#e6f0ff'],
['zorro','Hero mask',70,(g,c)=>{abx(g,1.76,.14,.1,c,0,EYE_Y+.32,.85);abx(g,1.76,.14,.1,c,0,EYE_Y-.28,.85);abx(g,.16,.7,.1,c,0,EYE_Y,.85);abx(g,.14,.7,.1,c,-.85,EYE_Y,.8);abx(g,.14,.7,.1,c,.85,EYE_Y,.8)},'#ff4d5e'],
['clownnose','Clown nose',20,(g,c)=>{asp(g,.2,c,0,-.02,FZ+.08)},'#ff2d2d'],
['bunnyteeth','Bunny teeth',30,(g,c)=>{abx(g,.16,.24,.05,c,-.08,-.36,FZ);abx(g,.16,.24,.05,c,.08,-.36,FZ)},'#ffffff'],
['fangs','Fangs',40,(g,c)=>{[-1,1].forEach(s=>arot(acy(g,0,.07,.28,c,s*.24,-.34,FZ,5),Math.PI,0,0))},'#ffffff'],
['tear','Tear drop',20,(g,c)=>{asp(g,.1,c,-.34,-.1,FZ);abx(g,.08,.2,.05,c,-.34,.05,FZ)},'#5bc8ff'],
['bandaid','Bandage',20,(g,c)=>{arot(abx(g,.44,.15,.05,c,.42,-.08,FZ),0,0,.5)},'#f0c9a0'],
['earring','Earrings',30,(g,c)=>{[-1,1].forEach(s=>{asp(g,.11,c,s*.88,-.08,0);abx(g,.03,.3,.03,c,s*.88,-.28,0)})},'#ffd23f'],
['nosering','Nose ring',30,(g,c)=>{ato(g,.09,.025,c,0,-.1,FZ+.03)},'#c8ced6'],
['pipe','Pipe',50,(g,c)=>{arot(acy(g,.06,.06,.5,c,.4,-.32,.95,6),1.4,0,0);acy(g,.14,.12,.24,c,.4,-.2,1.25,8);abx(g,.05,.05,.3,'#ddd',.4,-.05,1.3)},'#8a5a3a'],
['headset','Headset mic',50,(g,c)=>{ato(g,.88,.06,c,0,.2,0).rotation.x=Math.PI/2;arot(abx(g,.06,.06,.9,c,.9,-.15,.5),0,.5,0);asp(g,.1,c,.62,-.3,.98)},'#1f2430'],
['scarf','Scarf',60,(g,c)=>{abx(g,2.1,.45,1.3,c,0,-.78,0);abx(g,.4,1.2,.14,c,.5,-1.4,.6)},'#d62828'],
['starsticker','Star sticker',10,(g,c)=>{for(let i=0;i<5;i++)arot(abx(g,.1,.34,.04,c,-.5,-.15,FZ),0,0,i*Math.PI*2/5)},'#ffd23f'],
['stubble','Stubble',20,(g,c)=>{for(let i=0;i<10;i++)abx(g,.06,.06,.03,c,-.5+i*.11,-.4-((i*7)%3)*.1,FZ)},'#3a2a1a'],
['blushpad','Rosy cheeks',10,(g,c)=>{[-1,1].forEach(s=>asp(g,.18,c,s*.55,-.02,.82))},'#ff9ec7'],
];
ACCS.forEach(a=>{if(a[0]!=='none'&&!a[4])a[4]='#1f2430'});

/* ---------- BACK ITEMS (root space: shoulders are around y 3.9, the back is at z -.5) ---------- */
const bkWings=(g,U,cols,lens,step,h)=>{U.wings=[];[-1,1].forEach(s=>{const piv=new THREE.Group();piv.position.set(s*.5,3.7,-.65);g.add(piv);lens.forEach((len,k)=>abx(piv,len,h||.42,.1,cols[k%cols.length],s*(len/2+.1),.9-k*step,0));piv.rotation.y=s*.5;U.wings.push({piv,s})})};
const BACKS=[
['none','None',0,null],
['backpack','Backpack',60,(g,c,U)=>g.add(legacyBack('backpack',c,U))],
['cape','Cape',100,(g,c,U)=>g.add(legacyBack('cape',c,U))],
['wings','Feathered wings',300,(g,c,U)=>g.add(legacyBack('wings',c,U))],
['jetpack','Jetpack',350,(g,c,U)=>g.add(legacyBack('jetpack',c,U))],
['angel','Angel wings',260,(g,c,U)=>bkWings(g,U,[c,shade(c,-.06)],[1.8,1.5,1.1],.5,.4),'#ffffff'],
['bat','Bat wings',240,(g,c,U)=>bkWings(g,U,[c,shade(c,-.2)],[2.4,2.0,1.4],.6,.34),'#3a2a4a'],
['butterfly','Butterfly wings',280,(g,c,U)=>bkWings(g,U,[c,'#ffd23f','#22c3c3'],[2.4,2.0,1.6],.66,.6),'#ff5cae'],
['dragon','Dragon wings',320,(g,c,U)=>bkWings(g,U,[c,shade(c,.15),shade(c,-.2)],[2.8,2.2,1.6],.6,.36),'#1fc36b'],
['fairy','Fairy wings',220,(g,c,U)=>{bkWings(g,U,[c],[1.6,1.2],.7,.7);U.wings.forEach(w=>w.piv.children.forEach(m=>{m.material.transparent=true;m.material.opacity=.7}))},'#8fd3ff'],
['guitar','Guitar',150,(g,c)=>{arot(acy(g,.5,.5,.24,c,0,2.9,-.9,14),Math.PI/2,0,0);arot(acy(g,.36,.36,.24,c,0,3.6,-.9,14),Math.PI/2,0,0);abx(g,.18,1.9,.14,'#8a5a3a',0,4.7,-.9);abx(g,.3,.4,.14,'#3a2a1a',0,5.75,-.9)},'#d62828'],
['sword','Sword',130,(g,c)=>{arot(abx(g,.16,3.4,.1,'#c8ced6',0,3.4,-.7),0,0,.6);arot(abx(g,.7,.14,.14,c,-.55,2.55,-.7),0,0,.6);arot(abx(g,.14,.7,.14,'#3a2a1a',-.9,2.1,-.7),0,0,.6)},'#ffd23f'],
['shield','Shield',110,(g,c)=>{abx(g,1.6,1.9,.16,c,0,3.1,-.75);abx(g,.6,.6,.2,'#ffd23f',0,3.2,-.85);abx(g,1.2,.6,.16,c,0,1.95,-.75)},'#3b8bff'],
['quiver','Quiver',100,(g,c)=>{arot(acy(g,.36,.3,1.7,c,-.3,3.3,-.85,10),0,0,.25);for(let i=0;i<3;i++)arot(abx(g,.06,1.2,.06,'#ddd',-.55+i*.16,4.5,-.85),0,0,.25)},'#8a5a3a'],
['balloon','Balloon',90,(g,c)=>{abx(g,.03,3.0,.03,'#ddd',.6,5.0,-.8);asp(g,.9,c,.6,6.9,-.8)},'#ff4d5e'],
['shell','Turtle shell',140,(g,c)=>{adome(g,1.4,c,0,2.5,-1.05).rotation.x=Math.PI/2;[[-.4,2.9],[.4,2.9],[0,3.6],[0,2.2]].forEach(p=>abx(g,.5,.5,.1,shade(c,.2),p[0],p[1],-1.55))},'#7ed957'],
['cattail','Cat tail',100,(g,c,U)=>{const piv=new THREE.Group();piv.position.set(0,2.2,-.5);g.add(piv);for(let i=0;i<5;i++)asp(piv,.22,c,0,i*.42,-.3-i*.15);U.tail=piv},'#8a8f99'],
['foxtail','Fox tail',140,(g,c,U)=>{const piv=new THREE.Group();piv.position.set(0,2.2,-.5);g.add(piv);[.3,.42,.5,.42].forEach((r,i)=>asp(piv,r,i===3?'#ffffff':c,0,i*.45+.1,-.5-i*.2));U.tail=piv},'#ff8a3d'],
['devil','Devil tail',110,(g,c,U)=>{const piv=new THREE.Group();piv.position.set(0,2.2,-.5);g.add(piv);for(let i=0;i<4;i++)abx(piv,.14,.5,.14,c,0,i*.42,-.3-i*.2);arot(acy(g,0,.3,.4,c,0,2.2+1.9,-1.2,4),.4,0,0);U.tail=piv},'#d62828'],
['dino','Dino tail',150,(g,c,U)=>{const piv=new THREE.Group();piv.position.set(0,2.2,-.5);g.add(piv);for(let i=0;i<4;i++){abx(piv,.6-i*.1,.5,.6-i*.1,c,0,i*.45,-.3-i*.22);acy(piv,0,.16,.36,shade(c,.2),0,i*.45+.4,-.3-i*.22,4)}U.tail=piv},'#7ed957'],
['surfboard','Surfboard',120,(g,c)=>{arot(abx(g,.9,3.6,.12,c,0,3.2,-.75),0,0,.15);arot(abx(g,.16,3.0,.13,'#ffffff',0,3.2,-.76),0,0,.15)},'#22c3c3'],
['banner','Banner',0,(g,c)=>{abx(g,.06,3.6,.06,'#ddd',0,4.0,-.8);abx(g,1.4,1.0,.05,c,.7,5.3,-.8)},'#a45cff'],
['lantern','Lantern',90,(g,c)=>{abx(g,.05,2.4,.05,'#8a5a3a',.6,4.2,-.8);acy(g,.34,.34,.6,c,.6,5.6,-.8,8,'#553300')},'#ffd23f'],
['cloak','Short cloak',0,(g,c,U)=>{const piv=new THREE.Group();piv.position.set(0,3.95,-.58);g.add(piv);abx(piv,2.2,1.5,.1,c,0,-.75,-.05);U.cape=piv},'#5b5bd6'],
['bow','Big bow',0,(g,c)=>{abx(g,.4,.4,.2,c,0,3.4,-.7);[-1,1].forEach(s=>arot(abx(g,.9,.6,.14,c,s*.6,3.4,-.7),0,0,s*.2))},'#ff5cae'],
['rocketpack','Rocket',160,(g,c)=>{acy(g,.4,.4,1.9,c,0,3.3,-.9,12);acy(g,0,.4,.7,'#ff4d5e',0,4.6,-.9,12);[-.4,.4].forEach(x=>arot(abx(g,.12,.9,.5,'#ff4d5e',x,2.6,-.9),0,0,0))},'#ffffff'],
];
BACKS.forEach(b=>{if(b[0]!=='none'&&!b[4]&&!['backpack','cape','wings','jetpack'].includes(b[0]))b[4]='#5b5bd6'});

/* ---------- SHOES (built on the leg: y 0 is the top of the leg, the foot is at y -2) ---------- */
const shoeFoot=(g,fn)=>fn(g);
const SHOES=[
['none','Bare feet',0,null],
['sneakers','Sneakers',0,(g,c)=>{abx(g,1.06,.44,1.35,c,0,-1.78,.18);abx(g,1.1,.14,1.4,'#ffffff',0,-1.98,.18);abx(g,.6,.1,.1,'#ffffff',0,-1.6,.5)},'#ff4d5e'],
['boots','Boots',40,(g,c)=>{abx(g,1.06,1.1,1.06,c,0,-1.45,0);abx(g,1.1,.3,1.35,shade(c,-.3),0,-1.9,.15)},'#8a5a3a'],
['hightops','High tops',40,(g,c)=>{abx(g,1.04,.9,1.06,c,0,-1.55,0);abx(g,1.1,.14,1.4,'#ffffff',0,-1.98,.15);abx(g,1.06,.2,1.1,'#ffffff',0,-1.2,0)},'#3b8bff'],
['sandals','Sandals',20,(g,c)=>{abx(g,1.0,.1,1.3,c,0,-1.95,.15);abx(g,.9,.1,.16,c,0,-1.8,.2);abx(g,.9,.1,.16,c,0,-1.7,-.2)},'#8a5a3a'],
['cleats','Cleats',60,(g,c)=>{abx(g,1.06,.44,1.35,c,0,-1.78,.18);[[-.3,.6],[.3,.6],[-.3,-.2],[.3,-.2]].forEach(p=>acy(g,.08,.1,.16,'#ddd',p[0],-2.05,p[1],6))},'#22c3c3'],
['skates','Roller skates',90,(g,c)=>{abx(g,1.06,.6,1.3,c,0,-1.7,.1);[[-.35,.6],[.35,.6],[-.35,-.3],[.35,-.3]].forEach(p=>{const w=acy(g,.22,.22,.12,'#ffd23f',p[0],-2.0,p[1],10);w.rotation.z=Math.PI/2})},'#ff5cae'],
['slippers','Fuzzy slippers',30,(g,c)=>{abx(g,1.1,.5,1.4,c,0,-1.75,.2);asp(g,.34,shade(c,.15),0,-1.55,.7)},'#ff9ec7'],
['flippers','Flippers',60,(g,c)=>{abx(g,1.0,.2,1.9,c,0,-1.92,.55);abx(g,1.4,.14,.9,c,0,-1.95,1.4)},'#22c3c3'],
['platform','Platform shoes',80,(g,c)=>{abx(g,1.06,.9,1.35,c,0,-1.55,.18);abx(g,1.1,.28,1.4,'#ffffff',0,-1.9,.18)},'#a45cff'],
['wraps','Ankle wraps',10,(g,c)=>{abx(g,1.05,.5,1.05,c,0,-1.75,0)},'#ffffff'],
['wellies','Wellies',30,(g,c)=>{abx(g,1.06,1.2,1.06,c,0,-1.4,0);abx(g,1.1,.2,1.35,shade(c,-.3),0,-1.95,.15)},'#ffd23f'],
['spikes','Spiky boots',110,(g,c)=>{abx(g,1.06,.9,1.06,c,0,-1.55,0);[[-.3,-.3],[.3,-.3],[0,.2]].forEach(p=>acy(g,0,.14,.4,'#ddd',p[0],-1.2,p[1]+.6,5))},'#1f2430'],
];
SHOES.forEach(s=>{if(s[0]!=='none'&&!s[4])s[4]='#ffffff'});

/* ---------- PATTERNS for shirts and pants: [id, name, price, draw(ctx, colour), default colour] ---------- */
const hrt=(g,x,y,s)=>{g.beginPath();g.moveTo(x,y+s*.4);g.bezierCurveTo(x-s*.8,y-s*.3,x-s*.3,y-s*.8,x,y-s*.3);g.bezierCurveTo(x+s*.3,y-s*.8,x+s*.8,y-s*.3,x,y+s*.4);g.fill()};
const PATS=[
['none','Plain',0,null],
['stripes','Stripes',0,(g,c)=>{g.fillStyle=c;for(let y=12;y<128;y+=32)g.fillRect(0,y,128,14)},'rgba(255,255,255,.55)'],
['vstripes','Pinstripes',0,(g,c)=>{g.fillStyle=c;for(let x=8;x<128;x+=20)g.fillRect(x,0,8,128)},'rgba(255,255,255,.5)'],
['diag','Diagonal stripes',10,(g,c)=>{g.fillStyle=c;for(let i=-128;i<256;i+=32){g.beginPath();g.moveTo(i,0);g.lineTo(i+14,0);g.lineTo(i+142,128);g.lineTo(i+128,128);g.fill()}},'rgba(255,255,255,.5)'],
['checker','Checker',50,(g,c)=>{g.fillStyle=c;for(let y=0;y<8;y++)for(let x=0;x<8;x++)if((x+y)%2)g.fillRect(x*16,y*16,16,16)},'rgba(255,255,255,.42)'],
['dots','Dots',20,(g,c)=>{g.fillStyle=c;for(let y=16;y<128;y+=32)for(let x=(y/32%2)?32:16;x<128;x+=32){g.beginPath();g.arc(x,y,7,0,7);g.fill()}},'rgba(255,255,255,.6)'],
['star','Star',30,(g,c)=>{g.fillStyle=c;starPath(g,64,66,40,17,5);g.fill()},'#ffe066'],
['bolt','Bolt',30,(g,c)=>{g.fillStyle=c;g.beginPath();g.moveTo(76,8);g.lineTo(36,72);g.lineTo(62,72);g.lineTo(48,120);g.lineTo(94,52);g.lineTo(68,52);g.closePath();g.fill()},'#ffe066'],
['heart','Heart',30,(g,c)=>{g.fillStyle=c;g.beginPath();g.moveTo(64,104);g.bezierCurveTo(6,62,30,16,64,46);g.bezierCurveTo(98,16,122,62,64,104);g.fill()},'#ff4d6d'],
['zigzag','Zigzag',30,(g,c)=>{g.strokeStyle=c;g.lineWidth=8;for(let y=20;y<128;y+=36){g.beginPath();g.moveTo(0,y);for(let x=0;x<=128;x+=16)g.lineTo(x,y+(x/16%2?14:0));g.stroke()}},'rgba(255,255,255,.7)'],
['plaid','Plaid',40,(g,c)=>{g.fillStyle=c;for(let i=10;i<128;i+=36){g.fillRect(i,0,12,128);g.fillRect(0,i,128,12)}},'rgba(255,255,255,.32)'],
['camo','Camo',40,(g,c)=>{const sh=[shade(c,-.3),shade(c,.25),shade(c,-.55)];for(let i=0;i<26;i++){g.fillStyle=sh[i%3];g.beginPath();g.ellipse((i*47)%128,(i*71)%128,14+(i*5)%12,9+(i*3)%9,i,0,7);g.fill()}},'#6b7a3a'],
['tiedye','Tie-dye',50,(g,c)=>{for(let r=70;r>8;r-=12){g.fillStyle=`hsl(${(r*9)%360},85%,${55+(r%3)*6}%)`;g.beginPath();g.arc(64,64,r,0,7);g.fill()}},'#ffffff'],
['gradient','Gradient',30,(g,c)=>{const gr=g.createLinearGradient(0,0,0,128);gr.addColorStop(0,'rgba(255,255,255,0)');gr.addColorStop(1,c);g.fillStyle=gr;g.fillRect(0,0,128,128)},'#ff5cae'],
['split','Two-tone',20,(g,c)=>{g.fillStyle=c;g.fillRect(64,0,64,128)},'#ffffff'],
['sash','Sash',30,(g,c)=>{g.fillStyle=c;g.beginPath();g.moveTo(0,10);g.lineTo(30,0);g.lineTo(128,96);g.lineTo(128,128);g.lineTo(98,128);g.lineTo(0,34);g.fill()},'#ffd23f'],
['tux','Tuxedo',60,(g,c)=>{g.fillStyle='#ffffff';g.beginPath();g.moveTo(44,0);g.lineTo(84,0);g.lineTo(64,70);g.fill();g.fillStyle=c;g.beginPath();g.moveTo(54,10);g.lineTo(74,10);g.lineTo(64,30);g.fill();g.fillRect(60,34,8,8);g.fillRect(60,54,8,8)},'#d62828'],
['overalls','Overalls',40,(g,c)=>{g.fillStyle=c;g.fillRect(20,40,88,90);g.fillRect(20,0,14,50);g.fillRect(94,0,14,50);g.fillStyle='#ffd23f';g.fillRect(24,44,8,8);g.fillRect(96,44,8,8)},'#3b7bd6'],
['pocket','Pocket',10,(g,c)=>{g.fillStyle=c;g.fillRect(74,30,32,34);g.fillStyle='rgba(0,0,0,.25)';g.fillRect(74,30,32,5)},'rgba(255,255,255,.4)'],
['belt','Belt',20,(g,c)=>{g.fillStyle=c;g.fillRect(0,92,128,16);g.fillStyle='#ffd23f';g.fillRect(54,90,20,20)},'#3a2a1a'],
['badge','Badge',20,(g,c)=>{g.fillStyle=c;starPath(g,92,40,22,10,6);g.fill();g.fillStyle='rgba(0,0,0,.3)';g.beginPath();g.arc(92,40,6,0,7);g.fill()},'#ffd23f'],
['flame','Flames',50,(g,c)=>{g.fillStyle=c;for(let i=0;i<6;i++){const x=i*24+10;g.beginPath();g.moveTo(x-12,128);g.quadraticCurveTo(x-6,96,x,78+(i%2)*14);g.quadraticCurveTo(x+6,96,x+12,128);g.fill()}},'#ff7a1a'],
['wave','Waves',30,(g,c)=>{g.strokeStyle=c;g.lineWidth=7;for(let y=16;y<128;y+=28){g.beginPath();for(let x=0;x<=128;x+=4)g.lineTo(x,y+Math.sin(x/10)*7);g.stroke()}},'rgba(255,255,255,.7)'],
['argyle','Argyle',40,(g,c)=>{g.fillStyle=c;for(let y=0;y<4;y++)for(let x=0;x<4;x++){const cx=x*40+(y%2?20:0),cy=y*32+16;g.beginPath();g.moveTo(cx,cy-16);g.lineTo(cx+20,cy);g.lineTo(cx,cy+16);g.lineTo(cx-20,cy);g.fill()}},'rgba(255,255,255,.4)'],
['chevron','Chevrons',30,(g,c)=>{g.strokeStyle=c;g.lineWidth=9;for(let y=0;y<150;y+=30){g.beginPath();g.moveTo(0,y);g.lineTo(64,y+30);g.lineTo(128,y);g.stroke()}},'rgba(255,255,255,.6)'],
['polka','Big polka',20,(g,c)=>{g.fillStyle=c;[[30,30],[94,30],[62,72],[30,110],[94,110]].forEach(p=>{g.beginPath();g.arc(p[0],p[1],14,0,7);g.fill()})},'rgba(255,255,255,.7)'],
['grid','Grid',20,(g,c)=>{g.fillStyle=c;for(let i=0;i<128;i+=32){g.fillRect(i,0,4,128);g.fillRect(0,i,128,4)}},'rgba(255,255,255,.5)'],
['sunburst','Sunburst',40,(g,c)=>{g.fillStyle=c;for(let i=0;i<16;i++){g.beginPath();g.moveTo(64,64);g.arc(64,64,110,i*Math.PI/8,i*Math.PI/8+Math.PI/16);g.fill()}},'rgba(255,255,255,.4)'],
['scales','Scales',40,(g,c)=>{g.strokeStyle=c;g.lineWidth=4;for(let y=0;y<140;y+=20)for(let x=(y/20%2)?0:-14;x<140;x+=28){g.beginPath();g.arc(x+14,y,14,0,Math.PI);g.stroke()}},'rgba(255,255,255,.5)'],
['brick','Bricks',20,(g,c)=>{g.fillStyle=c;for(let y=0;y<128;y+=24){g.fillRect(0,y,128,3);for(let x=(y/24%2)?0:-24;x<128;x+=48)g.fillRect(x+24,y,3,24)}},'rgba(0,0,0,.35)'],
['cross','Crosses',20,(g,c)=>{g.fillStyle=c;[[32,32],[96,32],[64,80],[32,120],[96,120]].forEach(p=>{g.fillRect(p[0]-3,p[1]-12,6,24);g.fillRect(p[0]-12,p[1]-3,24,6)})},'rgba(255,255,255,.65)'],
['rings','Rings',30,(g,c)=>{g.strokeStyle=c;g.lineWidth=8;[16,34,52].forEach(r=>{g.beginPath();g.arc(64,64,r,0,7);g.stroke()})},'rgba(255,255,255,.65)'],
['arrows','Arrows',30,(g,c)=>{g.fillStyle=c;for(let y=10;y<128;y+=40){g.beginPath();g.moveTo(64,y);g.lineTo(96,y+26);g.lineTo(76,y+26);g.lineTo(76,y+40);g.lineTo(52,y+40);g.lineTo(52,y+26);g.lineTo(32,y+26);g.fill()}},'rgba(255,255,255,.6)'],
['cloudy','Clouds',30,(g,c)=>{g.fillStyle=c;[[30,36],[92,60],[44,100]].forEach(p=>{[[0,0,16],[16,4,12],[-16,4,12]].forEach(a=>{g.beginPath();g.arc(p[0]+a[0],p[1]+a[1],a[2],0,7);g.fill()})})},'rgba(255,255,255,.75)'],
['pixels','Pixels',30,(g,c)=>{g.fillStyle=c;for(let i=0;i<40;i++)g.fillRect(((i*37)%8)*16,((i*53)%8)*16,16,16)},'rgba(255,255,255,.35)'],
];
for(let n=0;n<100;n++){const s=String(n).padStart(2,'0');PATS.push(['j'+s,'Jersey '+n,0,(g,c)=>{g.fillStyle=c;g.font='bold 82px sans-serif';g.textAlign='center';g.fillText(String(n),64,94)},'#ffffff']);}
const PANT_IDS=new Set(['stripes','vstripes','diag','checker','dots','star','heart','zigzag','plaid','camo','tiedye','gradient','flame','wave','argyle','polka','grid','chevron','pixels','scales','cloudy','brick','rings']);
const PANTS=[PATS[0]].concat(PATS.filter(p=>PANT_IDS.has(p[0])).map(p=>[p[0],p[1],Math.min(p[2],40),p[3],p[4]]));
const SHIRTS=PATS;

/* ---------- FACE parts ---------- */
const INK='#1b1b22';
const fc=(g,x,y,r)=>{g.beginPath();g.arc(x,y,r,0,7);g.fill()};
const fe=(g,x,y,rx,ry,rt)=>{g.beginPath();g.ellipse(x,y,rx,ry,rt||0,0,7);g.fill()};
const fl=(g,a,b,c,d)=>{g.beginPath();g.moveTo(a,b);g.lineTo(c,d);g.stroke()};
const fa=(g,x,y,r,a,b)=>{g.beginPath();g.arc(x,y,r,a,b);g.stroke()};
const EYES=[
['e00','Dots',(g)=>{fe(g,40,50,7,10);fe(g,88,50,7,10)}],
['e01','Big shiny',(g)=>{[40,88].forEach(x=>{g.fillStyle='#fff';fc(g,x,50,15);g.fillStyle=INK;fc(g,x,52,10);g.fillStyle='#fff';fc(g,x-3,47,3.5)})}],
['e02','Wink',(g)=>{fe(g,40,50,7,10);fl(g,74,52,102,52)}],
['e03','Wow',(g)=>{fe(g,40,48,8,12);fe(g,88,48,8,12)}],
['e04','Grumpy',(g)=>{fe(g,42,60,7,8);fe(g,86,60,7,8)}],
['e05','Shades',(g)=>{g.fillRect(16,36,96,24);g.fillRect(56,40,16,6)}],
['e06','Uneven',(g)=>{fe(g,40,46,9,12);fe(g,90,52,5,6)}],
['e07','Happy arcs',(g)=>{fa(g,40,58,13,Math.PI*1.1,Math.PI*1.9);fa(g,88,58,13,Math.PI*1.1,Math.PI*1.9)}],
['e08','Sleepy',(g)=>{fa(g,40,52,11,0,Math.PI);fa(g,88,52,11,0,Math.PI);fl(g,28,52,52,52);fl(g,76,52,100,52)}],
['e09','Heart eyes',(g)=>{g.fillStyle='#ff4d6d';hrt(g,40,50,22);hrt(g,88,50,22)}],
['e10','Star eyes',(g)=>{g.fillStyle='#ffd23f';starPath(g,40,50,15,7,5);g.fill();starPath(g,88,50,15,7,5);g.fill()}],
['e11','Dizzy',(g)=>{[40,88].forEach(x=>{g.beginPath();for(let a=0;a<12;a+=.3){const r=a*1.2;g.lineTo(x+Math.cos(a)*r,50+Math.sin(a)*r)}g.stroke()})}],
['e12','Robot visor',(g)=>{g.fillStyle='#0d1a26';g.fillRect(12,30,104,42);g.fillStyle='#39f0ff';g.fillRect(24,40,28,22);g.fillRect(76,40,28,22)}],
['e13','Cyclops',(g)=>{g.fillStyle='#fff';fc(g,64,50,24);g.fillStyle=INK;fc(g,64,52,13);g.fillStyle='#fff';fc(g,59,46,4)}],
['e14','X eyes',(g)=>{[40,88].forEach(x=>{fl(g,x-10,40,x+10,60);fl(g,x+10,40,x-10,60)})}],
['e15','Round specs',(g)=>{fe(g,40,50,6,8);fe(g,88,50,6,8);fa(g,40,50,20,0,7);fa(g,88,50,20,0,7);fl(g,60,50,68,50)}],
['e16','Sparkle',(g)=>{g.fillStyle='#fff';[40,88].forEach(x=>{g.fillStyle=INK;fc(g,x,52,13);g.fillStyle='#fff';fc(g,x-4,46,5);fc(g,x+5,56,2.5)})}],
['e17','Lashes',(g)=>{fe(g,40,52,7,10);fe(g,88,52,7,10);g.lineWidth=4;[[-14,-8],[-16,0],[-13,8]].forEach(p=>{fl(g,40+p[0]*.5,44,40+p[0],44+p[1]-4);fl(g,88-p[0]*.5,44,88-p[0],44+p[1]-4)})}],
];
const MOUTHS=[
['m00','Smile',(g)=>fa(g,64,70,24,Math.PI*.15,Math.PI*.85)],
['m01','Big grin',(g)=>{g.beginPath();g.moveTo(30,76);g.lineTo(98,76);g.arc(64,76,34,0,Math.PI);g.closePath();g.fill();g.fillStyle='#fff';g.fillRect(36,76,56,10)}],
['m02','Flat',(g)=>fl(g,44,90,84,90)],
['m03','Little o',(g)=>fe(g,64,92,10,13)],
['m04','Frown',(g)=>fa(g,64,108,22,Math.PI*1.2,Math.PI*1.8)],
['m05','Tongue',(g)=>{fa(g,64,70,26,Math.PI*.1,Math.PI*.9);g.fillStyle='#ff5a7a';fe(g,76,98,10,14)}],
['m06','Smirk',(g)=>{g.beginPath();g.moveTo(44,92);g.quadraticCurveTo(76,102,96,80);g.stroke()}],
['m07','Open D',(g)=>{g.beginPath();g.moveTo(36,80);g.lineTo(92,80);g.arc(64,80,28,0,Math.PI);g.closePath();g.fill();g.fillStyle='#ff5a7a';fe(g,64,104,14,7)}],
['m08','Gritted',(g)=>{g.fillStyle='#fff';g.fillRect(36,82,56,22);g.strokeRect(36,82,56,22);g.lineWidth=4;for(let x=46;x<92;x+=10)fl(g,x,82,x,104);fl(g,36,93,92,93)}],
['m09','Fangs',(g)=>{fa(g,64,74,24,Math.PI*.15,Math.PI*.85);g.fillStyle='#fff';g.beginPath();g.moveTo(44,92);g.lineTo(52,92);g.lineTo(48,104);g.fill();g.beginPath();g.moveTo(76,92);g.lineTo(84,92);g.lineTo(80,104);g.fill()}],
['m10','Kiss',(g)=>{g.fillStyle='#ff4d6d';fe(g,64,92,14,9);g.fillStyle='#c0203f';g.fillRect(50,91,28,3)}],
['m11','Wavy',(g)=>{g.beginPath();for(let x=36;x<=92;x+=4)g.lineTo(x,92+Math.sin(x/6)*5);g.stroke()}],
['m12','Robot grille',(g)=>{g.fillStyle='#0d1a26';g.fillRect(28,86,72,26);g.fillStyle='#39f0ff';for(let i=0;i<5;i++)g.fillRect(33+i*13,90,8,18)}],
['m13','Cat mouth',(g)=>{fa(g,52,84,12,0,Math.PI);fa(g,76,84,12,0,Math.PI);fl(g,64,72,64,84)}],
['m14','Laughing',(g)=>{g.beginPath();g.moveTo(28,74);g.lineTo(100,74);g.arc(64,74,36,0,Math.PI);g.closePath();g.fill();g.fillStyle='#fff';g.fillRect(34,74,60,10);g.fillStyle='#ff5a7a';fe(g,64,108,20,8)}],
['m15','Tiny smile',(g)=>fa(g,64,86,12,Math.PI*.2,Math.PI*.8)],
['m16','Gap tooth',(g)=>{fa(g,64,70,26,Math.PI*.12,Math.PI*.88);g.fillStyle='#fff';g.fillRect(48,90,12,10);g.fillRect(68,90,12,10)}],
['m17','Moustache',(g)=>{g.fillStyle='#3a2a1a';g.beginPath();g.moveTo(64,80);g.quadraticCurveTo(44,70,30,86);g.quadraticCurveTo(48,90,64,84);g.quadraticCurveTo(80,90,98,86);g.quadraticCurveTo(84,70,64,80);g.fill();g.strokeStyle=INK;fa(g,64,92,14,Math.PI*.2,Math.PI*.8)}],
];
const BROWS=[
['b00','No brows',null],
['b01','Flat',(g)=>{fl(g,26,34,56,34);fl(g,72,34,102,34)}],
['b02','Arched',(g)=>{fa(g,41,50,20,Math.PI*1.2,Math.PI*1.8);fa(g,87,50,20,Math.PI*1.2,Math.PI*1.8)}],
['b03','Angry',(g)=>{fl(g,22,36,56,50);fl(g,106,36,72,50)}],
['b04','Worried',(g)=>{fl(g,26,46,56,32);fl(g,102,46,72,32)}],
['b05','Thick',(g)=>{g.lineWidth=12;fl(g,26,34,56,34);fl(g,72,34,102,34)}],
['b06','One raised',(g)=>{fl(g,26,34,56,34);fl(g,72,22,102,30)}],
['b07','Unibrow',(g)=>{g.lineWidth=9;fl(g,26,34,102,34)}],
['b08','Sharp',(g)=>{g.lineWidth=4;fl(g,24,40,58,26);fl(g,104,40,70,26)}],
['b09','Bushy',(g)=>{g.lineWidth=9;for(let i=0;i<4;i++){fl(g,26+i*8,36,32+i*8,28);fl(g,74+i*8,28,80+i*8,36)}}],
];
const FXS=[
['x00','Nothing',null],
['x01','Blush',(g)=>{g.fillStyle='rgba(255,90,120,.42)';fe(g,26,82,11,7);fe(g,102,82,11,7)}],
['x02','Freckles',(g)=>{g.fillStyle='rgba(120,70,30,.6)';[[22,72],[30,80],[38,72],[90,72],[98,80],[106,72],[64,66]].forEach(p=>fc(g,p[0],p[1],3))}],
['x03','Tears',(g)=>{g.fillStyle='#5bc8ff';[[30,70],[98,70]].forEach(p=>{fe(g,p[0],p[1],5,9);fe(g,p[0],p[1]+22,4,7)})}],
['x04','Sweat',(g)=>{g.fillStyle='#8fd3ff';g.beginPath();g.moveTo(112,20);g.quadraticCurveTo(102,38,112,44);g.quadraticCurveTo(122,38,112,20);g.fill()}],
['x05','Scar',(g)=>{g.strokeStyle='#a33a3a';g.lineWidth=5;fl(g,84,22,100,76);g.lineWidth=3;fl(g,80,40,96,38);fl(g,84,58,100,56)}],
['x06','Face paint',(g)=>{g.strokeStyle='#ff4d5e';g.lineWidth=7;fl(g,18,66,44,72);fl(g,18,78,44,82);g.strokeStyle='#3b8bff';fl(g,110,66,84,72);fl(g,110,78,84,82)}],
['x07','Plaster',(g)=>{g.save();g.translate(96,74);g.rotate(.5);g.fillStyle='#f0c9a0';g.fillRect(-20,-6,40,12);g.fillStyle='rgba(0,0,0,.18)';g.fillRect(-6,-6,12,12);g.restore()}],
['x08','Star cheeks',(g)=>{g.fillStyle='#ffd23f';starPath(g,26,80,10,4,5);g.fill();starPath(g,102,80,10,4,5);g.fill()}],
['x09','Stubble',(g)=>{g.fillStyle='rgba(30,20,10,.5)';for(let i=0;i<40;i++)fc(g,26+(i*29)%76,84+(i*17)%30,1.6)}],
];
const partsOf=(l,id)=>{const p=l.find(x=>x[0]===id);return p||l[0]};
const FACE_PRESETS=[
{id:'smile',name:'Smile',price:0,parts:['e00','m00','b00','x00']},{id:'grin',name:'Big grin',price:0,parts:['e00','m01','b00','x00']},
{id:'cool',name:'Shades',price:0,parts:['e05','m00','b00','x00']},{id:'wink',name:'Wink',price:0,parts:['e02','m00','b00','x00']},
{id:'surprised',name:'Wow',price:0,parts:['e03','m03','b00','x00']},{id:'angry',name:'Grumpy',price:40,parts:['e04','m04','b03','x00']},
{id:'silly',name:'Silly',price:60,parts:['e06','m05','b00','x00']},{id:'robot',name:'Robo',price:100,parts:['e12','m12','b00','x00']},
{id:'happy',name:'Happy',price:0,parts:['e07','m01','b02','x01']},{id:'cheeky',name:'Cheeky',price:0,parts:['e02','m05','b06','x01']},
{id:'sleepy',name:'Sleepy',price:0,parts:['e08','m15','b00','x00']},{id:'lovestruck',name:'Lovestruck',price:20,parts:['e09','m10','b02','x01']},
{id:'starstruck',name:'Starstruck',price:20,parts:['e10','m07','b02','x08']},{id:'dizzy',name:'Dizzy',price:20,parts:['e11','m11','b04','x04']},
{id:'cyclops',name:'Cyclops',price:30,parts:['e13','m08','b07','x00']},{id:'ko',name:'Knocked out',price:20,parts:['e14','m03','b00','x00']},
{id:'nerd',name:'Nerd',price:0,parts:['e15','m16','b01','x02']},{id:'sparkle',name:'Sparkle',price:0,parts:['e16','m00','b02','x01']},
{id:'lashes',name:'Lashes',price:0,parts:['e17','m10','b02','x01']},{id:'sad',name:'Sad',price:0,parts:['e01','m04','b04','x03']},
{id:'evil',name:'Evil grin',price:40,parts:['e04','m09','b08','x00']},{id:'tough',name:'Tough',price:30,parts:['e04','m08','b05','x05']},
{id:'laugh',name:'Laughing',price:0,parts:['e07','m14','b02','x00']},{id:'worried',name:'Worried',price:0,parts:['e01','m11','b04','x04']},
{id:'catface',name:'Cat face',price:30,parts:['e01','m13','b02','x06']},{id:'moustache',name:'Moustache',price:30,parts:['e00','m17','b05','x00']},
{id:'vampire',name:'Vampire',price:60,parts:['e04','m09','b08','x00']},{id:'blush',name:'Blushing',price:0,parts:['e07','m15','b00','x01']},
{id:'clown',name:'Clown',price:40,parts:['e06','m14','b09','x06']},{id:'stubbly',name:'Stubbly',price:20,parts:['e00','m06','b01','x09']},
];
const LEGACY_FACES=new Set(['smile','grin','cool','wink','surprised','angry','silly','robot']);
function faceCfg(id){   // what to store in the avatar for a face preset
  const p=FACE_PRESETS.find(x=>x.id===id);if(!p)return{face:'smile'};
  return LEGACY_FACES.has(id)?{face:id,eyes:undefined,mouth:undefined,brows:undefined,fx:undefined}:{face:'mix',eyes:p.parts[0],mouth:p.parts[1],brows:p.parts[2],fx:p.parts[3]};
}
function faceParts(raw,cfg){
  if(raw&&(raw.eyes||raw.mouth||raw.brows||raw.fx))return[raw.eyes||'e00',raw.mouth||'m00',raw.brows||'b00',raw.fx||'x00'];
  const p=FACE_PRESETS.find(x=>x.id===cfg.face);return p?p.parts:['e00','m00','b00','x00'];
}
function faceTex(parts,skin){
  const c=mkCanvas(128,128),g=c.getContext('2d');
  g.fillStyle=skin;g.fillRect(0,0,128,128);
  const ink=()=>{g.fillStyle=INK;g.strokeStyle=INK;g.lineWidth=7;g.lineCap='round';g.lineJoin='round'};
  const run=(list,id)=>{const p=list.find(x=>x[0]===id);const fn=p&&p[p.length-1];if(typeof fn==='function'){g.save();ink();fn(g);g.restore()}};
  run(FXS,parts[3]);run(BROWS,parts[2]);run(EYES,parts[0]);run(MOUTHS,parts[1]);
  const t=new THREE.CanvasTexture(c);t.anisotropy=4;return t;
}
function patternTex(design,base,col){
  const c=mkCanvas(128,128),g=c.getContext('2d');
  g.fillStyle=base;g.fillRect(0,0,128,128);
  const p=PATS.find(x=>x[0]===design);
  if(p&&p[3]){g.save();g.lineCap='round';p[3](g,col||p[4]||'rgba(255,255,255,.5)');g.restore()}
  const t=new THREE.CanvasTexture(c);t.anisotropy=4;return t;
}

/* ---------- catalog: what the shop and editor list ---------- */
const CAT2={hat:HATS,hair:HAIRS,acc:ACCS,back:BACKS,shirt:SHIRTS,pants:PANTS,shoe:SHOES};
const CAT_IDX={};for(const k of Object.keys(CAT2)){CAT_IDX[k]=new Map(CAT2[k].map(x=>[x[0],x]))}
const CATALOG={face:FACE_PRESETS.map(p=>[p.id,p.name,p.price])};
for(const k of Object.keys(CAT2))CATALOG[k]=CAT2[k].map(x=>[x[0],x[1],x[2]]);
function isOwned(kind,id){
  const shape=kind==='face'?id:parseItem(id)[0];
  const it=kind==='face'?FACE_PRESETS.find(x=>x.id===shape):CAT_IDX[kind]&&CAT_IDX[kind].get(shape);
  const price=it?(kind==='face'?it.price:it[2]):0;
  return !it||price===0||(S.user&&S.user.owned.includes(kind+':'+shape));
}
function catalogStats(){
  const kinds=Object.keys(CAT2),per={};let shapes=0;
  for(const k of kinds){const n=CAT2[k].length-1;per[k]=n;shapes+=n}
  const colours=VCOL.length+1;
  const faces=EYES.length*MOUTHS.length*BROWS.length*FXS.length;
  return{per,shapes,colours,faces,facePresets:FACE_PRESETS.length,looks:shapes*colours,items:shapes*colours+faces};
}
function addItem(kind,parent,id,accent,U){
  const [shape,col]=parseItem(id);if(shape==='none')return;
  const e=CAT_IDX[kind]&&CAT_IDX[kind].get(shape);if(!e||!e[3])return;
  const g=new THREE.Group();e[3](g,col||e[4]||accent,U);parent.add(g);return g;
}
function randomAvatar(){
  const t=pick(PALETTE.slice(4)),free=k=>CAT2[k].filter(x=>x[2]===0&&x[0]!=='none');
  const item=(k,p)=>{const l=free(k);if(!l.length||Math.random()>p)return 'none';const e=pick(l);return e[4]||Math.random()<.5?mkItem(e[0],Math.random()<.6?pick(VCOL):null):e[0]};
  const eyes=pick(EYES)[0],mouth=pick(MOUTHS)[0],brows=pick(BROWS)[0],fx=pick(FXS)[0];
  return{skin:pick(SKIN_TONES),torso:t,arms:Math.random()<.6?t:pick(PALETTE),legs:pick(PALETTE.slice(2)),accent:pick(PALETTE.slice(4)),
    face:'mix',eyes,mouth,brows,fx,hat:item('hat',.55),hair:item('hair',.7),acc:item('acc',.3),back:item('back',.3),shirt:item('shirt',.6),pants:item('pants',.35),shoe:item('shoe',.5),
    bh:+(.92+Math.random()*.2).toFixed(2),bw:+(.92+Math.random()*.2).toFixed(2),hs:+(.9+Math.random()*.25).toFixed(2)};
}

/* ---------- the avatar ---------- */
function buildAvatar(cfg,name){
  const raw=cfg||{};cfg=Object.assign({},AV_DEFAULT,raw);
  const root=new THREE.Group(),U=root.userData;U.cfg=cfg;
  const add=(parent,geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;parent.add(m);return m};
  const limb=(w,h,d,px,py,mat)=>{const piv=new THREE.Group();piv.position.set(px,py,0);root.add(piv);add(piv,new THREE.BoxGeometry(w,h,d),mat,0,-h/2,0);return piv};
  const [ps,pc]=parseItem(cfg.pants),[ss,sc]=parseItem(cfg.shirt);
  const legMat=ps!=='none'?new THREE.MeshLambertMaterial({map:patternTex(ps,cfg.legs,pc)}):LM(cfg.legs);
  U.legL=limb(.96,2,.96,-.5,2,legMat);U.legR=limb(.96,2,.96,.5,2,legMat);
  const [sh,shc]=parseItem(cfg.shoe);
  if(sh!=='none'){addItem('shoe',U.legL,cfg.shoe,cfg.accent,U);addItem('shoe',U.legR,cfg.shoe,cfg.accent,U)}
  const tc=LM(cfg.torso);
  add(root,new THREE.BoxGeometry(2,2,1),[tc,tc,tc,tc,new THREE.MeshLambertMaterial({map:patternTex(ss,cfg.torso,sc)}),tc],0,3,0);
  U.armL=limb(.96,2,.96,-1.5,4,LM(cfg.arms));U.armR=limb(.96,2,.96,1.5,4,LM(cfg.arms));
  const head=new THREE.Group();head.position.set(0,4.85,0);root.add(head);U.head=head;
  const sk=LM(cfg.skin);
  add(head,new THREE.BoxGeometry(1.7,1.7,1.7),[sk,sk,sk,sk,new THREE.MeshLambertMaterial({map:faceTex(faceParts(raw,cfg),cfg.skin)}),sk],0,0,0);
  addItem('hair',head,cfg.hair,cfg.accent,U);addItem('hat',head,cfg.hat,cfg.accent,U);addItem('acc',head,cfg.acc,cfg.accent,U);
  addItem('back',root,cfg.back,cfg.accent,U);
  const bh=clamp(+cfg.bh||1,.8,1.25),bw=clamp(+cfg.bw||1,.8,1.25),hs=clamp(+cfg.hs||1,.8,1.3);
  if(hs!==1)head.scale.setScalar(hs);
  if(bh!==1||bw!==1)root.scale.set(bw,bh,bw);
  if(name){const tag=labelSprite(name,{w:5.4});tag.position.set(0,7.1,0);if(bh!==1||bw!==1)tag.scale.set(tag.scale.x/bw,tag.scale.y/bh,tag.scale.z);root.add(tag);U.tag=tag}
  return root;
}

/* ============ settings ============ */
const SET_DEF={vol:100,sfx:true,sens:1,cam:'classic',lockSwitch:true,lock:false,gfx:'auto',fps:false,chat:true};
const SET_BOOLS=['sfx','lockSwitch','fps','chat'];
const Settings={
  d:Object.assign({},SET_DEF,Store.get('settings',{})),
  clean(){
    const d=this.d;
    d.vol=clamp(+d.vol||0,0,100);d.sens=clamp(+d.sens||1,.3,2);
    if(!['classic','follow'].includes(d.cam))d.cam='classic';
    if(!['auto','low','medium','high'].includes(d.gfx))d.gfx='auto';
    ['sfx','lockSwitch','lock','fps','chat'].forEach(k=>{d[k]=!!d[k]});
  },
  save(){Store.set('settings',this.d)},
  set(k,v){this.d[k]=v;this.clean();this.save();this.apply(k)},
  reset(){this.d=Object.assign({},SET_DEF);this.save();this.applyAll()},
  applyAll(){['vol','sfx','gfx','fps','chat','lockSwitch'].forEach(k=>this.apply(k))},
  apply(k){
    switch(k){
      case'vol':Sfx.vol=this.d.vol/100;break;
      case'sfx':Sfx.on=!!this.d.sfx;break;
      case'gfx':this.applyGfx();break;
      case'fps':{const e=$('#fps');if(e)e.classList.toggle('hidden',!this.d.fps)}break;
      case'chat':{const h=$('#hud');if(h)h.classList.toggle('nochat',!this.d.chat)}break;
      case'lockSwitch':case'lock':Lock.sync();break;
    }
  },
  gfx(){
    const g=this.d.gfx;
    if(g==='low')return{shadow:false,size:1024,dpr:1};
    if(g==='medium')return{shadow:true,size:1024,dpr:1.5};
    if(g==='high')return{shadow:true,size:2048,dpr:2};
    return IS_TOUCH?{shadow:false,size:1024,dpr:1.75}:{shadow:true,size:2048,dpr:2};
  },
  applyGfx(){
    const q=this.gfx();R.shadows=q.shadow;R.shadowSize=q.size;R.dprCap=q.dpr;
    try{
      if(!R.r)return;
      R.r.setPixelRatio(Math.min(window.devicePixelRatio||1,q.dpr));R.r.shadowMap.enabled=q.shadow;R.fit();
      if(W){
        const s=W.sun;s.castShadow=q.shadow;s.shadow.mapSize.set(q.size,q.size);
        if(s.shadow.map){s.shadow.map.dispose();s.shadow.map=null}
        W.scene.traverse(o=>{if(o.material)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{m.needsUpdate=true})});
      }
    }catch(e){console.warn(e)}
  }
};
Settings.clean();

/* ============ shift lock ============ */
/* On: the camera sits over the right shoulder, your avatar always faces where the camera points,
   and on a computer the mouse is captured so moving it turns the camera. Press Shift to switch. */
const Lock={on:false,rel:false,fail:0,pending:false,
  set(v){Settings.d.lock=!!v;Settings.save();this.sync()},
  toggle(){if(!Settings.d.lockSwitch)return;this.set(!Settings.d.lock)},
  sync(){
    const on=!!(Settings.d.lock&&Settings.d.lockSwitch&&Play.active&&W);
    this.on=on;if(!on)this.fail=0;if(W)W.cam.locked=on;
    const c=$('#crosshair');if(c)c.classList.toggle('hidden',!on||IS_TOUCH);
    const b=$('#btn-lock');if(b){b.classList.toggle('on',on);b.classList.toggle('hidden',!(IS_TOUCH&&Settings.d.lockSwitch))}
    if(on&&!IS_TOUCH&&Play.ready&&!Play.paused)this.grab();else this.release();
  },
  grab(){
    const el=$('#gview');if(!el||document.pointerLockElement===el)return;
    if(!el.requestPointerLock){this.fail=9;return}
    this.pending=true;
    try{const r=el.requestPointerLock();if(r&&r.catch)r.catch(()=>this.lost())}catch(e){this.lost()}
  },
  lost(){if(this.pending){this.pending=false;this.fail++}},
  release(){
    if(document.pointerLockElement&&document.exitPointerLock){this.rel=true;setTimeout(()=>{this.rel=false},400);try{document.exitPointerLock()}catch(e){this.rel=false}}
  }
};
document.addEventListener('pointerlockerror',()=>Lock.lost());
document.addEventListener('pointerlockchange',()=>{
  const locked=document.pointerLockElement===$('#gview');
  if(locked){Lock.pending=false;Lock.fail=0}
  /* the browser gives the cursor back when you press Esc: treat that as opening the menu */
  if(!locked&&Lock.on&&!Lock.rel&&Play.active&&Play.ready&&!Play.paused)Play.toggleMenu();
  Lock.rel=false;
});

/* ============ settings screen ============ */
function showSettings(){
  const d=Settings.d;
  const cur=k=>typeof d[k]==='boolean'?(d[k]?'1':'0'):String(d[k]);
  const seg=(k,opts)=>`<div class="seg" role="group" aria-label="${k}">${opts.map(o=>`<button class="${cur(k)===String(o[0])?'on':''}" data-act="set-opt" data-k="${k}" data-v="${o[0]}">${o[1]}</button>`).join('')}</div>`;
  const rng=(k,min,max,step,val,txt)=>`<div class="set-rng"><input type="range" min="${min}" max="${max}" step="${step}" value="${val}" data-set="${k}" aria-label="${k}"><b id="sv-${k}">${txt}</b></div>`;
  const row=(label,ctl,hint)=>`<div class="set-row"><div class="set-l"><span>${label}</span>${hint?`<small>${hint}</small>`:''}</div><div class="set-c">${ctl}</div></div>`;
  const help=IS_TOUCH
    ?'<li><b>Left thumb</b> moves you. <b>Jump</b> button jumps.</li><li><b>Drag on the right</b> to look around.</li><li><b>Lock</b> button turns shift lock on or off.</li>'
    :'<li><b>W A S D</b> or arrow keys: move</li><li><b>Space</b>: jump</li><li><b>Drag</b> the mouse to look, <b>wheel</b> to zoom</li><li><b>Shift</b>: shift lock, the camera stays behind you</li><li><b>/</b> or <b>Enter</b>: chat &nbsp; <b>Esc</b>: menu</li>';
  modal(`<h2>Settings</h2><div class="set-list">
    ${row('Volume',rng('vol',0,100,5,d.vol,d.vol+'%'))}
    ${row('Sound effects',seg('sfx',[[1,'On'],[0,'Off']]))}
    ${row('Camera sensitivity',rng('sens',30,200,10,Math.round(d.sens*100),Math.round(d.sens*100)+'%'))}
    ${row('Camera mode',seg('cam',[['classic','Classic'],['follow','Follow']]),'Follow swings the camera behind you as you walk.')}
    ${row('Shift lock switch',seg('lockSwitch',[[1,'On'],[0,'Off']]),IS_TOUCH?'Shows a Lock button in games.':'Press Shift in a game to lock the camera behind you.')}
    ${row('Graphics',seg('gfx',[['auto','Auto'],['low','Low'],['medium','Medium'],['high','High']]),'Lower it if games feel slow.')}
    ${row('Performance stats',seg('fps',[[0,'Off'],[1,'On']]),'Shows frames per second in games.')}
    ${row('Chat window',seg('chat',[[1,'Shown'],[0,'Hidden']]))}
    ${document.fullscreenEnabled?row('Fullscreen','<button class="btn sm" data-act="set-fs">Toggle fullscreen</button>'):''}
  </div><h3 class="set-h">Controls</h3><ul class="set-help">${help}</ul>
  <div class="acts"><button class="btn" data-act="set-reset">Reset to defaults</button><button class="btn brand" data-act="modal-close">Done</button></div>`,'set-box');
}
const SettingsActs={
  settings:()=>showSettings(),
  'set-opt':t=>{
    const k=t.dataset.k;let v=t.dataset.v;if(SET_BOOLS.includes(k))v=v==='1';
    Settings.set(k,v);
    $$('[data-act=set-opt][data-k="'+k+'"]').forEach(b=>b.classList.toggle('on',b===t));
    if(k==='sfx'){const g=$('#gm-sound');if(g)g.textContent=v?'Sound on':'Sound off'}
  },
  'set-fs':()=>{const d=document;if(d.fullscreenElement)d.exitFullscreen();else d.documentElement.requestFullscreen().catch(()=>{})},
  'set-reset':()=>{Settings.reset();showSettings()}
};
document.addEventListener('input',e=>{
  const t=e.target;if(!t.dataset||!t.dataset.set)return;
  const k=t.dataset.set,v=+t.value;
  Settings.set(k,k==='sens'?v/100:v);
  const l=$('#sv-'+k);if(l)l.textContent=k==='sens'?v+'%':v+'%';
  if(k==='vol')Sfx.play('click');
});

/* ============ renderer ============ */
const R={r:null,el:null,w:2,h:2,ok:true,shadows:!IS_TOUCH,dprCap:IS_TOUCH?1.75:2,shadowSize:2048,onfit:null,ro:null,
  init(){
    if(this.r)return true;if(!this.ok)return false;
    try{
      const r=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
      r.setPixelRatio(Math.min(window.devicePixelRatio||1,this.dprCap));
      r.setClearColor(0x000000,0);
      r.shadowMap.enabled=this.shadows;r.shadowMap.type=THREE.PCFSoftShadowMap;
      r.domElement.style.cssText='width:100%;height:100%;display:block;touch-action:none;outline:none';
      this.r=r;this.ro=new ResizeObserver(()=>this.fit());
    }catch(e){console.warn('WebGL unavailable',e);this.ok=false;this.r=null;return false}
    return true;
  },
  attach(el){if(!this.init())return false;this.el=el;el.appendChild(this.r.domElement);this.ro.disconnect();this.ro.observe(el);this.fit();return true},
  detach(){if(this.r&&this.r.domElement.parentNode)this.r.domElement.parentNode.removeChild(this.r.domElement);if(this.ro)this.ro.disconnect();this.el=null},
  fit(){if(!this.el||!this.r)return;const w=Math.max(2,this.el.clientWidth),h=Math.max(2,this.el.clientHeight);this.w=w;this.h=h;this.r.setSize(w,h,false);if(this.onfit)this.onfit(w,h)},
  render(sc,cam){if(this.r&&this.el)this.r.render(sc,cam)}
};
const Loop={fn:null,last:0,
  run(ms){requestAnimationFrame(Loop.run);const raw=(ms-Loop.last)/1000||.016,dt=Math.min(.05,raw);Loop.last=ms;Loop.raw=raw;
    if(Loop.fn){try{Loop.fn(dt,ms/1000)}catch(e){console.error(e);Loop.fn=null;toastUI('Something went wrong. Please try again.')}}}
};

/* ============ materials ============ */
const MATS={},STUD_T=3;let _stud=null,_noise=null;
function studTex(){
  if(_stud)return _stud;
  const c=mkCanvas(64,64),g=c.getContext('2d');
  g.fillStyle='#ffffff';g.fillRect(0,0,64,64);g.strokeStyle='rgba(0,0,0,.14)';g.lineWidth=2;g.strokeRect(1,1,62,62);
  const gr=g.createRadialGradient(28,26,2,32,32,15);gr.addColorStop(0,'#ffffff');gr.addColorStop(1,'#cdcdcd');
  g.fillStyle=gr;g.beginPath();g.arc(32,32,14,0,7);g.fill();g.strokeStyle='rgba(0,0,0,.2)';g.lineWidth=2;g.beginPath();g.arc(32,32,14,0,7);g.stroke();
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return _stud=t;
}
function blobTexture(base,hi,lo,n,seed){
  const c=mkCanvas(256,256),g=c.getContext('2d'),r=rng(seed||7);
  g.fillStyle=base;g.fillRect(0,0,256,256);
  for(let i=0;i<n;i++){
    const x=r()*256,y=r()*256,rad=14+r()*34,col=r()<.6?hi:lo;
    for(const ox of[-256,0,256])for(const oy of[-256,0,256]){
      const gr=g.createRadialGradient(x+ox,y+oy,0,x+ox,y+oy,rad);gr.addColorStop(0,col);gr.addColorStop(1,'rgba(255,255,255,0)');
      g.fillStyle=gr;g.fillRect(x+ox-rad,y+oy-rad,rad*2,rad*2);
    }
  }
  const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=4;return t;
}
function noiseTex(){return _noise||(_noise=blobTexture('#f2f2f2','rgba(255,255,255,.95)','rgba(200,200,200,.9)',26,11))}
const sideMat=c=>MATS['s'+c]||(MATS['s'+c]=new THREE.MeshLambertMaterial({color:c}));
const topMat=c=>MATS['t'+c]||(MATS['t'+c]=new THREE.MeshLambertMaterial({color:c,map:studTex()}));
const neonMat=c=>MATS['n'+c]||(MATS['n'+c]=new THREE.MeshBasicMaterial({color:c,map:noiseTex()}));
function mkBox(sx,sy,sz,color,o){
  o=o||{};const g=new THREE.BoxGeometry(sx,sy,sz);
  const neon=o.neon||o.kind==='kill',studs=!neon&&o.studs!==false;
  const T=neon?6:STUD_T;
  if(neon||studs){
    const uv=g.attributes.uv;
    for(let f=0;f<6;f++){const wu=f<2?sz:sx,hv=f<2?sy:(f<4?sz:sy);for(let i=0;i<4;i++){const k=f*4+i;uv.setXY(k,uv.getX(k)*wu/T,uv.getY(k)*hv/T)}}
  }
  let mat;
  if(neon)mat=neonMat(color);else if(studs){const s=sideMat(color);mat=[s,s,topMat(color),s,s,s]}else mat=sideMat(color);
  const m=new THREE.Mesh(g,mat);m.castShadow=o.cast!==false&&!neon;m.receiveShadow=o.recv!==false&&!neon;return m;
}
const COIN_GEO=new THREE.CylinderGeometry(1.15,1.15,.3,20);
const COIN_MAT=new THREE.MeshLambertMaterial({color:'#ffcf33',emissive:'#7a5200'});
const FX_GEO=new THREE.BoxGeometry(.5,.5,.5);
function fxMat(c){return MATS['f'+c]||(MATS['f'+c]=new THREE.MeshLambertMaterial({color:c,emissive:c,emissiveIntensity:.25}))}
function disposeObj(o){
  o.traverse(n=>{
    if(n.geometry)n.geometry.dispose();
    const ms=n.material?(Array.isArray(n.material)?n.material:[n.material]):[];
    ms.forEach(m=>{if(m.map&&m.map!==_stud&&m.map!==_noise)m.map.dispose()});
  });
}

/* ============ thumbnails (3D -> png) ============ */
const Thumb={rt:null,sc:null,cam:null,cache:{},
  init(){
    if(this.sc)return;
    this.rt=new THREE.WebGLRenderTarget(256,256);this.sc=new THREE.Scene();
    this.sc.add(new THREE.HemisphereLight(0xffffff,0x9aa6c0,.95));
    const d=new THREE.DirectionalLight(0xffffff,.6);d.position.set(3,6,8);this.sc.add(d);
    this.cam=new THREE.PerspectiveCamera(30,1,.1,100);
  },
  shot(obj,cy,dist,yaw){
    if(!R.init())return '';
    try{
      this.init();obj.rotation.y=yaw;this.sc.add(obj);
      this.cam.position.set(0,cy,dist);this.cam.lookAt(0,cy,0);
      const r=R.r,old=r.getRenderTarget();
      r.setRenderTarget(this.rt);r.setClearColor(0x000000,0);r.clear();r.render(this.sc,this.cam);
      const buf=new Uint8Array(256*256*4);r.readRenderTargetPixels(this.rt,0,0,256,256,buf);r.setRenderTarget(old);
      this.sc.remove(obj);
      const c=mkCanvas(256,256),g=c.getContext('2d'),id=g.createImageData(256,256);
      for(let y=0;y<256;y++)id.data.set(buf.subarray((255-y)*1024,(256-y)*1024),y*1024);
      g.putImageData(id,0,0);return c.toDataURL('image/png');
    }catch(e){console.warn(e);return ''}
  }
};
function headshot(cfg){const av=buildAvatar(cfg);const u=Thumb.shot(av,4.5,8.6,.5);disposeObj(av);return u}
function itemThumb(kind,id){
  const key=kind+':'+id;if(Thumb.cache[key])return Thumb.cache[key];
  const base=Object.assign({},AV_DEFAULT,{torso:'#5b6470',arms:'#5b6470',legs:'#3a414c'});
  if(kind==='shirt')base.torso=base.arms='#3b8bff';
  if(kind==='pants')base.legs='#3b8bff';
  if(kind==='face')Object.assign(base,faceCfg(id));else base[kind]=id;
  const av=buildAvatar(base);
  const spec={hat:[5.4,7.6,.5],hair:[5.2,7.4,.5],acc:[4.9,5.6,.12],face:[4.85,5.4,.12],back:[3.4,13.5,Math.PI+.55],shirt:[3.1,7.4,.12],pants:[1.6,8.4,.25],shoe:[.9,7.4,.45]}[kind]||[4.5,8.6,.5];
  const u=Thumb.shot(av,spec[0],spec[1],spec[2]);disposeObj(av);
  return u?(Thumb.cache[key]=u):'';
}

/* ============ world ============ */
let W=null;
function newWorld(def){
  const scene=new THREE.Scene();
  const hemi=new THREE.HemisphereLight(0xffffff,0x8a97b8,.8);scene.add(hemi);
  const sun=new THREE.DirectionalLight(0xffffff,.72);sun.position.set(50,90,35);
  sun.castShadow=R.shadows;sun.shadow.mapSize.set(R.shadowSize,R.shadowSize);
  {const sc=sun.shadow.camera;sc.left=-75;sc.right=75;sc.top=75;sc.bottom=-75;sc.near=1;sc.far=280}sun.shadow.bias=-.0007;
  scene.add(sun);scene.add(sun.target);
  const w={def,scene,sun,hemi,skyMesh:null,solids:[],kills:[],checks:[],finishes:[],bounces:[],spinners:[],coins:[],ups:[],respawns:[],bots:[],fx:[],
    t:0,score:0,boardLabel:'Score',boardVal:null,botRate:0,botMax:99,won:false,deaths:0,
    spawn:{x:0,y:3,z:0},spawnPart:null,voidY:-90,action:null,onTap:null,onCheckpoint:null,onFinish:null,onCoin:null,onDie:null,
    p:{x:0,y:3,z:0,vx:0,vy:0,vz:0,hw:.9,H:5.7,on:false,ground:null,coy:0,face:Math.PI,alive:true,dead:0,hp:100,maxHp:100,inv:0,speed:16,jump:50,g:196.2,emote:null,av:null,hurt:99},
    cam:{yaw:0,pitch:.42,dist:16,tx:0,ty:4,tz:0,off:0,locked:false}};
  w.p.av=buildAvatar(S.user.avatar,S.user.name);scene.add(w.p.av);

  w.setSky=(top,bot,fn,ff)=>{
    if(w.skyMesh){scene.remove(w.skyMesh);w.skyMesh.geometry.dispose();w.skyMesh.material.dispose();w.skyMesh=null}   // a new sky replaces the old one
    const g=new THREE.SphereGeometry(900,24,16),pos=g.attributes.position,col=new Float32Array(pos.count*3);
    const ct=new THREE.Color(top),cb=new THREE.Color(bot),tmp=new THREE.Color();
    for(let i=0;i<pos.count;i++){const k=clamp((pos.getY(i)/900+.05)/.75,0,1);tmp.copy(cb).lerp(ct,Math.pow(k,.7));col[i*3]=tmp.r;col[i*3+1]=tmp.g;col[i*3+2]=tmp.b}
    g.setAttribute('color',new THREE.BufferAttribute(col,3));
    const m=new THREE.Mesh(g,new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.BackSide,fog:false,depthWrite:false}));
    m.renderOrder=-10;m.frustumCulled=false;scene.add(m);w.skyMesh=m;
    scene.fog=new THREE.Fog(new THREE.Color(bot),fn||140,ff||620);
    const dark=(ct.r+ct.g+ct.b)/3<.3;hemi.intensity=dark?.62:.8;sun.intensity=dark?.5:.72;
  };
  w.box=(x,y,z,sx,sy,sz,color,o)=>{
    o=o||{};const m=mkBox(sx,sy,sz,color,o);m.position.set(x,y,z);scene.add(m);
    const kind=o.kind||'solid';
    const p={mesh:m,x,y,z,ox:x,oy:y,oz:z,hx:sx/2,hy:sy/2,hz:sz/2,kind,dx:0,dz:0,solid:kind!=='decor'&&o.solid!==false,color};
    if(p.solid)w.solids.push(p);
    if(kind==='kill')w.kills.push(p);else if(kind==='checkpoint')w.checks.push(p);else if(kind==='finish')w.finishes.push(p);else if(kind==='bounce')w.bounces.push(p);
    return p;
  };
  w.plat=(x,top,z,sx,sz,color,o,th)=>{th=th||1;return w.box(x,top-th/2,z,sx,th,sz,color,o)};
  w.coin=(x,y,z)=>{
    const h=new THREE.Group();h.position.set(x,y,z);const m=new THREE.Mesh(COIN_GEO,COIN_MAT);m.rotation.z=Math.PI/2;h.add(m);scene.add(h);
    const c={h,x,y,z,got:false,ph:rand(0,6)};w.coins.push(c);return c;
  };
  w.label=(text,x,y,z,o)=>{const s=labelSprite(text,o);s.position.set(x,y,z);scene.add(s);return s};
  w.removeBox=p=>{   // take a part out of the world (LAN map edits)
    p.dead=true;p.solid=false;
    for(const a of [w.solids,w.kills,w.checks,w.finishes,w.bounces]){const i=a.indexOf(p);if(i>=0)a.splice(i,1)}
    if(w.spawnPart===p)w.spawnPart=null;
    scene.remove(p.mesh);p.mesh.geometry.dispose();
  };
  w.mover=(p,o)=>{
    const ax=o.ax||'x',amp=o.amp||8,sp=o.speed||1,ph=o.phase||0;p.mover=true;
    w.ups.push(dt=>{
      if(p.dead)return;
      const t=Net.now(),npos=(ax==='x'?p.ox:p.oz)+Math.sin(t*sp+ph)*amp,old=ax==='x'?p.x:p.z,d=Math.abs(npos-old)>6?0:npos-old;
      if(ax==='x'){p.x=npos;p.dx=d;p.dz=0}else{p.z=npos;p.dz=d;p.dx=0}
      p.mesh.position.set(p.x,p.y,p.z);
    });
    return p;
  };
  w.spinner=(x,y,z,len,th,ht,color,speed)=>{
    const m=mkBox(len,ht,th,color,{studs:false});m.position.set(x,y,z);scene.add(m);
    const s={x,y,z,len,th,ht,ang:0,sp:speed};w.spinners.push(s);
    w.ups.push(dt=>{s.ang=s.sp*Net.now();m.rotation.y=s.ang});return s;
  };
  w.update=fn=>w.ups.push(fn);
  w.inRect=(cx,cz,hx,hz,ymax)=>Math.abs(w.p.x-cx)<hx+.3&&Math.abs(w.p.z-cz)<hz+.3&&w.p.y<ymax;
  w.stat=(k,label,val)=>{
    let el=document.getElementById('st-'+k);
    if(!el){el=document.createElement('div');el.id='st-'+k;el.className='pill';$('#hud-stats').appendChild(el)}
    const h=`<span>${esc(label)}</span><b>${esc(val)}</b>`;if(el.innerHTML!==h)el.innerHTML=h;
  };
  w.toast=(msg,ms)=>{const el=$('#hud-toast');el.textContent=msg;el.classList.add('show');clearTimeout(w._tt);w._tt=setTimeout(()=>el.classList.remove('show'),ms||2200)};
  w.chat=(name,text,sys)=>chatAdd(name,text,sys);
  w.reward=(n,silent)=>{S.user.coins+=n;save();refreshCoins();if(!silent)w.toast('+'+n+' coins',1800)};
  w.best=(key,val,lower)=>{const b=S.user.best,old=b[key];const nw=old===undefined||(lower?val<old:val>old);if(nw){b[key]=val;save()}return nw};
  w.flash=()=>{const e=$('#dmgflash');e.classList.add('on');setTimeout(()=>e.classList.remove('on'),90)};
  w.hpBar=on=>$('#hud-hp').classList.toggle('hidden',!on);
  w.burst=(x,y,z,colors,n,spd,life)=>{
    for(let i=0;i<(n||14)&&w.fx.length<320;i++){
      const m=new THREE.Mesh(FX_GEO,fxMat(pick(colors)));m.position.set(x,y,z);scene.add(m);
      w.fx.push({m,vx:rand(-1,1)*(spd||14),vy:rand(.3,1.2)*(spd||14),vz:rand(-1,1)*(spd||14),life:(life||1)*rand(.7,1.2),max:life||1});
    }
  };
  w.confetti=(x,y,z)=>w.burst(x,y,z,['#ff4d5e','#ffd23f','#7ed957','#3b8bff','#a45cff','#ff8a3d'],70,24,2.4);
  w.win=(msg,reward,extra)=>{
    if(w.won)return;w.won=true;if(reward)w.reward(reward,true);
    Sfx.play('win');w.confetti(w.p.x,w.p.y+2,w.p.z);Play.showResult(msg,reward,extra);
  };
  w.die=msg=>dieNow(msg);
  w.killBot=(b,delay)=>{if(!b.alive)return;b.alive=false;b.av.visible=false;b.rt=delay==null?3:delay;w.burst(b.x,b.y+3,b.z,[b.cfg.skin,b.cfg.torso,b.cfg.legs],12,12,.9)};
  w.addBots=(n,area)=>{
    for(let i=0;i<n;i++){
      const cfg=randomAvatar(),name=botName()+' (bot)',av=buildAvatar(cfg,name);
      const b={name,av,cfg,area,x:area.x+rand(-.8,.8)*area.r,z:area.z+rand(-.8,.8)*area.r,y:area.y,vy:0,tx:area.x,tz:area.z,wait:rand(0,3),score:0,alive:true,rt:0,face:rand(0,6),speed:0};
      av.position.set(b.x,b.y,b.z);scene.add(av);w.bots.push(b);
    }
  };
  return w;
}

/* ============ fx / bots / coins ============ */
function updFx(dt){
  const w=W;
  for(let i=w.fx.length-1;i>=0;i--){
    const f=w.fx[i];f.vy-=60*dt;const m=f.m;m.position.x+=f.vx*dt;m.position.y+=f.vy*dt;m.position.z+=f.vz*dt;
    f.life-=dt;m.scale.setScalar(clamp(f.life/f.max*1.3,.01,1));m.rotation.x+=dt*6;m.rotation.y+=dt*5;
    if(f.life<=0){w.scene.remove(m);w.fx.splice(i,1)}
  }
  const p=w.p;
  for(const c of w.coins){
    if(c.got)continue;c.h.rotation.y+=dt*3;c.h.position.y=c.y+Math.sin(w.t*2.5+c.ph)*.35;
    const dx=c.x-p.x,dz=c.z-p.z,dy=c.y-(p.y+p.H/2);
    if(p.alive&&dx*dx+dz*dz+dy*dy<8.4){c.got=true;w.scene.remove(c.h);Sfx.play('coin');w.burst(c.x,c.y,c.z,['#ffcf33','#fff1a8'],6,8,.5);if(w.onCoin)w.onCoin(c);else w.reward(1,true)}
  }
}
function updBots(dt){
  const w=W;if(!w.bots.length)return;
  for(const b of w.bots){
    if(!b.alive){b.rt-=dt;if(b.rt<=0){b.alive=true;b.av.visible=true;b.x=b.area.x+rand(-.6,.6)*b.area.r;b.z=b.area.z+rand(-.6,.6)*b.area.r;b.y=b.area.y;b.vy=0}continue}
    if(b.wait>0){b.wait-=dt;b.speed=0;if(Math.random()<dt*.2&&b.y<=b.area.y+.01)b.vy=42}
    else{
      const dx=b.tx-b.x,dz=b.tz-b.z,d=Math.hypot(dx,dz);
      if(d<1){b.wait=rand(1,4);const a=rand(0,6.28),r=Math.sqrt(Math.random())*b.area.r;b.tx=b.area.x+Math.cos(a)*r;b.tz=b.area.z+Math.sin(a)*r}
      else{b.x+=dx/d*8*dt;b.z+=dz/d*8*dt;b.face=Math.atan2(dx,dz);b.speed=1}
    }
    b.vy-=196*dt;b.y+=b.vy*dt;if(b.y<b.area.y){b.y=b.area.y;b.vy=0}
    b.av.position.set(b.x,b.y,b.z);b.av.rotation.y=angLerp(b.av.rotation.y,b.face,dt*10);
    animAvatar(b.av,w.t+b.x,b.speed,b.y>b.area.y+.3,null,dt,null);
    if(w.botRate&&b.score<w.botMax&&Math.random()<dt*w.botRate)b.score++;
  }
}

/* ============ player physics ============ */
const In={keys:{},jump:false,act:false,typing:false,joy:{id:null,x:0,y:0,bx:0,by:0},cam:{id:null},
  axis(){
    const k=this.keys;let x=(k.KeyD||k.ArrowRight?1:0)-(k.KeyA||k.ArrowLeft?1:0),z=(k.KeyW||k.ArrowUp?1:0)-(k.KeyS||k.ArrowDown?1:0);
    if(this.joy.id!==null){x+=this.joy.x;z+=this.joy.y}return{x,z};
  },
  reset(){this.keys={};this.jump=false;this.act=false;this.joy={id:null,x:0,y:0,bx:0,by:0};this.cam={id:null};const j=$('#joy');if(j)j.style.display='none'}
};
function collide(axis){
  const p=W.p,hw=p.hw,H=p.H,sol=W.solids;
  for(let i=0;i<sol.length;i++){
    const b=sol[i];if(!b.solid)continue;
    if(p.x+hw<=b.x-b.hx||p.x-hw>=b.x+b.hx||p.z+hw<=b.z-b.hz||p.z-hw>=b.z+b.hz||p.y+H<=b.y-b.hy||p.y>=b.y+b.hy)continue;
    if(axis==='y'){
      if(p.vy<=0){p.y=b.y+b.hy;p.vy=0;p.on=true;p.ground=b}
      else{p.y=b.y-b.hy-H;p.vy=0}
    }else{
      const top=b.y+b.hy;
      if(top-p.y<=.75&&top-p.y>0&&p.vy<=.5){p.y=top;p.on=true;p.ground=b;continue}
      if(axis==='x'){p.x=p.x<b.x?b.x-b.hx-hw:b.x+b.hx+hw;p.vx=0}
      else{p.z=p.z<b.z?b.z-b.hz-hw:b.z+b.hz+hw;p.vz=0}
    }
  }
}
function ovBox(p,b,m){return p.x+p.hw>b.x-b.hx-m&&p.x-p.hw<b.x+b.hx+m&&p.z+p.hw>b.z-b.hz-m&&p.z-p.hw<b.z+b.hz+m&&p.y+p.H>b.y-b.hy-m&&p.y<b.y+b.hy+m}
function spinHit(s,p){
  const dx=p.x-s.x,dz=p.z-s.z,c=Math.cos(s.ang),sn=Math.sin(s.ang);
  const lx=dx*c-dz*sn,lz=dx*sn+dz*c;
  return Math.abs(lx)<=s.len/2+p.hw&&Math.abs(lz)<=s.th/2+p.hw&&p.y+p.H>s.y-s.ht/2&&p.y<s.y+s.ht/2;
}
function dieNow(msg){
  const w=W,p=w.p;if(!p.alive||p.inv>0)return;
  p.alive=false;p.dead=1.05;p.av.visible=false;w.deaths++;
  const a=S.user.avatar;w.burst(p.x,p.y+3,p.z,[a.skin,a.torso,a.legs],18,16,1);Sfx.play('die');
  if(w.onDie)w.onDie(msg);
}
function respawnNow(){
  const w=W,p=w.p;
  p.x=w.spawn.x;p.y=w.spawn.y;p.z=w.spawn.z;p.vx=p.vy=p.vz=0;p.alive=true;p.inv=1.3;p.on=false;p.ground=null;p.hp=p.maxHp;p.av.visible=true;
  w.respawns.forEach(f=>f());
}
function stepPlayer(dt){
  const w=W,p=w.p;
  if(!p.alive){p.dead-=dt;if(p.dead<=0)respawnNow();return}
  if(p.inv>0)p.inv-=dt;p.hurt+=dt;
  const a=((w.lan&&Build.on)||p.nomove>0)?{x:0,z:0}:In.axis();let mx=a.x,mz=a.z;const len=Math.hypot(mx,mz);if(len>1){mx/=len;mz/=len}
  const sy=Math.sin(w.cam.yaw),cy=Math.cos(w.cam.yaw);
  const dx=mx*cy-mz*sy,dz=-mx*sy-mz*cy;
  const k=Math.min(1,dt*(p.on?28:14));
  p.vx+=(dx*p.speed-p.vx)*k;p.vz+=(dz*p.speed-p.vz)*k;
  if(p.nomove>0)p.nomove-=dt;
  if(p.kbT>0){p.kbT-=dt;p.vx=p.kx;p.vz=p.kz;const dc=Math.pow(.03,dt);p.kx*=dc;p.kz*=dc}   // knockback and dashes override walking for a moment
  if(w.cam.locked)p.face=w.cam.yaw+Math.PI;else if(len>.1)p.face=Math.atan2(dx,dz);
  if(p.ground&&p.ground.mover){p.x+=p.ground.dx;p.z+=p.ground.dz}
  p.coy=p.on?.09:p.coy-dt;
  if(In.jump&&!In.typing&&!(w.lan&&Build.on)&&!(p.nomove>0)&&p.coy>0){p.vy=p.jump;p.coy=0;p.on=false;Sfx.play('jump')}
  p.vy=Math.max(p.vy-p.g*dt,-220);
  p.x+=p.vx*dt;collide('x');
  p.z+=p.vz*dt;collide('z');
  p.on=false;p.ground=null;p.y+=p.vy*dt;collide('y');
  const ks=w.kills;for(let i=0;i<ks.length;i++)if(ks[i].solid&&ovBox(p,ks[i],.15)){dieNow('lava');return}
  for(const s of w.spinners)if(spinHit(s,p)){dieNow('spinner');return}
  if(p.y<w.voidY){dieNow('fell');return}
  for(const b of w.checks)if(p.ground===b&&w.spawnPart!==b){w.spawnPart=b;w.spawn={x:b.x,y:b.y+b.hy+.2,z:b.z};Sfx.play('check');if(w.onCheckpoint)w.onCheckpoint(b)}
  for(const b of w.bounces)if(p.ground===b){p.vy=95;p.on=false;p.ground=null;Sfx.play('bounce')}
  if(!w.won)for(const b of w.finishes)if(ovBox(p,b,.4)){if(w.onFinish)w.onFinish(b);else w.win('You reached the finish!',100);break}
}
function updateCam(dt){
  const w=W,c=w.cam,p=w.p,cam=Play.cam;if(!cam)return;
  if(w.lan&&Build.on){Build.updateCam(dt,cam,w);return}
  const k=Math.min(1,dt*16);
  c.tx+=(p.x-c.tx)*k;c.ty+=(p.y+3.6-c.ty)*k;c.tz+=(p.z-c.tz)*k;
  if(Settings.d.cam==='follow'&&!c.locked&&In.cam.id===null&&p.alive&&Math.hypot(p.vx,p.vz)>2)c.yaw=angLerp(c.yaw,p.face+Math.PI,Math.min(1,dt*1.8));
  c.off+=((c.locked?1.9:0)-c.off)*Math.min(1,dt*10);
  const ox=Math.cos(c.yaw)*c.off,oz=-Math.sin(c.yaw)*c.off;
  const cp=Math.cos(c.pitch),sp=Math.sin(c.pitch);
  cam.position.set(c.tx+ox+Math.sin(c.yaw)*cp*c.dist,c.ty+sp*c.dist,c.tz+oz+Math.cos(c.yaw)*cp*c.dist);
  cam.lookAt(c.tx+ox,c.ty+.8,c.tz+oz);
  if(w.skyMesh)w.skyMesh.position.copy(cam.position);
  w.sun.position.set(p.x+50,p.y+90,p.z+35);w.sun.target.position.set(p.x,p.y,p.z);
}

/* ============ HUD, chat ============ */
function chatAdd(name,text,sys){
  const log=$('#chat-log');if(!log)return;
  const d=document.createElement('div');d.className='cl'+(sys?' sys':'');
  d.innerHTML=(name?`<b>${esc(name)}:</b> `:'')+esc(text);log.appendChild(d);
  while(log.children.length>24)log.removeChild(log.firstChild);
}
function sendChat(v){
  v=v.trim();if(!v||!W)return;
  if(v.startsWith('/e ')){const e=v.slice(3).trim();if(['dance','wave','cheer'].includes(e))W.p.emote={type:e,t:0};return}
  if(Net.on){if(Net.chatOn)Net.chat(v);else chatAdd('','Chat is turned off on this server.',true);return}
  chatAdd(S.user.name,v);
  if(W.bots.length&&Math.random()<.5)setTimeout(()=>{const b=pick(W.bots);if(b&&W)chatAdd(b.name,pick(BOT_REPLIES))},1200+Math.random()*2200);
}
let _bt=0;
function hudTick(dt){
  const w=W;_bt-=dt;
  if(_bt<=0){
    _bt=.5;
    const rows=[{name:S.user.name,val:w.boardVal?w.boardVal():w.score,me:1,owner:Net.isOwner()}].concat(w.bots.map(b=>({name:b.name,val:b.score})),Net.rows());
    rows.sort((a,b)=>b.val-a.val);
    $('#hud-board').innerHTML=`<div class="bh"><span>Players</span><span>${esc(w.boardLabel)}</span></div>`+rows.map(r=>`<div class="br${r.me?' me':''}"><span>${esc(r.name)}${r.owner?'<i class="own">OWNER</i>':''}</span><b>${r.val}</b></div>`).join('');
  }
  if(!$('#hud-hp').classList.contains('hidden')){
    const f=clamp(w.p.hp/w.p.maxHp,0,1);$('#hud-hp i').style.width=(f*100)+'%';$('#hud-hp span').textContent=Math.ceil(w.p.hp)+' health';
  }
}

/* ============ input ============ */
window.addEventListener('keydown',e=>{
  if(!Play.active)return;
  const tg=e.target;
  if(tg&&(tg.tagName==='INPUT'||tg.tagName==='TEXTAREA')){
    if(tg.id==='chat-in'){if(e.key==='Enter'){sendChat(tg.value);tg.value='';tg.blur()}else if(e.key==='Escape'){tg.blur()}}
    return;
  }
  if(e.code==='Escape'){if($('#modal-root').firstChild)closeModal();else Play.toggleMenu();return}
  if(e.code==='Enter'||e.key==='/'){e.preventDefault();In.keys={};In.typing=true;$('#chat-in').focus();return}
  if(e.code==='ShiftLeft'||e.code==='ShiftRight'){if(!e.repeat&&Play.ready&&!Play.paused)Lock.toggle();return}
  if(e.code==='KeyB'&&!e.repeat&&W&&W.lan&&Play.ready&&!Play.paused){Build.toggle();return}
  if(W&&W.lan&&Build.on&&Build.key(e))return;
  if(e.code==='Space'){In.jump=true;e.preventDefault()}
  if(e.code==='KeyF')In.act=true;
  In.keys[e.code]=true;if(e.code.indexOf('Arrow')===0)e.preventDefault();
});
window.addEventListener('keyup',e=>{
  if(e.code==='Space')In.jump=false;if(e.code==='KeyF')In.act=false;In.keys[e.code]=false;
});
window.addEventListener('blur',()=>In.reset());
function bindGameInput(){
  const el=$('#gview'),ci=$('#chat-in');
  ci.addEventListener('focus',()=>{In.typing=true;In.keys={};In.jump=false});
  ci.addEventListener('blur',()=>{In.typing=false});
  el.addEventListener('contextmenu',e=>e.preventDefault());
  el.addEventListener('pointerdown',e=>{
    if(!Play.active||!Play.ready||Play.paused||!W)return;
    Sfx.init();if(document.activeElement===ci)ci.blur();
    if(W.lan&&Build.on&&!(e.pointerType==='touch'&&e.clientX<innerWidth*.42&&In.joy.id===null)){Build.down(e);return}   // building: drag looks, click places
    if(document.pointerLockElement===el){if(W&&W.onTap&&Play.ready&&!Play.paused)W.onTap(e);return}
    if(Lock.on&&!IS_TOUCH&&Lock.fail<2){Lock.grab();return}   // if the browser refuses to capture the mouse, dragging still turns the camera
    if(e.pointerType==='touch'&&e.clientX<innerWidth*.42&&In.joy.id===null){
      In.joy={id:e.pointerId,x:0,y:0,bx:e.clientX,by:e.clientY};
      const j=$('#joy');j.style.display='block';j.style.left=e.clientX+'px';j.style.top=e.clientY+'px';$('#joy i').style.transform='none';
      el.setPointerCapture(e.pointerId);return;
    }
    if(In.cam.id===null){In.cam={id:e.pointerId,lx:e.clientX,ly:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now()};el.setPointerCapture(e.pointerId)}
  });
  el.addEventListener('pointermove',e=>{
    if(!W)return;
    if(W.lan&&Build.on&&In.joy.id!==e.pointerId){Build.move(e);return}
    if(document.pointerLockElement===el){const s=Settings.d.sens;W.cam.yaw-=e.movementX*.0032*s;W.cam.pitch=clamp(W.cam.pitch+e.movementY*.0028*s,.02,1.35);return}
    if(In.joy.id===e.pointerId){
      let dx=e.clientX-In.joy.bx,dy=e.clientY-In.joy.by;const m=Math.hypot(dx,dy),RR=55;if(m>RR){dx=dx/m*RR;dy=dy/m*RR}
      In.joy.x=dx/RR;In.joy.y=-dy/RR;$('#joy i').style.transform=`translate(${dx}px,${dy}px)`;
    }else if(In.cam.id===e.pointerId){
      const dx=e.clientX-In.cam.lx,dy=e.clientY-In.cam.ly;In.cam.lx=e.clientX;In.cam.ly=e.clientY;
      W.cam.yaw-=dx*.0055*Settings.d.sens;W.cam.pitch=clamp(W.cam.pitch+dy*.0045*Settings.d.sens,.02,1.35);
    }
  });
  const up=e=>{
    if(W&&W.lan&&Build.on&&Build.drag&&Build.drag.id===e.pointerId){Build.up(e);return}
    if(In.joy.id===e.pointerId){In.joy={id:null,x:0,y:0,bx:0,by:0};$('#joy').style.display='none'}
    else if(In.cam.id===e.pointerId){
      const c=In.cam;In.cam={id:null};
      if(e.type==='pointerup'&&Math.hypot(e.clientX-c.sx,e.clientY-c.sy)<8&&performance.now()-c.t<350&&W&&W.onTap&&Play.ready&&!Play.paused)W.onTap(e);
    }
  };
  el.addEventListener('pointerup',up);el.addEventListener('pointercancel',up);
  el.addEventListener('wheel',e=>{e.preventDefault();if(W&&W.lan&&Build.on)Build.cam.dist=clamp(Build.cam.dist*(1+e.deltaY*.0012),8,200);else if(W)W.cam.dist=clamp(W.cam.dist*(1+e.deltaY*.0012),6,60)},{passive:false});
  const hold=(id,on,off)=>{const b=$(id);b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);on()});['pointerup','pointercancel'].forEach(t=>b.addEventListener(t,off))};
  hold('#btn-jump',()=>{In.jump=true;Sfx.init()},()=>{In.jump=false});
  hold('#btn-act',()=>{In.act=true},()=>{In.act=false});
  $('#btn-lock').addEventListener('pointerdown',e=>{e.preventDefault();Lock.toggle()});
}

/* ============ play lifecycle ============ */
const Play={active:false,ready:false,paused:false,def:null,cam:null,tok:0,
  start(def){
    if(!R.init()){toastUI('This browser cannot run 3D games because WebGL is turned off.');return}
    Sfx.init();this.def=def;this.ready=false;this.paused=false;this.active=true;
    const tok=++this.tok;
    $('#app').classList.add('hidden');$('#game').classList.remove('hidden');
    this.showLoading(def);R.attach($('#gview'));
    setTimeout(()=>{
      if(this.tok!==tok)return;
      try{this.begin(def)}catch(err){console.error(err);this.stop();toastUI('This game failed to load.')}
    },60);
    setTimeout(()=>{if(this.tok===tok&&this.active){$('#loading').classList.add('out');setTimeout(()=>$('#loading').classList.add('hidden'),480);this.ready=true;Lock.sync()}},1400);
  },
  showLoading(def){
    const L=$('#loading');L.classList.remove('hidden','out');
    const tips=['Hold the jump button to keep hopping.','Drag to turn the camera. Scroll to zoom.','Press / to chat with other players.','Type /e dance in chat to show off.','Checkpoints save your spot.'];
    L.innerHTML=`<img alt="" src="${def.thumb||''}"><h2>${esc(def.title)}</h2><div class="by">By ${esc(def.creator||'IndieBlox')}</div><div class="bar"><i></i></div><div class="tip">${pick(tips)}</div>`;
  },
  begin(def){
    if(W)this.dispose();
    $('#hud-stats').innerHTML='';$('#chat-log').innerHTML='';$('#hud-board').innerHTML='';$('#hud-toast').classList.remove('show');
    $('#hud-hp').classList.add('hidden');$('#gresult').classList.add('hidden');$('#gmenu').classList.add('hidden');
    $('#hud-title').textContent=def.title;In.reset();
    const w=W=newWorld(def);
    this.cam=new THREE.PerspectiveCamera(65,R.w/R.h,.5,2000);
    R.onfit=(a,b)=>{if(this.cam){this.cam.aspect=a/b;this.cam.updateProjectionMatrix()}};R.fit();
    def.build(w,def.data);
    if(R.w<R.h*.9)w.cam.dist*=1.4;
    Net.begin(def,w);Lock.sync();
    const p=w.p;p.x=w.spawn.x;p.y=w.spawn.y;p.z=w.spawn.z;w.cam.tx=p.x;w.cam.ty=p.y+3.6;w.cam.tz=p.z;
    let nc=rand(6,12);
    w.ups.push(dt=>{nc-=dt;if(nc<=0){nc=rand(10,22);const al=w.bots.filter(b=>b.alive);if(al.length)chatAdd(pick(al).name,pick(BOT_LINES))}});
    w.bots.slice(0,2).forEach(b=>chatAdd('',b.name+' joined the game',true));
    $('#touch').classList.toggle('hidden',!IS_TOUCH);
    $('#btn-act').classList.toggle('hidden',!w.action);if(w.action)$('#btn-act').textContent=w.action.label;
    if(!def.test&&!def.noHistory){const pl=S.user.played,i=pl.indexOf(def.id);if(i>=0)pl.splice(i,1);pl.unshift(def.id);if(pl.length>12)pl.length=12;save()}
    Loop.fn=(dt,t)=>this.tick(dt,t);
  },
  tick(dt){
    const w=W;if(!w)return;
    if(Settings.d.fps){this.fa=(this.fa||0)+(Loop.raw||dt);this.fn=(this.fn||0)+1;if(this.fa>=.5){const e=$('#fps');if(e)e.textContent=Math.round(this.fn/this.fa)+' fps';this.fa=0;this.fn=0}}
    if(this.ready&&!this.paused){
      w.t+=dt;
      for(let i=0;i<w.ups.length;i++)w.ups[i](dt,w.t);
      stepPlayer(dt);updBots(dt);updFx(dt);
      if(In.act&&w.action&&w.p.alive)w.action.fn();
      hudTick(dt);
    }
    Net.update(dt);
    const p=w.p;
    if(p.alive){
      const sp=clamp(Math.hypot(p.vx,p.vz)/p.speed,0,1);
      p.av.rotation.y=angLerp(p.av.rotation.y,p.face,dt*14);
      animAvatar(p.av,w.t,sp>.05?sp:0,!p.on,w.pose||null,dt,p.emote);
      if(p.emote){p.emote.t+=dt;if(p.emote.t>3.2||(sp>.1&&p.emote.t>.25&&p.emote.type!=='atk'))p.emote=null}
    }
    p.av.position.set(p.x,p.y,p.z);
    updateCam(dt);R.render(w.scene,this.cam);
  },
  toggleMenu(){
    if(!$('#gresult').classList.contains('hidden')||!$('#loading').classList.contains('hidden'))return;
    this.paused=!this.paused;$('#gmenu').classList.toggle('hidden',!this.paused);
    $('#gm-title').textContent=this.def?this.def.title:'';$('#gm-sound').textContent=Sfx.on?'Sound on':'Sound off';
    const iv=$('#gm-invite');if(iv)iv.classList.toggle('hidden',!(Net.on&&!Net.p2p));
    const gf=$('#gm-friends');if(gf)gf.classList.toggle('hidden',!(Net.on&&Net.priv&&Net.owner));
    const gp=$('#gm-players');if(gp)gp.classList.toggle('hidden',!(Net.on&&!Net.p2p&&Account.token));
    const gmv=$('#gm-moveset');if(gmv)gmv.classList.toggle('hidden',!(W&&W.bt));
    const sm=$('#gm-savemap');if(sm)sm.classList.toggle('hidden',!Net.lan);
    const g2=$('#gm-p2p');if(g2)g2.classList.toggle('hidden',!(Net.on&&Net.p2p&&Net.p2p.role==='host'));
    if(this.paused){In.reset();Lock.release()}else Lock.sync();
  },
  showResult(msg,reward,extra){
    const b=$('#gres-box');
    b.innerHTML=`<h2>${esc(msg)}</h2><p>${reward?`You earned ${reward} IndieCoins. `:''}${extra?esc(extra):''}</p><div class="stack"><button class="btn play" data-act="g-keep">Keep exploring</button><button class="btn" data-act="g-again">Play again</button><button class="btn danger" data-act="g-leave">Leave game</button></div>`;
    $('#gresult').classList.remove('hidden');this.paused=true;In.reset();Lock.release();
  },
  restart(){
    const d=this.def,tok=++this.tok;this.ready=false;this.paused=false;
    $('#gresult').classList.add('hidden');$('#gmenu').classList.add('hidden');this.showLoading(d);
    try{this.begin(d)}catch(e){console.error(e);this.stop();return}
    setTimeout(()=>{if(this.tok===tok&&this.active){$('#loading').classList.add('out');setTimeout(()=>$('#loading').classList.add('hidden'),480);this.ready=true;Lock.sync()}},1100);
  },
  dispose(){const w=W;if(!w)return;disposeObj(w.scene);W=null},
  stop(){
    this.tok++;this.active=false;this.ready=false;this.paused=false;Loop.fn=null;R.onfit=null;Net.stop();Account.sync();this.dispose();R.detach();Lock.sync();
    $('#game').classList.add('hidden');$('#app').classList.remove('hidden');$('#loading').classList.add('hidden');In.reset();
    if(this.def&&this.def.onExit)this.def.onExit();
    route();
  }
};

/* ============ premade games ============ */
const RB8=['#ff4d5e','#ff8a3d','#ffd23f','#7ed957','#22c3c3','#3b8bff','#a45cff','#ff5cae'];

/* ---- 1. Sky Obby ---- */
function buildObby(w){
  w.setSky('#3d9cff','#cfeeff',120,700);w.boardLabel='Stage';w.botRate=.012;w.botMax=2;w.voidY=-70;
  w.plat(0,0,0,26,26,'#5bd16a',{},2);w.spawn={x:0,y:.3,z:0};
  w.label('Sky Obby',0,17,-6,{w:11});
  const cur={x:0,y:0,z:-13},TOTAL=5;let stage=0,shown=1,clock=0;
  const step=(sx,sz,dy,gap,dx,col,o)=>{
    cur.y+=dy;const cx=clamp(cur.x+dx,-16,16),cz=cur.z-gap-sz/2;
    const p=w.plat(cx,cur.y,cz,sx,sz,col,o||{});cur.x=cx;cur.z=cz-sz/2;return p;
  };
  const cp=()=>{stage++;const p=step(14,14,0,4,0,'#ffd23f',{kind:'checkpoint'});p.stage=stage;w.label('Checkpoint '+stage,p.x,p.y+8,p.z,{w:11});return p};
  // 1 stepping stones
  for(let i=0;i<7;i++)step(5,5,i%3===2?.6:0,3.8+(i%2)*.6,i%2?3:-3,RB8[i%8]);
  cp();
  // 2 lava beams and movers
  const z0=cur.z;
  step(2.4,26,0,4,0,'#a45cff');step(2.4,22,0,5,-3,'#ff5cae');step(2.4,22,0,5,4,'#3b8bff');
  w.box(0,-8,(z0+cur.z)/2,64,1,Math.abs(z0-cur.z)+12,'#ff5a1f',{kind:'kill'});
  step(30,8,0,4,0,'#22c3c3');
  for(let i=0;i<3;i++){const p=step(9,7,0,5,0,RB8[(i+2)%8]);w.mover(p,{ax:'x',amp:8,speed:.7+i*.15,phase:i*1.7})}
  step(30,8,0,5,0,'#22c3c3');
  cp();
  // 3 fading tiles
  const tiles=[];for(let i=0;i<8;i++)tiles.push(step(5,5,0,3.6,i%2?4:-4,'#ffb3c7'));
  w.update(dt=>{
    for(const p of tiles){
      if(p.st===undefined){p.st=0;p.tm=0}
      if(p.st===0&&w.p.ground===p){p.st=1;p.tm=.7}
      if(p.st===1){p.tm-=dt;p.mesh.visible=Math.floor(p.tm*14)%2===0;if(p.tm<=0){p.st=2;p.tm=2.6;p.solid=false;p.mesh.visible=false}}
      else if(p.st===2){p.tm-=dt;if(p.tm<=0){p.st=0;p.solid=true;p.mesh.visible=true}}
    }
  });
  cp();
  // 4 jump pad and spinner
  step(6,6,0,4,0,'#39d98a',{kind:'bounce'});
  step(12,12,10,7,0,'#3b8bff');
  const sp=step(24,24,0,4,0,'#5b6470');
  w.spinner(sp.x,cur.y+1.2,sp.z,22,1.4,1.2,'#ff4d5e',1.6);
  cp();
  // 5 finale
  for(let i=0;i<8;i++)step(6,6,1.6,3.5+(i%2)*.5,i%2?-2:2,RB8[i%8]);
  const fin=step(16,16,1.6,4,0,'#ffcf33',{kind:'finish'});
  w.label('Finish',fin.x,cur.y+9,fin.z,{w:12});
  w.box(fin.x,cur.y+3,fin.z,2,6,2,'#ffe27a',{kind:'decor',neon:true});
  // clouds
  const cr=rng(5);
  for(let i=0;i<46;i++){
    const zz=40-cr()*(Math.abs(cur.z)+120),sx=(cr()<.5?-1:1)*(38+cr()*80);
    w.box(sx,-50+cr()*70,zz,14+cr()*24,5+cr()*4,10+cr()*16,'#ffffff',{kind:'decor',studs:false,cast:false,recv:false});
  }
  w.addBots(3,{x:8,z:-5,r:5,y:0});w.bots.forEach(b=>b.score=1);
  w.boardVal=()=>shown;
  w.stat('stage','Stage','1/'+TOTAL);w.stat('time','Time','0:00');
  w.onCheckpoint=b=>{if(b.stage){shown=b.stage+1;w.stat('stage','Stage',shown+'/'+TOTAL);if(!b.paid){b.paid=true;w.reward(10)}}};
  w.onFinish=()=>{const nb=w.best('obby',+clock.toFixed(1),true);w.win('You finished Sky Obby!',150,'Time '+fmtTime(clock)+(nb?'. New personal best!':''))};
  w.update(dt=>{if(!w.won)clock+=dt;w.stat('time','Time',fmtTime(clock))});
  w.toast('Reach the golden pad',2200);
}

/* ---- 2. Rising Lava Escape ---- */
function buildLava(w){
  w.setSky('#2a1236','#ff8a5c',90,420);w.boardLabel='Height';w.voidY=-200;
  w.plat(0,0,0,34,34,'#3a4058',{},2);w.spawn={x:0,y:.3,z:12};
  w.label('Climb before the lava rises',0,15,15,{w:11});
  const N=40;let th=-Math.PI/2,thLast=th,lx=0,lz=0;
  for(let i=0;i<N;i++){
    const r=Math.max(14,22-i*.2),y=1.6+i*2.3;
    lx=Math.cos(th)*r;lz=Math.sin(th)*r;thLast=th;
    w.plat(lx,y,lz,6,6,hsl2hex(.52+i*.012,.7,.55),{},1);
    th+=9/r;
  }
  const topY=1.6+N*2.3;
  w.plat(lx-Math.sin(thLast)*13,topY,lz+Math.cos(thLast)*13,14,14,'#ffcf33',{kind:'finish'},1.2);
  w.box(0,55,0,9,110,9,'#2a2140',{kind:'decor',studs:false});
  const lt=blobTexture('#e0400a','rgba(255,190,60,1)','rgba(120,15,0,.9)',70,3);lt.repeat.set(70,70);
  const lava=new THREE.Mesh(new THREE.PlaneGeometry(700,700),new THREE.MeshBasicMaterial({map:lt}));
  lava.rotation.x=-Math.PI/2;w.scene.add(lava);
  let t0=0,lavaY=-8,lastN=-1;
  w.addBots(3,{x:-10,z:6,r:6,y:0});
  w.respawns.push(()=>{t0=0;lavaY=-8;lastN=-1;w.bots.forEach(b=>{b.rt=0})});
  w.boardVal=()=>Math.max(0,Math.floor(w.p.y));
  w.onFinish=()=>{const t=Math.max(0,t0-3);const nb=w.best('lava',+t.toFixed(1),true);w.win('You escaped the lava!',120,'Summit time '+fmtTime(t)+(nb?'. New personal best!':''))};
  w.update(dt=>{
    if(w.won)return;
    t0+=dt;const t=Math.max(0,t0-3);lavaY=-8+1.2*t+.0175*t*t;
    lava.position.y=lavaY;lt.offset.x+=dt*.01;lt.offset.y+=dt*.006;
    const n=Math.ceil(3-t0);
    if(t0<3&&n!==lastN){lastN=n;w.toast('Lava rises in '+n,900)}else if(t0>=3&&lastN!==0){lastN=0;w.toast('Climb!',1000)}
    if(w.p.alive&&w.p.y+.4<lavaY)w.die('lava');
    for(const b of w.bots)if(b.alive&&lavaY>b.y+.2)w.killBot(b,999);
    w.stat('h','Height',Math.max(0,Math.floor(w.p.y))+' / '+Math.floor(topY));
    w.stat('lava','Lava',String(Math.floor(lavaY)));
  });
}

/* ---- 3. Coin Islands ---- */
function buildIslands(w){
  w.setSky('#48b8ff','#e4f7ff',140,700);w.boardLabel='Coins';w.botRate=.1;w.botMax=48;w.voidY=-45;
  const TOTAL=60;let got=0,clock=0;
  const island=(cx,top,cz,sx,sz)=>{
    w.plat(cx,top,cz,sx,sz,'#6fd66f',{},1.2);
    w.box(cx,top-3.7,cz,sx*.86,5,sz*.86,'#8a5a3a',{kind:'decor',studs:false});
    w.box(cx,top-8.2,cz,sx*.6,4,sz*.6,'#6d4630',{kind:'decor',studs:false});
  };
  const tree=(x,top,z)=>{
    w.box(x,top+2,z,1.4,4,1.4,'#8a5a3a',{studs:false});
    w.box(x,top+5.5,z,5,4,5,'#3cbf5a',{kind:'decor',studs:false});
    w.box(x,top+8,z,3,2.5,3,'#4fd06b',{kind:'decor',studs:false});
  };
  island(0,0,0,44,44);w.spawn={x:0,y:.3,z:8};
  w.label('Collect all 60 coins',0,15,-6,{w:11});
  for(let k=0;k<10;k++){const q=k/10*Math.PI*2;w.coin(Math.cos(q)*14,2.6,Math.sin(q)*14)}
  [[-17,-17],[17,-17]].forEach(t=>tree(t[0],0,t[1]));
  [[30,3],[26,8],[32,2],[24,10],[28,5]].forEach((c,i)=>{
    const s=c[0],top=c[1],a=i*Math.PI*2/5+.3,ca=Math.cos(a),sa=Math.sin(a),m=Math.max(Math.abs(ca),Math.abs(sa));
    const ix=ca*78,iz=sa*78;island(ix,top,iz,s,s);
    const rb0=22/m+3.5,rb1=78-(s/2)/m-3.5,n=Math.max(3,Math.ceil((rb1-rb0)/6.2));
    for(let j=0;j<n;j++){const rr=rb0+(rb1-rb0)*j/(n-1);w.plat(ca*rr,top*(j+1)/(n+1),sa*rr,4,4,'#ffd23f',{},.8)}
    for(let k=0;k<8;k++){const q=k/8*Math.PI*2;w.coin(ix+Math.cos(q)*s*.3,top+2.6,iz+Math.sin(q)*s*.3)}
    w.coin(ix,top+2.6,iz);w.coin(ix,top+8,iz);
    tree(ix+s*.36,top,iz+s*.36);tree(ix-s*.36,top,iz-s*.36);
  });
  w.addBots(4,{x:0,z:0,r:17,y:0});
  w.stat('coins','Coins','0/'+TOTAL);w.stat('time','Time','0:00');
  w.onCoin=()=>{got++;w.score=got;w.stat('coins','Coins',got+'/'+TOTAL);w.reward(1,true);if(got===TOTAL){const nb=w.best('islands',+clock.toFixed(1),true);w.win('All 60 coins collected!',100,'Time '+fmtTime(clock)+(nb?'. New personal best!':''))}};
  w.update(dt=>{if(!w.won)clock+=dt;w.stat('time','Time',fmtTime(clock))});
}

/* ---- 4. Zombie Siege ---- */
function pushOutXZ(o,r,solids){
  for(const b of solids){
    if(b.y+b.hy<=.7||b.y-b.hy>4)continue;
    const cx=clamp(o.x,b.x-b.hx,b.x+b.hx),cz=clamp(o.z,b.z-b.hz,b.z+b.hz),dx=o.x-cx,dz=o.z-cz,d2=dx*dx+dz*dz;
    if(d2<r*r){
      if(d2>1e-6){const d=Math.sqrt(d2);o.x=cx+dx/d*r;o.z=cz+dz/d*r}
      else{const px=b.hx-Math.abs(o.x-b.x),pz=b.hz-Math.abs(o.z-b.z);if(px<pz)o.x+=(o.x<b.x?-1:1)*(px+r);else o.z+=(o.z<b.z?-1:1)*(pz+r)}
    }
  }
}
function buildZombie(w){
  w.setSky('#0b1020','#33406b',70,320);w.boardLabel='Kills';w.voidY=-30;w.cam.dist=18;
  w.p.maxHp=100;w.p.hp=100;w.hpBar(true);
  w.plat(0,0,0,130,130,'#3a3f47',{},2);w.spawn={x:0,y:.3,z:0};
  [[0,-65,132,2],[0,65,132,2],[-65,0,2,132],[65,0,2,132]].forEach(q=>w.box(q[0],5,q[1],q[2],10,q[3],'#20242b',{}));
  const moon=new THREE.Mesh(new THREE.SphereGeometry(20,20,16),new THREE.MeshBasicMaterial({color:'#f4f1d0',fog:false}));
  moon.position.set(-160,150,-220);w.scene.add(moon);
  const rr=rng(9);
  for(let i=0;i<16;i++){
    let x,z;do{x=(rr()-.5)*110;z=(rr()-.5)*110}while(Math.abs(x)<12&&Math.abs(z)<12);
    const s=rr()<.35?6:4;w.box(x,1.5,z,s,3,s,rr()<.5?'#8a5a3a':'#9a6a44',{});
  }
  const Z=[],tracers=[];let wave=0,state='wait',wt=4,kills=0,fireCd=0;
  const rm=k=>{const e=document.getElementById('st-'+k);if(e)e.remove()};
  const cfgZ=()=>({skin:'#7fbf5f',torso:pick(['#5b6b3c','#6a4a3a','#3a4a6a','#4a3a5a']),arms:'#7fbf5f',legs:'#33384f',face:'angry',hat:'none',back:'none',shirt:pick(['none','stripes','checker']),accent:'#ff5a5f'});
  const setFl=(z,on)=>{z.fl=on;z.mats.forEach(m=>m.emissive.setHex(on?0x992222:0))};
  const spawnWave=()=>{
    wave++;const n=Math.min(45,5+wave*3);
    for(let i=0;i<n;i++){
      const a=rand(0,6.283),r=rand(48,58),x=clamp(Math.cos(a)*r,-60,60),z=clamp(Math.sin(a)*r,-60,60);
      const av=buildAvatar(cfgZ());av.position.set(x,0,z);w.scene.add(av);
      const mats=[];av.traverse(o=>{if(o.isMesh)(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{if(m.emissive&&mats.indexOf(m)<0)mats.push(m)})});
      Z.push({av,x,z,hp:2+Math.floor(wave/3),spd:Math.min(10.5,4.5+wave*.55+rand(0,1.5)),dead:0,flash:0,ph:rand(0,6),face:0,mats,fl:false});
    }
    state='fight';rm('next');w.toast('Wave '+wave,1800);w.stat('wave','Wave',String(wave));
  };
  const killZ=z=>{z.dead=.9;kills++;w.score=kills;w.stat('kills','Kills',String(kills));w.reward(1,true);w.burst(z.x,2.5,z.z,['#7fbf5f','#5a9a3e','#33384f'],10,10,.8)};
  const fire=()=>{
    const p=w.p;if(!p.alive||fireCd>0)return;fireCd=.22;
    let best=null,bd=1e9;
    for(const z of Z){if(z.dead>0)continue;const d=Math.hypot(z.x-p.x,z.z-p.z);if(d<bd){bd=d;best=z}}
    const ox=p.x,oy=p.y+3.6,oz=p.z;let tx,ty,tz;
    if(best&&bd<75){
      tx=best.x;ty=2.8;tz=best.z;p.face=Math.atan2(tx-ox,tz-oz);best.hp-=1;best.flash=.12;
      const kd=bd||1;best.x+=(tx-ox)/kd*1.1;best.z+=(tz-oz)/kd*1.1;
      if(best.hp<=0)killZ(best);else Sfx.play('hit');
    }else{tx=ox+Math.sin(p.face)*40;ty=oy;tz=oz+Math.cos(p.face)*40}
    const g=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(ox,oy,oz),new THREE.Vector3(tx,ty,tz)]);
    const ln=new THREE.Line(g,new THREE.LineBasicMaterial({color:'#ffe066'}));w.scene.add(ln);tracers.push({ln,life:.07});Sfx.play('shoot');
  };
  w.action={label:'Fire',fn:fire};w.onTap=fire;
  w.stat('wave','Wave','0');w.stat('kills','Kills','0');
  w.onDie=()=>{const nb=w.best('zombie',wave,false);w.toast('Overrun on wave '+wave+(nb&&wave>0?'. New best!':''),2600)};
  w.respawns.push(()=>{
    for(const z of Z){w.scene.remove(z.av);disposeObj(z.av)}Z.length=0;
    wave=0;kills=0;state='wait';wt=4;w.score=0;w.stat('kills','Kills','0');w.stat('wave','Wave','0');
  });
  w.update((dt,t)=>{
    const p=w.p;fireCd-=dt;
    for(let i=tracers.length-1;i>=0;i--){const q=tracers[i];q.life-=dt;if(q.life<=0){w.scene.remove(q.ln);q.ln.geometry.dispose();q.ln.material.dispose();tracers.splice(i,1)}}
    if(!p.alive)return;
    if(state==='wait'){wt-=dt;w.stat('next','Next wave',Math.ceil(wt)+'s');if(wt<=0)spawnWave()}
    let alive=0;
    for(let i=Z.length-1;i>=0;i--){
      const z=Z[i];
      if(z.dead>0){
        z.dead-=dt;z.av.rotation.x=-Math.min(1.55,(.9-z.dead)*4);
        if(z.dead<=0){w.scene.remove(z.av);disposeObj(z.av);Z.splice(i,1)}
        continue;
      }
      alive++;
      const dx=p.x-z.x,dz=p.z-z.z,d=Math.hypot(dx,dz)||1;
      if(d>1.7){z.x+=dx/d*z.spd*dt;z.z+=dz/d*z.spd*dt}
      z.face=Math.atan2(dx,dz);
      if(d<2.6&&p.y<3.4){p.hp-=17*dt;if(p.hurt>.35){Sfx.play('hurt');w.flash()}p.hurt=0}
      pushOutXZ(z,.9,w.solids);
      if(z.flash>0){z.flash-=dt;if(!z.fl)setFl(z,true)}else if(z.fl)setFl(z,false);
      z.av.position.set(z.x,0,z.z);z.av.rotation.y=angLerp(z.av.rotation.y,z.face,dt*8);
      animAvatar(z.av,t+z.ph,.6,false,'zombie',dt,null);
    }
    for(let i=0;i<Z.length;i++){
      const a=Z[i];if(a.dead>0)continue;
      for(let j=i+1;j<Z.length;j++){
        const b=Z[j];if(b.dead>0)continue;
        const dx=b.x-a.x,dz=b.z-a.z,d2=dx*dx+dz*dz;
        if(d2<3.24&&d2>1e-4){const d=Math.sqrt(d2),o=(1.8-d)/2;a.x-=dx/d*o;a.z-=dz/d*o;b.x+=dx/d*o;b.z+=dz/d*o}
      }
    }
    if(p.hp<=0){w.die('overrun');return}
    if(p.hurt>4&&p.hp<p.maxHp)p.hp=Math.min(p.maxHp,p.hp+9*dt);
    if(state==='fight'&&alive===0){state='wait';wt=5;w.toast('Wave '+wave+' cleared! +20 coins',2200);w.reward(20,true)}
  });
}

/* ---- 5. Gem Factory Tycoon ---- */
function buildTycoon(w){
  w.setSky('#7fd0ff','#fff3d6',160,700);w.boardLabel='Cash';w.voidY=-40;w.cam.dist=22;
  w.plat(0,0,0,150,110,'#6fd66f',{},2);
  w.plat(0,.5,-6,70,36,'#cdd5df',{studs:false},.5);
  w.spawn={x:0,y:.3,z:20};
  w.label('Gem Factory',0,19,-11,{w:14});
  w.box(-2,1.25,-8,36,1.5,5,'#3a3f47',{studs:false});
  const sc=mkCanvas(128,32),sg=sc.getContext('2d');sg.fillStyle='#2b2f36';sg.fillRect(0,0,128,32);sg.fillStyle='#ffd23f';
  for(let i=0;i<4;i++){sg.beginPath();sg.moveTo(i*32,32);sg.lineTo(i*32+10,32);sg.lineTo(i*32+22,0);sg.lineTo(i*32+12,0);sg.closePath();sg.fill()}
  const bt=new THREE.CanvasTexture(sc);bt.wrapS=bt.wrapT=THREE.RepeatWrapping;bt.repeat.set(18,1);
  const belt=new THREE.Mesh(new THREE.PlaneGeometry(36,5),new THREE.MeshBasicMaterial({map:bt}));belt.rotation.x=-Math.PI/2;belt.position.set(-2,2.03,-8);w.scene.add(belt);
  const col=w.box(19.5,3.5,-8,7,7,7,'#ff8a3d',{studs:false});
  w.box(15.9,3,-8,.4,3.4,4,'#1a1208',{kind:'decor',studs:false});
  w.label('Collector',19.5,10,-8,{w:9});
  const ghost=new THREE.MeshBasicMaterial({color:'#9aa4b2',transparent:true,opacity:.28,depthWrite:false});
  const setGhost=p=>{p.mesh.material=ghost;p.solid=false};
  const unGhost=p=>{p.mesh.material=sideMat(p.color);p.solid=true};
  const drops=[];
  [-14,-8,-2,4].forEach((x,i)=>{
    w.box(x,6.5,-11.5,5,13,1,'#59606b',{studs:false});
    const hop=w.box(x,10.5,-8,4.6,3,4.6,RB8[(i*2)%8],{studs:false}),sp=w.box(x,7.4,-8,1.4,3.2,1.4,'#666c76',{studs:false});
    drops.push({x,hop,sp,on:i===0,t:rand(0,1)});if(i>0){setGhost(hop);setGhost(sp)}
  });
  const gems=[];let cash=0,beltSpd=6,interval=1.5,mult=1,pulse=0,sfxT=0,ownedN=0;
  const GEM_G=new THREE.OctahedronGeometry(.6),GEM_COL=['#ff4d5e','#3b8bff','#ffd23f','#7ed957','#a45cff','#22c3c3'];
  const gemMat=c=>MATS['g'+c]||(MATS['g'+c]=new THREE.MeshLambertMaterial({color:c,emissive:c,emissiveIntensity:.35}));
  const spawnGem=d=>{if(gems.length>70)return;const m=new THREE.Mesh(GEM_G,gemMat(pick(GEM_COL)));m.position.set(d.x,5.6,-8);w.scene.add(m);gems.push({m,x:d.x,y:5.6,vy:0})};
  const unlock=i=>{const d=drops[i];d.on=true;unGhost(d.hop);unGhost(d.sp)};
  const finish=()=>{
    w.box(0,1,25,6,2,6,'#ffcf33',{neon:true,kind:'decor'});w.box(0,5,25,2.4,6,2.4,'#ffe27a',{neon:true,kind:'decor'});
    w.label('Factory complete',0,11,25,{w:12});w.win('Factory complete!',250,'Every upgrade is installed.');
  };
  const ITEMS=[
    {n:'Dropper 2',c:100,f:()=>unlock(1)},{n:'Dropper 3',c:300,f:()=>unlock(2)},{n:'Dropper 4',c:800,f:()=>unlock(3)},
    {n:'Turbo belt',c:500,f:()=>{beltSpd*=1.6;interval*=.7}},{n:'Gem polisher x2',c:1200,f:()=>{mult*=2}},
    {n:'Rainbow gems x3',c:2500,f:()=>{mult*=3}},{n:'Golden trophy',c:6000,f:finish,last:true}
  ];
  ITEMS.forEach((it,i)=>{
    it.x=-27+i*9;it.cd=0;it.own=false;
    it.pad=w.box(it.x,.62,8,6,.25,6,'#39d98a',{kind:'decor',neon:true});
    it.lab=w.label(it.n+'\n$'+it.c,it.x,3.6,8,{w:6});
  });
  w.label('Step on a pad to buy',0,8,15,{w:8});
  const buy=it=>{
    if(it.last&&ownedN<ITEMS.length-1){w.toast('Buy every other upgrade first',1800);Sfx.play('err');return}
    if(cash>=it.c){
      cash-=it.c;it.own=true;ownedN++;it.pad.mesh.material=neonMat('#8a929c');it.lab.userData.set(it.n+'\nOwned');
      Sfx.play('buy');w.toast('Bought '+it.n,1500);it.f();
    }else{Sfx.play('err');w.toast('Need $'+Math.ceil(it.c-cash)+' more',1300)}
  };
  w.boardVal=()=>Math.floor(cash);
  w.addBots(3,{x:0,z:30,r:14,y:0});
  w.stat('cash','Cash','$0');w.stat('inc','Income','$0/s');
  w.update((dt,t)=>{
    sfxT-=dt;pulse=Math.max(0,pulse-dt);col.mesh.scale.setScalar(1+pulse*.4);
    bt.offset.x-=dt*beltSpd/2;
    for(const d of drops){if(!d.on)continue;d.t+=dt;if(d.t>=interval){d.t=0;spawnGem(d)}}
    for(let i=gems.length-1;i>=0;i--){
      const g=gems[i];
      if(g.y>2.6){g.vy-=60*dt;g.y=Math.max(2.6,g.y+g.vy*dt);if(g.y<=2.6)g.vy=0}else g.x+=beltSpd*dt;
      g.m.position.set(g.x,g.y,-8);g.m.rotation.y+=dt*3;
      if(g.x>=15.4){w.scene.remove(g.m);gems.splice(i,1);cash+=5*mult;pulse=.18;if(sfxT<=0){Sfx.play('coin');sfxT=.09}}
    }
    for(const it of ITEMS){it.cd-=dt;if(!it.own&&it.cd<=0&&w.p.alive&&w.inRect(it.x,8,3,3,3.4)){it.cd=1.1;buy(it)}}
    for(const b of w.bots){b.acc=(b.acc||0)+dt*rand(1.5,5)*(1+t/45);if(b.acc>=1){b.score+=Math.floor(b.acc);b.acc%=1}}
    const inc=drops.filter(d=>d.on).length*5*mult/interval;
    w.stat('cash','Cash','$'+Math.floor(cash).toLocaleString());w.stat('inc','Income','$'+inc.toFixed(1)+'/s');
  });
}

/* ---- community / studio games ---- */
function buildCustom(w,data){
  const themes={day:['#3d9cff','#cfeeff'],sunset:['#5b2a86','#ff9a5c'],night:['#0a0f24','#2d3b69'],space:['#02030a','#1a1440']};
  const th=themes[data.sky]||themes.day;w.setSky(th[0],th[1],140,700);w.voidY=-120;w.boardLabel='Coins';
  let total=0,got=0,hasFin=false,hasSpawn=false;
  data.parts.forEach((q,idx)=>{
    const c=q.c||'#8fa3b8';
    switch(q.k){
      case'coin':w.coin(q.x,q.y,q.z);total++;break;
      case'kill':w.box(q.x,q.y,q.z,q.sx,q.sy,q.sz,c,{kind:'kill'});break;
      case'bounce':w.box(q.x,q.y,q.z,q.sx,q.sy,q.sz,c,{kind:'bounce'});break;
      case'checkpoint':w.box(q.x,q.y,q.z,q.sx,q.sy,q.sz,c,{kind:'checkpoint'});break;
      case'finish':w.box(q.x,q.y,q.z,q.sx,q.sy,q.sz,c,{kind:'finish'});hasFin=true;break;
      case'mover':{const p=w.box(q.x,q.y,q.z,q.sx,q.sy,q.sz,c,{});w.mover(p,{ax:q.ax||'x',amp:q.amp==null?10:q.amp,speed:q.sp||1,phase:idx*.9});break}
      case'spawn':w.box(q.x,q.y,q.z,q.sx,q.sy,q.sz,c,{});w.spawn={x:q.x,y:q.y+q.sy/2+.2,z:q.z};hasSpawn=true;break;
      default:w.box(q.x,q.y,q.z,q.sx,q.sy,q.sz,c,{});
    }
  });
  if(!hasSpawn)w.spawn={x:0,y:3,z:0};
  if(total)w.stat('coins','Coins','0/'+total);
  w.onCoin=()=>{got++;w.score=got;w.stat('coins','Coins',got+'/'+total);w.reward(1,true);if(!hasFin&&got===total)w.win('You collected every coin!',40)};
  w.onFinish=()=>w.win('You beat '+data.title+'!',40);
  w.toast(data.title,1800);
}

const PREMADE=[
  {id:'sky-obby',title:'Sky Obby',genre:'Obby',art:'obby',creator:'IndieBlox',likes:94,active:1284,visits:2417000,build:buildObby,
    desc:'Race across the clouds. Cross lava beams, ride moving platforms, bounce off jump pads and jump the spinning bar. Every golden pad saves your progress. Reach the finish to earn coins.',
    how:['Move with W A S D or the arrow keys','Press Space to jump','Stand on a golden pad to set a checkpoint']},
  {id:'lava-rise',title:'Rising Lava Escape',genre:'Survival',art:'lava',creator:'IndieBlox',likes:91,active:962,visits:1850000,build:buildLava,
    desc:'The floor is lava, and it is climbing. Spiral up the tower before it catches you. The lava speeds up the longer you take, so plan your jumps and keep moving.',
    how:['Move with W A S D or the arrow keys','Press Space to jump','Reach the golden summit before the lava does']},
  {id:'coin-islands',title:'Coin Islands',genre:'Adventure',art:'coins',creator:'IndieBlox',likes:96,active:1540,visits:3102000,build:buildIslands,
    desc:'Five floating islands, sixty coins. Hop across the stepping stones, grab the high coins with a jump, and finish as fast as you can. Other players are exploring too.',
    how:['Move with W A S D or the arrow keys','Press Space to jump','Press / to chat, or type /e dance']},
  {id:'zombie-siege',title:'Zombie Siege',genre:'Shooter',art:'zombie',creator:'IndieBlox',likes:89,active:731,visits:1279000,build:buildZombie,
    desc:'Survive the night. Zombies pour in from the walls in bigger and faster waves. Use the crates for cover, keep moving, and shoot to auto-aim at the nearest zombie.',
    how:['Move with W A S D or the arrow keys','Click, tap, or hold F to fire at the nearest zombie','Stay out of reach and your health comes back']},
  {id:'gem-tycoon',title:'Gem Factory Tycoon',genre:'Tycoon',art:'tycoon',creator:'IndieBlox',likes:93,active:1109,visits:2260000,build:buildTycoon,
    desc:'Start with one gem dropper and build an empire. Gems ride the belt into the collector for cash. Walk onto a pad to buy more droppers and upgrades until the golden trophy is yours.',
    how:['Move with W A S D or the arrow keys','Walk onto a green pad to buy the upgrade','Buy every upgrade to unlock the trophy']},
  {id:'battle-arena',title:'Battle Arena',genre:'Fighting',art:'battle',creator:'IndieBlox',likes:95,active:1620,visits:2890000,build:buildBattle,
    desc:'Pick a moveset and fight. Learn your moves on the training dummy in the middle, then take on other players. Combos, blocks, dashes, four moves each and an ultimate that charges as you fight.',
    how:['Click or tap for your M1 combo','Press 1 2 3 4 for your moves and R for your ultimate','F blocks, Q dashes. Hit the dummy to practice']}
];

/* ============ Battle Arena: a fighting game with movesets, a training dummy in the middle, and a map to fight on ============ */
/* Controls: click or tap = M1 combo. 1 2 3 4 = moves. R = ultimate (fills as you fight). F = block. Q = dash.
   Everybody is authoritative for their own health. When your attack hits another player, your game tells theirs. */
const BT_M=(pose,dmg,rng,arc,kb,ky,stun,busy)=>({pose,busy:busy||.32,st:[{t:.08,do:'melee',dmg,rng,arc,kb,ky,stun}]});
const BT_P=(pose,dmg,kb,ky,stun,col,o)=>({pose,busy:.3,st:[Object.assign({t:.06,do:'proj',sp:62,life:.62,rad:1.1,dmg,kb,ky,stun,col},o||{})]});
const BT_MS=[
{id:'brawler',name:'Brawler',col:'#ff8a3d',info:'Heavy fists. Launchers, shockwaves and a meteor dive.',
 m1:[BT_M('punch',6,3.4,.9,4,0,.25),BT_M('punch',6,3.4,.9,4,0,.25),BT_M('hook',7,3.6,1.1,6,0,.3),BT_M('punch',11,3.8,1.1,20,7,.65,.5)],
 mv:[{n:'Uppercut',cd:6,busy:.6,pose:'punch',st:[{t:.05,do:'dash',sp:14,d:.12},{t:.15,do:'melee',dmg:12,rng:4.2,arc:1.2,kb:3,ky:17,stun:1}]},
     {n:'Ground Slam',cd:9,busy:1,pose:'slam',st:[{t:0,do:'hop',vy:42},{t:.62,do:'burst',r:9.5,dmg:15,kb:15,ky:9,stun:.8,fx:'shock',col:'#ff8a3d'}]},
     {n:'Rush Barrage',cd:11,busy:1.25,pose:'punch',st:[{t:0,do:'dash',sp:14,d:.9},{t:.1,do:'melee',dmg:4,rng:3.8,arc:1.4,kb:2,stun:.35,n:5,gap:.15},{t:.95,do:'melee',dmg:8,rng:4.2,arc:1.4,kb:20,ky:5,stun:.8}]},
     {n:'Heavy Cross',cd:7,busy:.85,pose:'hook',st:[{t:.38,do:'melee',dmg:18,rng:4.4,arc:1.2,kb:28,ky:5,stun:1.2}]}],
 ult:{n:'Meteor Fist',busy:1.9,pose:'slam',st:[{t:0,do:'hop',vy:66},{t:.75,do:'dive'},{t:1.1,do:'burst',r:14,dmg:40,kb:28,ky:13,stun:1.6,fx:'meteor',col:'#ff5a1f'}]}},
{id:'blade',name:'Blade',col:'#3b8bff',info:'A swordsman with slash waves, spins and a counter stance.',
 m1:[BT_M('slash',5,4.4,1.2,4,0,.22),BT_M('slash',5,4.4,1.2,4,0,.22),BT_M('slash',6,4.6,1.4,6,0,.3),BT_M('slash',10,4.8,1.5,18,6,.6,.5)],
 mv:[{n:'Wave Slash',cd:6,busy:.5,pose:'slash',st:[{t:.18,do:'proj',sp:52,life:.75,rad:1.7,dmg:11,kb:9,stun:.5,col:'#8fd3ff',pierce:1,wave:1}]},
     {n:'Spin Cut',cd:8,busy:.85,pose:'spin',st:[{t:.15,do:'burst',r:6.8,dmg:8,kb:8,stun:.4,fx:'shock',col:'#8fd3ff'},{t:.42,do:'burst',r:6.8,dmg:9,kb:14,ky:4,stun:.6,fx:'shock',col:'#8fd3ff'}]},
     {n:'Lunge',cd:8,busy:.7,pose:'slash',st:[{t:0,do:'dash',sp:34,d:.22},{t:.2,do:'melee',dmg:16,rng:4.6,arc:1,kb:16,ky:3,stun:.7}]},
     {n:'Riposte',cd:10,busy:.9,pose:'block',st:[{t:0,do:'parry',d:.9,counter:{dmg:22,kb:20,ky:6,stun:1}}]}],
 ult:{n:'Thousand Cuts',busy:2,pose:'slash',st:[{t:0,do:'tp',mode:'behind',rng:34},{t:.25,do:'melee',dmg:3,rng:5,arc:3.2,kb:0,stun:.35,n:9,gap:.12},{t:1.4,do:'burst',r:7,dmg:20,kb:24,ky:8,stun:1.2,fx:'shock',col:'#8fd3ff'}]}},
{id:'blaster',name:'Blaster',col:'#19c8d8',info:'Ranged energy. Bolts, a charged beam, a nova and a blink step.',
 m1:[BT_P('cast',4,3,0,.25,'#7df9ff'),BT_P('cast',4,3,0,.25,'#7df9ff'),BT_P('cast',4,3,0,.25,'#7df9ff'),BT_P('cast',8,16,5,.6,'#ffffff',{rad:1.6,sp:54})],
 mv:[{n:'Charge Beam',cd:9,busy:1,pose:'cast',st:[{t:.5,do:'beam',len:44,wid:3,dmg:20,kb:18,ky:5,stun:.9,col:'#7df9ff'}]},
     {n:'Nova',cd:8,busy:.7,pose:'cast',st:[{t:.25,do:'burst',r:9,dmg:12,kb:16,ky:7,stun:.7,fx:'shock',col:'#7df9ff'}]},
     {n:'Blink',cd:5,busy:.4,pose:'cast',st:[{t:0,do:'tp',mode:'fwd',dist:15},{t:.1,do:'burst',r:5,dmg:6,kb:10,ky:3,stun:.4,fx:'shock',col:'#7df9ff'}]},
     {n:'Homing Orbs',cd:10,busy:.8,pose:'cast',st:[{t:.15,do:'proj',sp:26,life:1.6,rad:1.2,dmg:8,kb:8,ky:2,stun:.5,col:'#c9b6ff',cnt:3,spread:.9,home:1}]}],
 ult:{n:'Orbital Strike',busy:1.9,pose:'cast',st:[{t:.2,do:'pillar',r:8,wait:.9,dmg:45,kb:22,ky:18,stun:1.7,col:'#7df9ff'}]}},
{id:'ninja',name:'Shadow',col:'#a45cff',info:'Fast and slippery. Shuriken, teleports and a whirlwind.',
 m1:[BT_M('kick',4,3.2,1.1,3,0,.2,.24),BT_M('kick',4,3.2,1.1,3,0,.2,.24),BT_M('punch',4,3.2,1.1,3,0,.2,.24),BT_M('kick',8,3.6,1.2,18,6,.55,.42)],
 mv:[{n:'Shuriken Fan',cd:6,busy:.5,pose:'cast',st:[{t:.1,do:'proj',sp:58,life:.55,rad:.9,dmg:4,kb:3,stun:.3,col:'#e0d0ff',cnt:5,spread:1.3}]},
     {n:'Shadow Step',cd:6,busy:.7,pose:'punch',st:[{t:0,do:'tp',mode:'behind',rng:28},{t:.15,do:'melee',dmg:10,rng:4,arc:2.4,kb:8,ky:4,stun:.6}]},
     {n:'Whirlwind',cd:9,busy:.9,pose:'spin',st:[{t:.1,do:'burst',r:6.2,dmg:5,kb:4,stun:.3,fx:'shock',col:'#a45cff'},{t:.25,do:'burst',r:6.2,dmg:5,kb:4,stun:.3},{t:.4,do:'burst',r:6.2,dmg:5,kb:4,stun:.3},{t:.6,do:'burst',r:6.6,dmg:7,kb:16,ky:6,stun:.8,fx:'shock',col:'#a45cff'}]},
     {n:'Smoke Bomb',cd:12,busy:.6,pose:'cast',st:[{t:.15,do:'burst',r:8.5,dmg:3,kb:2,stun:1.1,fx:'shock',col:'#555a66'}]}],
 ult:{n:'Phantom Barrage',busy:2.1,pose:'kick',st:[{t:0,do:'tp',mode:'behind',rng:34},{t:.2,do:'melee',dmg:4,rng:5,arc:3.2,kb:0,stun:.3,n:10,gap:.11},{t:1.35,do:'burst',r:7,dmg:18,kb:24,ky:9,stun:1.2,fx:'shock',col:'#a45cff'}]}}
];
const btAng=(a,b)=>{let d=a-b;while(d>Math.PI)d-=Math.PI*2;while(d<-Math.PI)d+=Math.PI*2;return d};
const BT_NAMES=['Rex','Zara','Kai','Mika','Ryu','Nova','Axel','Suki'];

function buildBattle(w){
  const p=w.p,sc=w.scene;
  w.setSky('#6fa8ff','#ffd9a8',130,700);w.boardLabel='KOs';w.voidY=-60;w.cam.dist=24;w.spawn={x:0,y:.3,z:34};
  p.maxHp=200;p.hp=200;p.speed=17;p.face=Math.PI;p.kbT=0;p.nomove=0;w.hpBar(true);
  /* ---- the map: a stone arena with a stage in the middle, broken pillars, crates and walls ---- */
  w.plat(0,0,0,124,124,'#6b7280',{},2);
  const disc=(r,c,y)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,.08,64),new THREE.MeshLambertMaterial({color:c}));m.position.set(0,y,0);m.receiveShadow=true;sc.add(m)};
  disc(44,'#7c8494',.05);disc(42,'#666e7c',.09);disc(26,'#8b93a3',.12);disc(24,'#727a88',.16);
  w.box(0,.3,0,14,.6,14,'#a3abb9',{});
  const PIL=[];[14,9,14,6,14,10,14,7].forEach((h,i)=>{const a=i/8*Math.PI*2,x=Math.cos(a)*31,z=Math.sin(a)*31;w.box(x,h/2,z,3.6,h,3.6,'#b6bcc8',{});w.box(x,h+.4,z,4.2,.8,4.2,'#9aa1af',{});PIL.push({x,z,r:2.6})});
  [[0,-61,124,2],[0,61,124,2],[-61,0,2,124],[61,0,2,124]].forEach(q=>w.box(q[0],7,q[1],q[2],14,q[3],'#4a4f5c',{}));
  for(let i=0;i<6;i++){const a=i/6*Math.PI*2+.5,x=Math.cos(a)*17,z=Math.sin(a)*17;w.box(x,1.6,z,4.5,3.2,4.5,'#8a5a3a',{});PIL.push({x,z,r:3.4})}
  [[-52,-52],[52,-52],[-52,52],[52,52]].forEach(q=>{w.box(q[0],3,q[1],1,6,1,'#5a3a1a',{});const f=new THREE.Mesh(new THREE.BoxGeometry(1.6,1.6,1.6),new THREE.MeshBasicMaterial({color:'#ff9a2a'}));f.position.set(q[0],6.8,q[1]);sc.add(f)});
  /* ---- the training dummy ---- */
  const dg=new THREE.Group();dg.position.set(0,.6,0);sc.add(dg);
  const dmats=[],dm=(g,geo,c,x,y,z)=>{const mat=new THREE.MeshLambertMaterial({color:c}),m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=true;g.add(m);dmats.push(mat);return m};
  dm(dg,new THREE.CylinderGeometry(.35,.5,3.4,10),'#8a5a3a',0,1.7,0);
  const body=new THREE.Group();body.position.y=3.4;dg.add(body);
  dm(body,new THREE.BoxGeometry(2.6,3.2,1.4),'#d9b77c',0,1.4,0);dm(body,new THREE.BoxGeometry(5.2,.7,.7),'#8a5a3a',0,2.4,0);dm(body,new THREE.SphereGeometry(1.05,14,10),'#e6c890',0,3.7,0);
  dm(body,new THREE.CylinderGeometry(.95,.95,.08,20),'#d62828',0,1.4,.72).rotation.x=Math.PI/2;
  const dtag=labelSprite('Training Dummy',{w:7});dtag.position.set(0,9.8,0);dg.add(dtag);
  const D={hp:1000,max:1000,t:0,down:0,wob:0,flash:0,shown:-1,x:0,y:0,z:0};
  /* ---- state ---- */
  const B=w.bt={ms:Store.get('bt:ms',0)|0,cd:[0,0,0,0],dashCd:0,ult:0,guard:100,busy:0,m1cd:0,combo:0,comboT:0,stun:0,block:false,parry:0,parryC:null,kills:0,picking:false,started:false,mvId:0,pv:{},D,bots:[]};
  B.ms=clamp(B.ms,0,BT_MS.length-1);
  const BOTS=B.bots,FX=[],PR=[],TM=[],NUM=[];
  const meC={kind:'me',get x(){return p.x},set x(v){p.x=v},get y(){return p.y},set y(v){p.y=v},get z(){return p.z},set z(v){p.z=v},get face(){return p.face},set face(v){p.face=v},id:0};
  const after=(t,fn)=>TM.push({t,fn});
  const fwd=c=>({x:Math.sin(c.face),z:Math.cos(c.face)});
  const alive=c=>c.kind==='me'?p.alive:c.kind==='bot'?(c.hp>0&&c.dead<=0):true;
  /* ---- visuals ---- */
  const bm=(c,o)=>new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o==null?.8:o,depthWrite:false});
  const fx=(m,life,upd)=>{sc.add(m);FX.push({m,life,max:life,upd})};
  const ring=(x,z,r,col,life,y)=>{const m=new THREE.Mesh(new THREE.RingGeometry(.82,1,40),bm(col,.85));m.rotation.x=-Math.PI/2;m.position.set(x,y||.3,z);fx(m,life||.35,(k)=>{const s=r*(.25+.75*(1-k));m.scale.set(s,s,s);m.material.opacity=.85*k})};
  const slash=(c,rng,arc,col)=>{const th=Math.atan2(-Math.cos(c.face),Math.sin(c.face));const m=new THREE.Mesh(new THREE.RingGeometry(rng*.45,rng,20,1,th-arc,arc*2),bm(col||'#ffffff',.75));m.rotation.x=-Math.PI/2;m.position.set(c.x,3.2,c.z);fx(m,.16,k=>{m.material.opacity=.75*k})};
  const beamFx=(c,len,wid,col)=>{const f=fwd(c),m=new THREE.Mesh(new THREE.BoxGeometry(wid,wid*.8,len),bm(col,.85));m.position.set(c.x+f.x*len/2,3.2,c.z+f.z*len/2);m.rotation.y=c.face;fx(m,.4,k=>{m.scale.set(k,k,1);m.material.opacity=.85*k})};
  const column=(x,z,r,col)=>{const m=new THREE.Mesh(new THREE.CylinderGeometry(r,r,70,20,1,true),bm(col,.55));m.position.set(x,35,z);fx(m,.45,k=>{m.scale.set(k,1,k);m.material.opacity=.55*k})};
  const numFx=(x,y,z,txt,col)=>{
    const c=mkCanvas(128,64),g=c.getContext('2d');g.font='700 40px Rubik,system-ui,sans-serif';g.textAlign='center';g.textBaseline='middle';g.lineWidth=7;g.strokeStyle='rgba(0,0,0,.7)';g.strokeText(txt,64,34);g.fillStyle=col||'#fff';g.fillText(txt,64,34);
    const s=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,depthTest:false}));s.scale.set(4,2,1);s.position.set(x,y,z);sc.add(s);NUM.push({s,life:.9,vy:5+Math.random()*2});
  };
  const snd=k=>{switch(k){case'swing':Sfx.noise(.05,.05);break;case'hit':Sfx.play('hit');Sfx.noise(.04,.05);break;case'boom':Sfx.tone(90,.3,'sawtooth',.09,-40);Sfx.noise(.15,.07);break;case'zap':Sfx.tone(900,.12,'square',.04,-500);break;case'ko':Sfx.tone(300,.4,'sawtooth',.07,-220);break;case'block':Sfx.tone(240,.06,'square',.06);break;case'ult':[440,660,880].forEach((f,i)=>Sfx.tone(f,.2,'triangle',.07,0,i*.08));break}};
  /* ---- shield bubble (shown while blocking) ---- */
  const shield=new THREE.Mesh(new THREE.SphereGeometry(3.4,16,12),bm('#8fd3ff',.28));shield.visible=false;sc.add(shield);
  /* ---- poses ---- */
  const pose=(c,name,dur)=>{const e={type:'atk',pose:name,t:0,dur:dur||.3};if(c.kind==='me')p.emote=e;else if(c.kind==='bot')c.atk=e;else if(c.q)c.q.atk=e};
  /* ---- targets and hits ---- */
  const tgts=att=>{
    const L=[];
    if(att.kind!=='me'&&p.alive&&p.inv<=0)L.push({t:'me',x:p.x,y:p.y,z:p.z,r:1.3});
    if(att.kind==='me'&&D.down<=0)L.push({t:'dummy',x:0,y:0,z:0,r:1.8});
    for(const b of BOTS)if(b!==att&&b.hp>0&&b.dead<=0)L.push({t:'bot',x:b.x,y:b.y,z:b.z,r:1.3,ref:b});
    if(att.kind==='me'&&Net.on)for(const q of Net.peers.values())if(q.alive)L.push({t:'net',x:q.x,y:q.y,z:q.z,r:1.3,ref:q});
    return L;
  };
  const nearest=(c,maxd)=>{let best=null,bd=maxd||40;for(const T of tgts(c)){const d=Math.hypot(T.x-c.x,T.z-c.z);if(d<bd){bd=d;best=T}}return best};
  const impulse=(c,vx,vz,dur,vy)=>{
    if(c.kind==='me'){p.kx=vx;p.kz=vz;p.kbT=dur;if(vy!=null)p.vy=vy}
    else if(c.kind==='bot'){c.kx=vx;c.kz=vz;c.kbT=dur;if(vy!=null)c.vy=vy}
  };
  const hitDummy=(h)=>{
    D.hp=Math.max(0,D.hp-h.dmg);D.t=0;D.wob=1;D.flash=.15;numFx(rand(-1,1),8+rand(0,1.5),rand(-1,1),String(Math.round(h.dmg)),'#ffd23f');
    w.burst(rand(-.6,.6),5,rand(-.6,.6),['#ffe066','#ffffff','#ff8a3d'],5,8,.4);snd('hit');
    if(D.hp<=0&&D.down<=0){D.down=4;w.reward(2,true);w.toast('Dummy destroyed! +2 coins',1800);w.burst(0,4,0,['#d9b77c','#8a5a3a','#e6c890'],26,14,1)}
  };
  const koBot=(b,att)=>{
    b.dead=4;b.hp=0;b.av.visible=false;snd('ko');w.burst(b.x,b.y+3,b.z,['#ff8a3d','#ffffff','#3b8bff'],20,14,1);
    if(att&&att.kind==='me'){B.kills++;w.score=B.kills;w.stat('kos','KOs',String(B.kills));w.reward(3,true);B.ult=Math.min(100,B.ult+20);w.toast('KO! +3 coins',1400)}
    else if(att&&att.kind==='bot')att.kills=(att.kills||0)+1;
  };
  const hitBot=(b,h,att)=>{
    if(b.parry>0&&b.parryC){b.parry=0;const c=b.parryC;b.parryC=null;numFx(b.x,7,b.z,'PARRY','#8fd3ff');snd('block');if(att){deliverTo(b,att,c)}return}
    let d=h.dmg;if(b.block&&b.stun<=0){d*=.2;h={...h,kx:h.kx*.3,kz:h.kz*.3,st:0};snd('block')}
    b.hp-=d;b.stun=Math.max(b.stun,h.st||0);b.mvId++;b.busy=0;b.kx=h.kx;b.kz=h.kz;b.kbT=.25;if(h.ky)b.vy=h.ky*1.6;
    numFx(b.x,7,b.z,String(Math.round(d)),'#ff8a8a');w.burst(b.x,b.y+3,b.z,['#ffffff','#ffd23f'],6,10,.4);snd('hit');b.lastBy=att;
    if(att&&att.kind==='me')B.ult=Math.min(100,B.ult+d*.5);
    if(b.hp<=0)koBot(b,att);
  };
  const deliverTo=(att,T,h)=>{ // used for parry counters aimed at an attacker object
    T=T.ref||T;
    const tx=T.x!=null?T.x:att.x,tz=T.z!=null?T.z:att.z;
    if(T===meC||T.kind==='me'){hurtMe({dmg:h.dmg,kx:0,kz:0,ky:h.ky||0,st:h.stun||0,from:att});return}
    if(T.kind==='bot')hitBot(T,{dmg:h.dmg,kx:(tx-att.x)*.2*h.kb/4,kz:(tz-att.z)*.2*h.kb/4,ky:h.ky,st:h.stun},att);
  };
  const deliver=(att,T,h)=>{
    const dx=T.x-att.x,dz=T.z-att.z,d=Math.hypot(dx,dz)||1,ux=dx/d,uz=dz/d;
    const hit={dmg:h.dmg,kx:ux*(h.kb||0),kz:uz*(h.kb||0),ky:h.ky||0,st:h.stun||0,from:att.ref||att};
    if(T.t==='dummy')hitDummy(hit);
    else if(T.t==='bot')hitBot(T.ref,hit,att);
    else if(T.t==='me')hurtMe(hit);
    else if(T.t==='net'){
      Net.send({t:'hit',to:T.ref.id,d:Math.round(h.dmg),kx:+hit.kx.toFixed(1),kz:+hit.kz.toFixed(1),ky:hit.ky,st:hit.st});
      numFx(T.x,7,T.z,String(Math.round(h.dmg)),'#ff8a8a');w.burst(T.x,T.y+3,T.z,['#ffffff','#ffd23f'],6,10,.4);snd('hit');
    }
    if(att.kind==='me')B.ult=Math.min(100,B.ult+h.dmg*.55);
  };
  const hurtMe=h=>{
    if(!p.alive||p.inv>0)return;
    if(B.parry>0&&B.parryC){const c=B.parryC;B.parry=0;B.parryC=null;numFx(p.x,7,p.z,'PARRY','#8fd3ff');snd('block');B.busy=0;p.inv=.4;
      const src=h.from&&h.from.kind==='bot'?h.from:nearest(meC,10);if(src){const T=src.t?src:{t:'bot',x:src.x,z:src.z,y:src.y,r:1.3,ref:src};deliver(meC,T,{dmg:c.dmg,kb:c.kb,ky:c.ky,stun:c.stun})}return}
    let d=h.dmg,kx=h.kx,kz=h.kz,st=h.st;
    if(B.block&&B.stun<=0){d*=.2;kx*=.3;kz*=.3;st=0;B.guard-=h.dmg*2.2;snd('block');w.burst(p.x,p.y+3,p.z,['#8fd3ff','#ffffff'],8,10,.35);
      if(B.guard<=0){B.guard=0;B.block=false;B.stun=.9;p.nomove=.9;numFx(p.x,8,p.z,'GUARD BREAK','#ffd23f')}}
    p.hp-=d;p.hurt=0;B.ult=Math.min(100,B.ult+d*.35);numFx(p.x,7.5,p.z,String(Math.round(d)),'#ff5a5a');
    if(st>0){B.stun=Math.max(B.stun,st);p.nomove=Math.max(p.nomove,st);meC.mvId=(meC.mvId||0)+1;B.busy=0;B.parry=0}
    p.kx=kx;p.kz=kz;p.kbT=.25;if(h.ky)p.vy=h.ky*1.6;snd('hit');
    if(p.hp<=0){
      p.hp=0;
      if(h.fromNet)Net.send({t:'ev',k:'ko',by:h.fromNet});
      if(h.from&&h.from.kind==='bot'){h.from.kills=(h.from.kills||0)+1}
      w.die('KO');
    }
  };
  /* ---- moves ---- */
  const stepDo=(c,s,live,mvId)=>{
    if(c.mvId!==mvId&&c.kind!=='net')return;
    if(!alive(c))return;
    const f=fwd(c);
    switch(s.do){
      case'melee':{
        const n=s.n||1,gap=s.gap||0;
        for(let i=0;i<n;i++)after(i*gap,()=>{
          if(c.mvId!==mvId&&c.kind!=='net')return;if(!alive(c))return;
          slash(c,s.rng,Math.min(s.arc,2.6),c.kind==='me'?BT_MS[B.ms].col:(c.col||'#ffffff'));snd('swing');
          if(!live)return;
          for(const T of tgts(c)){const dx=T.x-c.x,dz=T.z-c.z,d=Math.hypot(dx,dz);if(d>s.rng+T.r)continue;if(d>1.6&&Math.abs(btAng(Math.atan2(dx,dz),c.face))>s.arc)continue;deliver(c,T,s)}
        });break}
      case'burst':{
        const cx=c.x+(s.at==='front'?f.x*s.r*.6:0),cz=c.z+(s.at==='front'?f.z*s.r*.6:0);
        ring(cx,cz,s.r,s.col||'#fff',.4);if(s.fx==='meteor'){w.burst(cx,1,cz,['#ff5a1f','#ffd23f','#ffffff'],40,26,1)}snd(s.fx==='meteor'?'boom':'swing');
        if(!live)break;
        for(const T of tgts(c)){if(Math.hypot(T.x-cx,T.z-cz)<=s.r+T.r)deliver({x:cx,z:cz,kind:c.kind,ref:c},T,s)}
        break}
      case'proj':{
        const cnt=s.cnt||1,spread=s.spread||0;
        for(let i=0;i<cnt;i++){
          const off=cnt>1?(i/(cnt-1)-.5)*spread:0,a=c.face+off,vx=Math.sin(a)*s.sp,vz=Math.cos(a)*s.sp;
          const geo=s.wave?new THREE.BoxGeometry(3.4,.4,.5):new THREE.SphereGeometry(s.rad*.7,10,8);
          const m=new THREE.Mesh(geo,bm(s.col||'#fff',.95));m.position.set(c.x+f.x*2,3.4,c.z+f.z*2);if(s.wave)m.rotation.y=a+Math.PI/2;sc.add(m);
          PR.push({m,x:m.position.x,z:m.position.z,vx,vz,life:s.life,rad:s.rad,s,owner:c,live,hit:new Set(),home:!!s.home});
        }snd('zap');break}
      case'beam':{beamFx(c,s.len,s.wid,s.col||'#fff');snd('boom');if(!live)break;
        for(const T of tgts(c)){const dx=T.x-c.x,dz=T.z-c.z,along=dx*f.x+dz*f.z;if(along<0||along>s.len)continue;const perp=Math.abs(dx*f.z-dz*f.x);if(perp<=s.wid/2+T.r)deliver(c,T,s)}
        break}
      case'dash':if(live)impulse(c,f.x*s.sp,f.z*s.sp,s.d);break;
      case'hop':if(live)impulse(c,0,0,0,s.vy);break;
      case'dive':{if(!live)break;const T=nearest(c,60);let dx=f.x*14,dz=f.z*14;if(T){dx=T.x-c.x;dz=T.z-c.z}const d=Math.hypot(dx,dz)||1;impulse(c,dx/d*Math.min(50,d*2.4),dz/d*Math.min(50,d*2.4),.45,-80);break}
      case'tp':{if(!live)break;
        const T=s.mode==='behind'?nearest(c,s.rng||30):null;let nx,nz;
        if(T){const dx=T.x-c.x,dz=T.z-c.z,d=Math.hypot(dx,dz)||1;nx=T.x+dx/d*3;nz=T.z+dz/d*3;c.face=Math.atan2(-dx/d,-dz/d)}   // turn to face the target from behind
        else{nx=c.x+f.x*(s.dist||12);nz=c.z+f.z*(s.dist||12)}
        w.burst(c.x,c.y+3,c.z,['#a45cff','#ffffff','#7df9ff'],12,12,.5);
        c.x=clamp(nx,-56,56);c.z=clamp(nz,-56,56);if(c.kind==='me'){p.vx=p.vz=0}w.burst(c.x,c.y+3,c.z,['#a45cff','#ffffff','#7df9ff'],12,12,.5);break}
      case'pillar':{const T=nearest(c,60);const px=T?T.x:c.x+f.x*14,pz=T?T.z:c.z+f.z*14;ring(px,pz,s.r,s.col,s.wait,.4);
        after(s.wait,()=>{column(px,pz,s.r*.8,s.col);ring(px,pz,s.r,'#fff',.4);snd('boom');w.burst(px,2,pz,[s.col,'#fff'],30,24,1);
          if(!live)return;for(const T2 of tgts(c))if(Math.hypot(T2.x-px,T2.z-pz)<=s.r+T2.r)deliver({x:px,z:pz,kind:c.kind,ref:c},T2,s)});break}
      case'parry':if(live){if(c.kind==='me'){B.parry=s.d;B.parryC=s.counter}else{c.parry=s.d;c.parryC=s.counter}}break;
    }
  };
  const run=(c,def,live)=>{
    const id=c.kind==='net'?0:(c.mvId=(c.mvId||0)+1);
    pose(c,def.pose,def.busy);
    for(const s of def.st)after(s.t||0,()=>stepDo(c,s,live,id));
  };
  const faceAim=c=>{ // turn toward the closest enemy so swings land
    const T=nearest(c,16);if(T)c.face=Math.atan2(T.x-c.x,T.z-c.z);else if(c.kind==='me')c.face=w.cam.yaw+Math.PI;
  };
  const canAct=()=>p.alive&&B.stun<=0&&B.busy<=0&&!B.picking&&B.started;
  const announce=(slot,combo)=>{if(Net.on)Net.send({t:'ev',k:'mv',m:B.ms*10+slot,c:combo,x:+p.x.toFixed(1),y:+p.y.toFixed(1),z:+p.z.toFixed(1),r:+p.face.toFixed(2)})};
  const doM1=()=>{
    if(!canAct()||B.m1cd>0)return;const ms=BT_MS[B.ms];
    if(B.comboT<=0)B.combo=0;const i=B.combo,def=ms.m1[i];B.combo=(i+1)%4;B.comboT=.95;B.m1cd=def.busy;B.busy=def.busy*.8;p.nomove=Math.max(p.nomove,.14);
    faceAim(meC);const f=fwd(meC);if(!def.st[0].do||def.st[0].do==='melee')impulse(meC,f.x*7,f.z*7,.1);
    run(meC,def,true);announce(0,i);
  };
  const doMove=n=>{
    if(!canAct()||B.cd[n-1]>0)return;const def=BT_MS[B.ms].mv[n-1];
    B.cd[n-1]=def.cd;B.busy=def.busy;p.nomove=Math.max(p.nomove,def.busy*.6);faceAim(meC);run(meC,def,true);announce(n,0);
  };
  const doUlt=()=>{
    if(!canAct()||B.ult<100)return;const def=BT_MS[B.ms].ult;B.ult=0;B.busy=def.busy;p.nomove=Math.max(p.nomove,def.busy*.5);p.inv=Math.max(p.inv,.4);faceAim(meC);snd('ult');
    w.toast(def.n+'!',1200);run(meC,def,true);announce(5,0);
  };
  const doDash=()=>{
    if(!p.alive||B.dashCd>0||B.stun>0||B.picking||!B.started)return;
    const a=In.axis(),sy=Math.sin(w.cam.yaw),cy=Math.cos(w.cam.yaw);let dx=a.x*cy-a.z*sy,dz=-a.x*sy-a.z*cy;
    if(Math.hypot(dx,dz)<.1){const f=fwd(meC);dx=-f.x;dz=-f.z}
    const d=Math.hypot(dx,dz)||1;B.dashCd=2.2;B.busy=Math.min(B.busy,.05);meC.mvId=(meC.mvId||0)+1;B.parry=0;impulse(meC,dx/d*38,dz/d*38,.17);p.inv=Math.max(p.inv,.24);
    w.burst(p.x,p.y+2,p.z,['#ffffff','#c9d3ff'],8,9,.35);Sfx.tone(500,.1,'sine',.05,600);
  };
  w.onTap=()=>doM1();
  const press=n=>{if(n==='m1')doM1();else if(n==='ult')doUlt();else if(n==='dash')doDash();else if(n>=1&&n<=4)doMove(+n)};
  /* ---- hurt by the network ---- */
  w.onNet=m=>{
    if(m.t==='hit'){hurtMe({dmg:clamp(m.d,0,60),kx:m.kx||0,kz:m.kz||0,ky:m.ky||0,st:m.st||0,fromNet:m.from,from:{kind:'net'}});return}
    if(m.t!=='ev')return;
    if(m.k==='ko'){if(m.by===Net.id){B.kills++;w.score=B.kills;w.stat('kos','KOs',String(B.kills));w.reward(3,true);B.ult=Math.min(100,B.ult+25);w.toast('KO! +3 coins',1400);snd('ko')}return}
    if(m.k==='mv'){
      const q=Net.peers.get(m.id);if(!q)return;const ms=BT_MS[(m.m/10)|0],slot=m.m%10;if(!ms)return;
      const def=slot===0?ms.m1[(m.c|0)%4]:slot===5?ms.ult:ms.mv[slot-1];if(!def)return;
      const caster={kind:'net',x:m.x,y:m.y,z:m.z,face:m.r,q,col:ms.col};run(caster,def,false);
    }
  };
  /* ---- bots (single player only) ---- */
  const mkBot=i=>{
    const cfg=randomAvatar(),name=BT_NAMES[(i*3+Math.floor(rand(0,8)))%8]+' (bot)';
    const av=buildAvatar(cfg,name);sc.add(av);
    const b={kind:'bot',name,av,x:0,y:0,z:0,face:0,hp:180,max:180,dead:0,stun:0,busy:0,vx:0,vz:0,vy:0,kx:0,kz:0,kbT:0,ms:i%BT_MS.length,cd:[0,0,0,0],m1cd:0,combo:0,comboT:0,think:rand(.3,1),blk:0,parry:0,parryC:null,mvId:0,kills:0,atk:null,ph:rand(0,6),tag:av.userData.tag,shown:-1,col:BT_MS[i%BT_MS.length].col};
    spawnBot(b);BOTS.push(b);return b;
  };
  const spawnBot=b=>{const a=rand(0,6.283);b.x=Math.cos(a)*rand(26,44);b.z=Math.sin(a)*rand(26,44);b.y=0;b.hp=b.max;b.dead=0;b.stun=0;b.busy=0;b.av.visible=true;b.ms=Math.floor(rand(0,BT_MS.length));b.col=BT_MS[b.ms].col;b.cd=[0,0,0,0];b.mvId++;b.parry=0};
  const botBrain=(b,dt)=>{
    const ms=BT_MS[b.ms];b.think-=dt;b.m1cd-=dt;b.comboT-=dt;for(let i=0;i<4;i++)b.cd[i]-=dt;
    if(b.stun>0||b.busy>0)return;
    const T=nearest(b,70);if(!T){b.vx=b.vz=0;return}
    const dx=T.x-b.x,dz=T.z-b.z,d=Math.hypot(dx,dz)||1;b.face=Math.atan2(dx,dz);
    const ranged=b.ms===2,want=ranged?16:3.2;
    if(d>want+1){b.vx=dx/d*11;b.vz=dz/d*11}else if(ranged&&d<9){b.vx=-dx/d*10;b.vz=-dz/d*10}else{b.vx=b.vz=0}
    if(b.think<=0){
      b.think=rand(.35,.9);
      const r=Math.random(),free=[];for(let i=0;i<4;i++)if(b.cd[i]<=0)free.push(i);
      if(r<.5&&b.m1cd<=0&&(d<ms.m1[0].st[0].rng+2||(ranged&&d<40))){if(b.comboT<=0)b.combo=0;const def=ms.m1[b.combo];b.combo=(b.combo+1)%4;b.comboT=1;b.m1cd=def.busy+.12;b.busy=def.busy;run(b,def,true)}
      else if(r<.82&&free.length&&d<(ranged?40:11)){const i=pick(free),def=ms.mv[i];b.cd[i]=def.cd*1.4;b.busy=def.busy;run(b,def,true)}
      else if(r<.9){b.blk=rand(.3,.8)}
      else if(r<.95&&d>8){const a=b.face+pick([-1.2,1.2]);b.kx=Math.sin(a)*30;b.kz=Math.cos(a)*30;b.kbT=.16}
    }
  };
  const botStep=(b,dt,t)=>{
    if(b.dead>0){b.dead-=dt;if(b.dead<=0)spawnBot(b);return}
    b.stun-=dt;b.busy-=dt;b.blk-=dt;b.parry-=dt;b.block=b.blk>0;
    botBrain(b,dt);
    let vx=b.vx,vz=b.vz;if(b.stun>0||b.busy>0){vx=0;vz=0}
    if(b.kbT>0){b.kbT-=dt;vx=b.kx;vz=b.kz;const dc=Math.pow(.03,dt);b.kx*=dc;b.kz*=dc}
    b.x=clamp(b.x+vx*dt,-57,57);b.z=clamp(b.z+vz*dt,-57,57);
    b.vy-=196*dt;b.y+=b.vy*dt;if(b.y<=0){b.y=0;b.vy=0}
    for(const q of PIL){const dx=b.x-q.x,dz=b.z-q.z,d=Math.hypot(dx,dz);if(d<q.r+1.1){const k=(q.r+1.1)/(d||1);b.x=q.x+dx*k;b.z=q.z+dz*k}}
    const dd=Math.hypot(b.x,b.z);if(dd<8&&b.y<.6){b.y=Math.max(b.y,.6)}   // the stage
    b.av.position.set(b.x,b.y,b.z);b.av.rotation.y=angLerp(b.av.rotation.y,b.face,dt*12);
    const sp=clamp(Math.hypot(b.vx,b.vz)/12,0,1);let em=null;if(b.atk){b.atk.t+=dt;if(b.atk.t<b.atk.dur)em=b.atk;else b.atk=null}
    animAvatar(b.av,t+b.ph,b.busy>0?0:sp,b.y>.7,null,dt,em);
    const s=Math.ceil(b.hp);if(s!==b.shown&&b.tag){b.shown=s;b.tag.userData.set(b.name+'\n'+s+' / '+b.max)}
  };
  for(let i=0;i<3;i++)mkBot(i);
  w.onOnline=()=>{for(const b of BOTS){sc.remove(b.av);disposeObj(b.av)}BOTS.length=0};
  /* ---- HUD ---- */
  const old=$('#bt');if(old)old.remove();
  const hud=document.createElement('div');hud.id='bt';
  const btn=(k,lab,key)=>`<button class="bt-b" data-bt="${k}"><i class="cdv"></i><b>${lab}</b><small>${key}</small></button>`;
  hud.innerHTML=`<div class="bt-top"><span id="bt-name"></span></div><div class="bt-ult" id="bt-ult"><i></i><span>Ultimate</span></div>
    <div class="bt-row">${btn('m1','M1','Click')}${btn('1','1','1')}${btn('2','2','2')}${btn('3','3','3')}${btn('4','4','4')}${btn('ult','R','R')}${btn('block','Block','F')}${btn('dash','Dash','Q')}</div>`;
  $('#hud').appendChild(hud);
  const setHud=()=>{const ms=BT_MS[B.ms];$('#bt-name').textContent=ms.name;hud.style.setProperty('--c',ms.col);
    hud.querySelectorAll('[data-bt]').forEach(e=>{const k=e.dataset.bt;let nm='';if(k==='m1')nm='M1 combo';else if(k==='ult')nm=ms.ult.n;else if(k==='block')nm='Block';else if(k==='dash')nm='Dash';else nm=ms.mv[+k-1].n;e.querySelector('b').textContent=nm;e.title=nm})};
  const onDown=e=>{const b=e.target.closest('[data-bt]');if(!b)return;e.preventDefault();const k=b.dataset.bt;if(k==='block'){B.holdBlock=true}else press(k==='m1'||k==='ult'||k==='dash'?k:+k)};
  const onUp=e=>{B.holdBlock=false};
  hud.addEventListener('pointerdown',onDown);window.addEventListener('pointerup',onUp);
  w.def.onExit=()=>{hud.remove();window.removeEventListener('pointerup',onUp)};
  /* ---- picking a moveset ---- */
  const pickHTML=()=>`<h2>Choose your moveset</h2><p>Each one has four moves and an ultimate. You can change it any time from the menu.</p><div class="bt-cards">${BT_MS.map((m,i)=>`<button class="bt-card${i===B.ms?' on':''}" data-act="bt-pick" data-i="${i}" style="--c:${m.col}"><b>${m.name}</b><span>${m.info}</span><ul>${m.mv.map((x,j)=>`<li><kbd>${j+1}</kbd> ${x.n}</li>`).join('')}<li><kbd>R</kbd> ${m.ult.n}</li></ul></button>`).join('')}</div><div class="bt-help">Click or tap = M1 combo &middot; 1 2 3 4 = moves &middot; R = ultimate &middot; F = block &middot; Q = dash</div><div class="acts"><button class="btn brand" data-act="bt-go">Fight</button></div>`;
  B.pick=()=>{B.picking=true;Play.paused=true;$('#gmenu').classList.add('hidden');In.reset();Lock.release();modal(pickHTML(),'bt-modal')};
  B.setMs=i=>{B.ms=clamp(i|0,0,BT_MS.length-1);Store.set('bt:ms',B.ms);B.cd=[0,0,0,0];B.ult=Math.min(B.ult,100);B.combo=0;setHud();$$('.bt-card').forEach(c=>c.classList.toggle('on',+c.dataset.i===B.ms))};
  B.go=()=>{B.picking=false;closeModal();B.started=true;Play.paused=false;setHud();Lock.sync()};
  B.press=press;B.cast=press;
  /* ---- reset when you are back in the ring ---- */
  w.respawns.push(()=>{
    B.cd=[0,0,0,0];B.dashCd=0;B.busy=0;B.stun=0;B.guard=100;B.block=false;B.parry=0;B.combo=0;meC.mvId=(meC.mvId||0)+1;p.nomove=0;p.kbT=0;p.emote=null;
    const a=rand(0,6.283);p.x=Math.cos(a)*36;p.z=Math.sin(a)*36;p.y=.3;p.face=Math.atan2(-p.x,-p.z);B.ult=Math.min(B.ult,60);
  });
  w.onDie=()=>{p.dead=3;w.toast('Knocked out! Back in a moment.',1600);snd('ko')};
  w.stat('kos','KOs','0');
  /* ---- every frame ---- */
  w.update((dt,t)=>{
    if(!B.started&&!B.picking&&Play.ready){B.pick();return}
    for(let i=TM.length-1;i>=0;i--){const q=TM[i];q.t-=dt;if(q.t<=0){TM.splice(i,1);try{q.fn()}catch(e){console.error(e)}}}
    for(let i=0;i<4;i++)if(B.cd[i]>0)B.cd[i]-=dt;
    B.dashCd-=dt;B.busy-=dt;B.m1cd-=dt;B.comboT-=dt;if(B.stun>0)B.stun-=dt;if(B.parry>0)B.parry-=dt;
    // keys (edge detected)
    const K=In.keys,pv=B.pv;
    for(const [code,n] of [['Digit1',1],['Digit2',2],['Digit3',3],['Digit4',4],['Numpad1',1],['Numpad2',2],['Numpad3',3],['Numpad4',4]])if(K[code]&&!pv[code])doMove(n);
    if(K.KeyR&&!pv.KeyR)doUlt();if(K.KeyQ&&!pv.KeyQ)doDash();
    for(const c of ['Digit1','Digit2','Digit3','Digit4','Numpad1','Numpad2','Numpad3','Numpad4','KeyR','KeyQ'])pv[c]=!!K[c];
    B.block=p.alive&&B.stun<=0&&B.busy<=0&&!B.picking&&(!!K.KeyF||!!B.holdBlock)&&B.guard>0;
    p.speed=B.block?8:17;
    if(B.block){B.guard=Math.max(0,B.guard-2*dt)}else B.guard=Math.min(100,B.guard+22*dt);
    shield.visible=B.block;if(B.block)shield.position.set(p.x,p.y+3,p.z);
    if(p.emote&&p.emote.type==='atk'&&p.emote.t>=p.emote.dur)p.emote=null;
    // projectiles
    for(let i=PR.length-1;i>=0;i--){
      const q=PR[i];q.life-=dt;
      if(q.home&&q.live){const T=nearest({kind:q.owner.kind,x:q.x,z:q.z,face:0},40);if(T){const dx=T.x-q.x,dz=T.z-q.z,d=Math.hypot(dx,dz)||1,sp=Math.hypot(q.vx,q.vz);q.vx+=(dx/d*sp-q.vx)*Math.min(1,dt*4);q.vz+=(dz/d*sp-q.vz)*Math.min(1,dt*4)}}
      q.x+=q.vx*dt;q.z+=q.vz*dt;q.m.position.x=q.x;q.m.position.z=q.z;
      let dead=q.life<=0||Math.abs(q.x)>58||Math.abs(q.z)>58;
      if(!dead)for(const P2 of PIL)if(Math.hypot(q.x-P2.x,q.z-P2.z)<P2.r+.3){dead=true;break}
      if(!dead&&q.live)for(const T of tgts(q.owner)){
        if(q.hit.has(T.ref||T.t))continue;
        if(Math.hypot(T.x-q.x,T.z-q.z)<=q.rad+T.r){q.hit.add(T.ref||T.t);deliver({x:q.x-q.vx*.05,z:q.z-q.vz*.05,kind:q.owner.kind,ref:q.owner},T,q.s);w.burst(q.x,3.4,q.z,[q.s.col,'#fff'],8,10,.4);if(!q.s.pierce){dead=true;break}}
      }
      if(dead){sc.remove(q.m);q.m.geometry.dispose();q.m.material.dispose();PR.splice(i,1)}
    }
    // effects, numbers
    for(let i=FX.length-1;i>=0;i--){const e=FX[i];e.life-=dt;const k=Math.max(0,e.life/e.max);if(e.upd)e.upd(k);if(e.life<=0){sc.remove(e.m);if(e.m.geometry)e.m.geometry.dispose();if(e.m.material)e.m.material.dispose();FX.splice(i,1)}}
    for(let i=NUM.length-1;i>=0;i--){const n=NUM[i];n.life-=dt;n.s.position.y+=n.vy*dt;n.s.material.opacity=Math.min(1,n.life*2);if(n.life<=0){sc.remove(n.s);n.s.material.map.dispose();n.s.material.dispose();NUM.splice(i,1)}}
    // dummy
    if(D.down>0){D.down-=dt;dg.rotation.x=-Math.min(1.45,(4-D.down)*3.4);dg.position.y=.6+Math.max(0,1.2-(4-D.down)*3);if(D.down<=0){D.hp=D.max;dg.rotation.x=0;dg.position.y=.6;D.shown=-1}}
    else{D.t+=dt;if(D.t>6&&D.hp<D.max)D.hp=Math.min(D.max,D.hp+D.max*.5*dt)}
    D.wob=Math.max(0,D.wob-dt*2.4);body.rotation.z=Math.sin(t*34)*D.wob*.22;D.flash=Math.max(0,D.flash-dt);dmats.forEach(m=>m.emissive.setHex(D.flash>0?0x992222:0));
    const ds=Math.ceil(D.hp);if(ds!==D.shown){D.shown=ds;dtag.userData.set('Training Dummy\n'+ds+' / '+D.max)}
    // bots
    for(const b of BOTS)botStep(b,dt,t);
    // hud
    const ms=BT_MS[B.ms];
    hud.querySelectorAll('[data-bt]').forEach(e=>{const k=e.dataset.bt;let cd=0,max=1;
      if(k==='m1'){cd=B.m1cd;max=.4}else if(k==='dash'){cd=B.dashCd;max=2.2}else if(k==='ult'){cd=B.ult>=100?0:1;max=1}else if(k!=='block'){cd=B.cd[+k-1];max=ms.mv[+k-1].cd}
      const f=clamp(cd/max,0,1);e.style.setProperty('--cd',f);e.classList.toggle('rdy',k==='ult'&&B.ult>=100);e.classList.toggle('on',k==='block'&&B.block)});
    const u=$('#bt-ult');if(u){u.firstChild.style.width=B.ult+'%';u.classList.toggle('full',B.ult>=100)}
    if(!p.alive)B.busy=0;
  });
  setHud();
}
const BattleActs={
  'bt-pick':t=>{if(W&&W.bt)W.bt.setMs(+t.dataset.i)},
  'bt-go':()=>{if(W&&W.bt)W.bt.go()},
  'g-moveset':()=>{if(W&&W.bt)W.bt.pick()}
};

/* ============ multiplayer client ============ */
const EMOTES=[null,'dance','wave','cheer'];
const Net={
  ws:null,on:false,everOn:false,want:false,tries:0,id:0,room:'',cap:0,game:'',chatOn:true,off:0,w:null,def:null,
  wantRoom:'',wantPriv:false,priv:false,owner:false,p2p:null,lastRx:0,lan:null,ownerId:0,lanSecret:'',
  peers:new Map(),clock:0,acc:0,hb:0,sig:'',stats:{online:0,games:{}},statsOk:false,statsT:0,
  get guests(){return !!(this.statsOk&&this.stats&&this.stats.guests)},   // the server lets people in with just a name (LAN starters)

  /* where is the server? same origin by default, or <meta name="ib-server">, or localStorage */
  base(){
    if(STANDALONE)return '';
    const m=document.querySelector('meta[name="ib-server"]');
    const s=((m&&m.content)||'').trim()||Store.get('server','');
    if(s)return String(s).replace(/\/+$/,'');
    return(location.protocol==='http:'||location.protocol==='https:')?location.origin:'';
  },
  wsUrl(){const b=this.base();return b?b.replace(/^http/,'ws')+'/ws':''},
  api(p){const b=this.base();return b?b.replace(/^ws/,'http')+p:''},
  now(){return performance.now()/1000+this.off},
  isOwner(){return !!(this.lan&&this.ownerId&&this.ownerId===this.id)},

  /* ---- joining a game ---- */
  begin(def,w){
    this.w=w;this.def=def;
    if(def.test){this.leave();return}
    if(def.p2p){   // direct connection: the host's browser is the room, no server involved
      if(this.on&&this.p2p&&this.game===def.id){this.attach(w);return}
      this.leave();this.game=def.id;this.p2p=def.p2p;this.wantRoom='';this.wantPriv=false;this.want=true;this.tries=0;this.everOn=false;this.open();return;
    }
    if(def.lanRoom){   // a LAN room: an editable map with an owner, kept by the IndieBlox program
      if(!this.wsUrl()){this.solo(w);return}
      if(!Account.token&&!this.guests){this.leave();this.solo(w,'Log in to play with other players.');return}
      this.leave();this.game='lanmap';this.wantRoom=def.lanRoom;this.lanSecret=def.secret||'';this.wantPriv=false;this.want=true;this.tries=0;this.everOn=false;this.open();return;
    }
    if(!this.wsUrl()){this.solo(w);return}
    if(!Account.token&&!this.guests){this.leave();this.solo(w,Net.statsOk?'Log in to play with other players. You are playing solo.':undefined);return}
    if(this.on&&this.game===def.id){this.attach(w);return}
    this.leave();this.game=def.id;this.wantRoom=def.room||'';this.wantPriv=!!def.priv;
    this.want=true;this.tries=0;this.everOn=false;this.open();
  },
  open(){
    let ws;
    try{ws=this.p2p?(this.p2p.role==='host'?P2PHost.selfSocket():this.p2p.sock):new WebSocket(this.wsUrl())}catch(e){this.failed();return}
    this.ws=ws;this.lastRx=performance.now();
    ws.onopen=()=>this.sendJoin();
    ws.onmessage=e=>{this.lastRx=performance.now();let m;try{m=JSON.parse(e.data)}catch(x){return}try{this.msg(m)}catch(x){console.error(x)}};
    ws.onclose=()=>{if(this.ws===ws)this.closed()};
    ws.onerror=()=>{};
    if(this.p2p&&ws.readyState===1)setTimeout(()=>{if(this.ws===ws&&ws.onopen)ws.onopen()},0);   // already open
  },
  sendJoin(){
    this.send({t:'join',game:this.game,token:Account.token,name:S.user.name,av:S.user.avatar,room:this.wantRoom||undefined,priv:this.wantPriv||undefined,secret:this.lanSecret||undefined});
  },
  send(o){if(this.ws&&this.ws.readyState===1)this.ws.send(JSON.stringify(o))},
  solo(w,msg){
    this.want=false;this.on=false;msg=msg||'Solo mode. The multiplayer server is not reachable.';
    if(STANDALONE)return;
    setTimeout(()=>{if(this.w===w&&W===w&&!this.on&&!(w.def&&w.def.test))w.toast(msg,3600)},1700);
  },
  failed(){this.want=false;this.on=false;if(this.p2p){this.p2pLost(false);return}if(this.w)this.solo(this.w)},
  p2pLost(was){
    const w=this.w;this.p2p=null;
    if(was&&w&&W===w){chatAdd('','The host left. You are playing alone now.',true);w.toast('The host left. You are playing alone now.',3600)}
  },
  closed(){
    const was=this.on;this.ws=null;this.on=false;this.clearPeers();
    if(!this.want)return;
    if(this.p2p){this.want=false;this.p2pLost(was);return}
    if(!this.everOn){this.failed();return}
    if(this.tries<4){
      this.tries++;this.wantRoom=this.room||'';this.wantPriv=false;
      if(was)chatAdd('','Connection lost. Reconnecting...',true);
      setTimeout(()=>{if(this.want&&!this.on&&!this.ws&&W)this.open()},1000*this.tries);
    }else{this.want=false;chatAdd('','Connection lost. You are playing solo now.',true)}
  },
  leave(){
    this.want=false;const ws=this.ws;this.ws=null;this.on=false;this.game='';this.room='';this.priv=false;this.owner=false;this.p2p=null;this.lan=null;this.ownerId=0;this.lanSecret='';this.clearPeers();
    if(ws){try{ws.close()}catch(e){}}
  },
  stop(){if(typeof Build!=='undefined')Build.off();this.leave();P2PHost.stop();P2PUI.discard();this.w=null;this.def=null},

  /* ---- messages from the server ---- */
  msg(m){
    switch(m.t){
      case'welcome':{
        const first=!this.everOn;
        this.id=m.id;this.room=m.room;this.cap=m.cap;this.priv=!!m.priv;this.owner=!!m.mine;this.chatOn=m.chat!==false;
        this.wantRoom='';this.wantPriv=false;
        this.off=m.st-performance.now()/1000;this.on=true;this.everOn=true;this.tries=0;
        this.clearPeers();this.enterOnline(first);
        if(first&&m.chat==='friends')chatAdd('','Chat is friends-only on this server. Add friends to talk to them.',true);
        for(const p of m.players)this.addPeer(p);
        this.pill();
        if(m.lan){this.lan=m.lan;this.ownerId=m.lan.owner.id;const L=this.w&&this.w.lan;
          if(L){L.ownerName=m.lan.owner.name||m.lan.owner.orig;L.awayEnd=m.lan.owner.away?performance.now()+m.lan.owner.away*1000:0;L.load(m.lan.map)}
          if(first&&this.w)this.w.toast(this.isOwner()?'You are the owner. Press B to build.':'Owner: '+(m.lan.owner.name||m.lan.owner.orig)+(m.lan.owner.away?' (away)':''),3400)}
        if(first&&this.priv&&this.w)this.w.toast('Private room. Invite friends from the menu, or copy the invite link.',3600);
        break}
      case'join':this.addPeer(m.p);chatAdd('',m.p.name+' joined the game',true);this.pill();break;
      case'leave':{const q=this.peers.get(m.id);if(q){chatAdd('',q.name+' left the game',true);this.dropMesh(q);this.peers.delete(m.id);this.pill()}break}
      case'snap':for(const a of m.d)this.snap(a);break;
      case'chat':chatAdd(m.name,m.m);break;
      case'ev':case'hit':if(this.w&&this.w.onNet)this.w.onNet(m);break;
      case'map':if(this.lan&&this.w&&this.w.lan)this.w.lan.apply(m);break;
      case'owner':this.ownerMsg(m);break;
      case'invited':if(this.w)this.w.toast('Invited '+m.name,1800);break;
      case'err':this.err(m);break;
    }
  },
  err(m){
    const c=m.code,w=this.w;
    if(this.game==='lanmap'&&(c==='full'||c==='noroom')){if(w)w.toast(m.m||'That room is not available.',4200);this.want=false;return}
    if(c==='notowner'){if(w)w.toast(m.m,2400);return}
    if(this.p2p&&(c==='full'||c==='noroom')){if(w)w.toast(m.m||'Could not join.',3600);this.want=false;this.p2pLost(false);try{this.ws.close()}catch(e){}return}
    if(c==='auth'){
      this.want=false;Account.clear();refreshTop();
      if(w)this.solo(w,'Your login ended. Log in again to play with others.');
    }else if(c==='session'){
      this.want=false;chatAdd('','You joined from another tab, so this one was disconnected.',true);
    }else if(this.wantRoom&&(c==='full'||c==='noroom'||c==='private')){
      this.wantRoom='';this.wantPriv=false;
      if(w)w.toast((m.m||'That room is not available.')+' Joining a public room instead.',3600);
      this.sendJoin();
    }else if(w)w.toast(m.m||'Server error',2600);
  },
  ownerMsg(m){
    const L=this.w&&this.w.lan;if(!L||!this.lan)return;
    let msg;
    if(m.state==='away'){this.ownerId=0;L.ownerName=m.name;L.awayEnd=performance.now()+(m.secs||30)*1000;msg=m.name+' left. In '+(m.secs||30)+' seconds the next player becomes owner.'}
    else{this.ownerId=m.id;L.ownerName=m.name;L.awayEnd=0;const me=m.id===this.id;
      msg=m.state==='back'?(me?'You are the owner again.':m.name+' is the owner again.'):(me?'You are now the owner. Press B to build.':m.name+' is now the owner.')}
    chatAdd('',msg,true);this.w.toast(msg,3600);Sfx.play('coin');
    if(!this.isOwner()&&Build.on)Build.off();
  },
  enterOnline(clear){
    const w=this.w;if(!w)return;
    if(clear){const l=$('#chat-log');if(l)l.innerHTML=''}
    for(const b of w.bots){w.scene.remove(b.av);disposeObj(b.av)}w.bots.length=0;
    if(w.onOnline)w.onOnline();
  },
  attach(w){
    this.w=w;this.enterOnline(true);
    for(const q of this.peers.values()){this.dropMesh(q);this.mk(q)}
    this.pill();
  },
  pill(){if(this.w&&this.on)this.w.stat('players','Players',(this.peers.size+1)+'/'+this.cap)},

  /* ---- remote players ---- */
  mk(q){
    const av=buildAvatar(q.av,q.name);av.position.set(q.x,q.y,q.z);av.rotation.y=q.tr;av.visible=q.alive;
    this.w.scene.add(av);q.mesh=av;
  },
  dropMesh(q){if(q.mesh){if(q.mesh.parent)q.mesh.parent.remove(q.mesh);disposeObj(q.mesh);q.mesh=null}},
  clearPeers(){for(const q of this.peers.values())this.dropMesh(q);this.peers.clear()},
  addPeer(p){
    if(!this.w||this.peers.has(p.id))return;
    const s=p.s||[],f=s[5]==null?1:s[5];
    const q={id:p.id,name:p.name,av:p.av,mesh:null,x:s[0]||0,y:s[1]||0,z:s[2]||0,tx:s[0]||0,ty:s[1]||0,tz:s[2]||0,tr:s[3]||0,v:s[4]||0,
      alive:!!(f&1),air:!!(f&2),e:s[6]||0,sc:s[7]||0,ph:Math.random()*6};
    this.mk(q);this.peers.set(p.id,q);
  },
  snap(a){
    const q=this.peers.get(a[0]);if(!q)return;
    q.tx=a[1];q.ty=a[2];q.tz=a[3];q.tr=a[4];q.v=a[5];q.alive=!!(a[6]&1);q.air=!!(a[6]&2);q.e=a[7];q.sc=a[8];
  },
  rows(){return[...this.peers.values()].map(q=>({name:q.name,val:q.sc,owner:!!this.lan&&q.id===this.ownerId}))},

  /* ---- per frame ---- */
  update(dt){
    const w=this.w;if(!w||w!==W)return;
    try{
      this.clock+=dt;const k=1-Math.exp(-dt*14);
      for(const q of this.peers.values()){
        const m=q.mesh;if(!m)continue;
        if(Math.abs(q.tx-q.x)>30||Math.abs(q.tz-q.z)>30||Math.abs(q.ty-q.y)>30){q.x=q.tx;q.y=q.ty;q.z=q.tz}
        else{q.x+=(q.tx-q.x)*k;q.y+=(q.ty-q.y)*k;q.z+=(q.tz-q.z)*k}
        m.position.set(q.x,q.y,q.z);m.rotation.y=angLerp(m.rotation.y,q.tr,dt*12);m.visible=q.alive;
        if(q.alive)animAvatar(m,this.clock+q.ph,q.v>.05?q.v:0,q.air,w.pose||null,dt,(q.atk&&(q.atk.t+=dt)<q.atk.dur?q.atk:(q.e?{type:EMOTES[q.e]}:null)));
      }
      if(this.on){this.acc+=dt;if(this.acc>=.08){this.acc=0;this.sendState(w)}}
      if(this.p2p&&this.p2p.role==='client'&&this.on&&performance.now()-this.lastRx>12000){try{this.ws.close()}catch(e){}}
    }catch(e){console.error(e)}
  },
  sendState(w){
    const p=w.p,sp=clamp(Math.hypot(p.vx,p.vz)/p.speed,0,1);
    const yaw=p.av.rotation.y,r=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    const msg={t:'s',x:+p.x.toFixed(2),y:+p.y.toFixed(2),z:+p.z.toFixed(2),r:+r.toFixed(2),v:+sp.toFixed(2),
      f:(p.alive?1:0)|(p.alive&&!p.on?2:0),e:p.emote?Math.max(0,EMOTES.indexOf(p.emote.type)):0,sc:Math.floor(w.boardVal?w.boardVal():w.score)||0};
    const sig=msg.x+','+msg.y+','+msg.z+','+msg.r+','+msg.v+','+msg.f+','+msg.e+','+msg.sc;
    this.hb++;if(sig===this.sig&&this.hb<7)return;
    this.hb=0;this.sig=sig;this.send(msg);
  },
  chat(m){this.send({t:'chat',m})},
  invite(name){this.send({t:'invite',to:name})},

  /* ---- live player counts ---- */
  async refreshStats(){
    const u=this.api('/api/stats');if(!u||Date.now()-this.statsT<8000)return false;this.statsT=Date.now();
    try{const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw 0;const j=await r.json();const first=!this.statsOk;this.stats=j;this.statsOk=true;return first}
    catch(e){this.statsOk=false;return false}
  },
  count(id){return this.statsOk?(this.stats.games[id]||0):null}
};

/* ============ community games (shared through the server) ============ */
const Community={list:[],ok:false,t:0,miss:new Set(),full:{},
  sig(a){return a.map(g=>g.id+'|'+g.title+'|'+g.n).join(';')},
  async refresh(){
    const u=Net.api('/api/games');if(!u||Date.now()-this.t<8000)return false;this.t=Date.now();
    try{
      const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw 0;const j=await r.json(),a=j.games||[];
      const changed=!this.ok||this.sig(a)!==this.sig(this.list);this.list=a;this.ok=true;return changed;
    }catch(e){const ch=this.ok;this.ok=false;return ch}
  },
  async fetchOne(id){
    const u=Net.api('/api/games/'+id);if(!u)return null;
    try{
      const r=await fetch(u,{cache:'no-store'});if(!r.ok)return null;const g=await r.json();
      this.full[id]=g;const i=this.list.findIndex(x=>x.id===id);if(i>=0)this.list[i]=g;else this.list.push(g);return g;
    }catch(e){return null}
  },
  async push(g){
    if(!Account.token)return false;
    try{const r=await Account.call('POST','/api/games',{id:g.id,title:g.title,desc:g.desc,sky:g.sky,parts:g.parts},12000);return r.ok}catch(e){return false}
  },
  async drop(g){
    if(!Account.token)return false;
    try{const r=await Account.call('DELETE','/api/games/'+g.id,undefined,8000);return r.ok}catch(e){return false}
  }
};
function setPublished(g,on){
  g.pub=on;save();
  if(on){
    if(!Account.token){toastUI(Net.base()?'Published on this device only. Log in to share it with everyone.':'Published on this device only. The server is not reachable.');return}
    Community.push(g).then(ok=>{
      toastUI(ok?'Published. Everyone on this server can play it.':'Published on this device only. The server is not reachable.');
      if(ok){Community.t=0;Community.refresh()}
    });
  }else{
    if(Account.token)Community.drop(g).then(()=>{Community.t=0;Community.refresh()});
    toastUI('Unpublished');
  }
}

/* ============ accounts ============ */
const Account={token:'',user:null,online:false,syncT:0,pendingJoin:'',
  load(){const a=Store.get('auth',null);if(a&&a.token){this.token=a.token;this.user=a.name}},
  async call(method,path,body,timeout){
    const u=Net.api(path);if(!u)throw new Error('offline');
    const h={};if(body!==undefined)h['content-type']='application/json';if(this.token)h.authorization='Bearer '+this.token;
    const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),timeout||8000);
    try{
      const r=await fetch(u,{method,headers:h,body:body!==undefined?JSON.stringify(body):undefined,signal:ctl.signal,cache:'no-store'});
      let j=null;try{j=await r.json()}catch(e){}
      return{ok:r.ok,status:r.status,data:j||{}};
    }finally{clearTimeout(tm)}
  },
  async ping(){
    const u=Net.api('/api/stats');if(!u)return false;
    try{
      const ctl=new AbortController(),tm=setTimeout(()=>ctl.abort(),2500);
      const r=await fetch(u,{cache:'no-store',signal:ctl.signal});clearTimeout(tm);
      if(!r.ok)throw 0;Net.stats=await r.json();Net.statsOk=true;Net.statsT=Date.now();return true;
    }catch(e){return false}
  },
  async init(){
    this.load();
    if(!this.token||!Net.base())return;
    try{
      const r=await this.call('GET','/api/me',undefined,3500);
      if(r.status===401){this.clear();return}
      if(r.ok){this.online=true;this.adopt(r.data.name,r.data.profile)}
    }catch(e){/* server unreachable: keep the saved copy on this device */}
  },
  adopt(name,profile){S.user=Object.assign(freshUser(name),profile,{name});Store.set('user',S.user)},
  clear(){this.token='';this.user=null;this.online=false;Store.set('auth',null);Friends.stop();Friends.reset()},
  profileOf(u){return{coins:u.coins,avatar:u.avatar,owned:u.owned,played:u.played,votes:u.votes,favs:u.favs,best:u.best}},
  finish(r){
    if(!r.ok)return{error:(r.data&&r.data.error)||'Something went wrong. Try again.'};
    this.token=r.data.token;this.user=r.data.name;this.online=true;
    Store.set('auth',{token:this.token,name:this.user});this.adopt(r.data.name,r.data.profile);S.head='';
    return{ok:true};
  },
  async register(name,pw){
    return this.finish(await this.call('POST','/api/register',{username:name,password:pw,profile:S.user?this.profileOf(S.user):undefined}));
  },
  async login(name,pw){return this.finish(await this.call('POST','/api/login',{username:name,password:pw}))},
  queueSync(){if(!this.token||!S.user)return;clearTimeout(this.syncT);this.syncT=setTimeout(()=>this.sync(),3000)},
  async sync(){
    clearTimeout(this.syncT);if(!this.token||!S.user)return;
    try{const r=await this.call('PUT','/api/me',{profile:this.profileOf(S.user)},6000);if(r.status===401)this.clear()}catch(e){}
  }
};
document.addEventListener('visibilitychange',()=>{if(document.hidden)Account.sync()});

/* ============ friends ============ */
const Friends={list:[],recent:[],sig:'',timer:0,busy:false,heads:{},
  reset(){this.list=[];this.recent=[];this.sig='';this.badge()},
  start(){this.stop();if(!Account.token)return;this.timer=setInterval(()=>{if(!document.hidden)this.refresh()},12000);this.refresh()},
  stop(){clearInterval(this.timer);this.timer=0},
  async refresh(){
    if(!Account.token||this.busy)return false;this.busy=true;
    try{
      const r=await Account.call('GET','/api/friends',undefined,6000);
      if(r.status===401){Account.clear();refreshTop();return false}
      return r.ok?this.apply(r.data):false;
    }catch(e){return false}finally{this.busy=false}
  },
  apply(d){
    const sig=JSON.stringify([d.friends,d.recent]),ch=sig!==this.sig;
    const before=new Set(this.list.filter(f=>f.invite).map(f=>f.name));
    this.sig=sig;this.list=d.friends||[];this.recent=d.recent||[];
    for(const f of this.list)if(f.invite&&!before.has(f.name))toastUI(f.name+' invited you to a private room. Open Friends to join.');
    this.badge();
    if(ch&&location.hash.indexOf('#/friends')===0)paintFriends();
    return ch;
  },
  badge(){$$('[data-n=friends]').forEach(a=>a.classList.toggle('has-dot',this.list.some(f=>f.invite)))},
  act(action,name){return Account.call('POST','/api/friends',{action,name})}
};
async function friendDo(action,name){
  const r=await Friends.act(action,name).catch(()=>null);
  if(!r||!r.ok){toastUI((r&&r.data&&r.data.error)||'Could not reach the server.');return}
  Friends.apply(r.data);
}
function friendsHTML(){
  if(!Account.token&&!Net.statsOk)return `<h1 class="h1">Friends</h1><div class="empty" style="margin-top:14px"><b>Friends need the IndieBlox server</b>Accounts, friends and joining games work when IndieBlox is opened through its server. This is the offline copy. Start it with <b>Start IndieBlox</b> from the download and it opens the right address for you.<br><a class="btn brand" href="#/together" style="margin-top:12px">Play together without a server</a></div>`;
  if(!Account.token)return `<h1 class="h1">Friends</h1><div class="empty" style="margin-top:14px"><b>Log in to play with friends</b>Add friends by username, see which game they are in, and join them.<br><button class="btn brand" data-act="auth-open">Log in or create an account</button></div>`;
  return `<h1 class="h1">Friends</h1><form class="fr-add" id="fr-form"><input id="fr-name" type="text" maxlength="18" placeholder="Search players by username" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="Friend username"><button class="btn brand" type="submit">Add friend</button></form><p class="fr-hint">Search a name, then tap Add friend. You are friends right away.</p><div id="fr-results"></div><div class="fr-msg" id="fr-msg" role="status"></div><div id="fr-body"></div>`;
}
function personRow(p,btn,sub){
  return `<div class="fr-row"><span class="fr-av" data-av="${esc(JSON.stringify(p.av))}" data-name="${esc(p.name)}"></span><div class="fr-info"><div class="fr-name">${esc(p.name)}</div>${sub?`<div class="fr-st ${sub[1]||''}">${sub[0]}</div>`:''}</div><div class="fr-btns">${btn}</div></div>`;
}
const addBtn=(p,isF)=>isF?'<button class="btn sm" disabled>Friends</button>':`<button class="btn sm brand" data-act="fr-add-name" data-n="${esc(p.name)}">Add friend</button>`;
function paintFriends(){
  const b=$('#fr-body');if(!b||Play.active)return;
  let h='';
  if(Friends.recent.length)h+=`<h2 class="fr-h">Players you have played with</h2><div class="fr-list">${Friends.recent.map(p=>personRow(p,addBtn(p,false))).join('')}</div>`;
  h+='<h2 class="fr-h">Your friends</h2>';
  if(!Friends.list.length)h+='<div class="empty"><b>No friends yet</b>Search a username above, or add someone from the players you have played with.</div>';
  else h+=`<div class="fr-list">${Friends.list.map(f=>{
    const g=f.game?findGame(f.game):null;
    const gt=esc(g?g.title:'a game');
    const st=f.status==='game'?(f.invite?'Invited you to a private room in '+gt:(f.priv&&!f.room)?'In a private room':'Playing '+gt):f.status==='online'?'Online':'Offline';
    let btn='';
    if(f.status==='game')btn=f.canJoin?`<button class="btn sm brand" data-act="fr-join" data-game="${esc(f.game)}" data-room="${esc(f.room)}">Join</button>`:`<button class="btn sm" disabled>${f.n>=f.cap?'Full':'Private'}</button>`;
    return personRow(f,btn+`<button class="btn sm icon" data-act="fr-remove" data-n="${esc(f.name)}" aria-label="Remove ${esc(f.name)}">${ico('x',16)}</button>`,[st,f.status]);
  }).join('')}</div>`;
  b.innerHTML=h;fillHeads();
}
async function addFriend(name){
  const r=await Friends.act('add',name).catch(()=>null);
  if(!r||!r.ok){toastUI((r&&r.data&&r.data.error)||'Could not reach the server.');return false}
  Friends.apply(r.data);toastUI('You and '+r.data.name+' are now friends.');
  $$('[data-act=fr-add-name]').forEach(b=>{if(b.dataset.n.toLowerCase()===name.toLowerCase()){b.textContent='Friends';b.disabled=true;b.classList.remove('brand')}});
  return true;
}
let _srchT=0,_srchSeq=0;
function searchPlayers(v){
  clearTimeout(_srchT);const box=$('#fr-results');if(!box)return;
  v=v.trim();if(v.length<2){box.innerHTML='';return}
  _srchT=setTimeout(async()=>{
    const seq=++_srchSeq;
    const r=await Account.call('GET','/api/players?q='+encodeURIComponent(v),undefined,6000).catch(()=>null);
    const bx=$('#fr-results');if(seq!==_srchSeq||!bx)return;
    if(!r||!r.ok){bx.innerHTML='';return}
    const ps=r.data.players||[];
    bx.innerHTML=ps.length?`<div class="fr-list">${ps.map(p=>personRow(p,addBtn(p,p.isFriend))).join('')}</div>`:`<div class="fr-msg">No player found for &ldquo;${esc(v)}&rdquo;.</div>`;
    fillHeads();
  },250);
}
document.addEventListener('input',e=>{if(e.target&&e.target.id==='fr-name')searchPlayers(e.target.value)});
function fillHeads(){
  const els=$$('.fr-av:not([data-done])');let i=0;
  const step=()=>{
    const t0=performance.now();
    while(i<els.length&&performance.now()-t0<10){
      const e=els[i++];if(!e.isConnected)continue;
      const k=e.dataset.av;let u=Friends.heads[k];
      if(u===undefined){let cfg={};try{cfg=JSON.parse(k)}catch(x){}u=Friends.heads[k]=(R.ok||R.init())?headshot(cfg):''}
      e.dataset.done='1';e.innerHTML=u?`<img alt="" src="${u}">`:`<i>${esc((e.dataset.name||'?').charAt(0).toUpperCase())}</i>`;
    }
    if(i<els.length)requestAnimationFrame(step);
  };
  step();
}
document.addEventListener('submit',e=>{if(e.target.id==='fr-form'){e.preventDefault();AccountActs['fr-add']()}});

/* ============ login / create account ============ */
let _authTab='login';
function showAuth(note){
  modal(`<h2>Welcome to IndieBlox</h2><p>${esc(note||'Log in to play with friends and keep your progress on any device.')}</p>
    <div class="seg" style="margin-bottom:12px" role="group" aria-label="Account"><button data-act="auth-tab" data-t="login">Log in</button><button data-act="auth-tab" data-t="register">Create account</button></div>
    <label class="lbl" for="au-name">Username</label><input type="text" id="au-name" maxlength="18" autocomplete="username" autocapitalize="off" spellcheck="false">
    <label class="lbl" for="au-pw">Password</label><input type="password" id="au-pw" maxlength="72" autocomplete="current-password">
    <p class="au-hint" id="au-hint"></p><div class="au-err" id="au-err" role="alert"></div>
    <div class="acts"><button class="btn" data-act="auth-guest">Play as guest</button><button class="btn brand" data-act="auth-go" id="au-go">Log in</button></div>`);
  authTab('login');
}
function authTab(t){
  _authTab=t;
  $$('.modal .seg button').forEach(b=>b.classList.toggle('on',b.dataset.t===t));
  const reg=t==='register',go=$('#au-go'),pw=$('#au-pw'),hint=$('#au-hint'),err=$('#au-err');
  if(go)go.textContent=reg?'Create account':'Log in';
  if(pw)pw.autocomplete=reg?'new-password':'current-password';
  if(err)err.textContent='';
  if(hint)hint.textContent=reg?'Username: 3 to 18 letters, numbers or _. Password: 8 or more characters. There is no password reset, so keep it safe.'+(S.user?' Your coins and avatar from this device move to the new account.':''):'';
}
async function authSubmit(){
  const n=($('#au-name').value||'').trim(),p=$('#au-pw').value||'',err=$('#au-err'),btn=$('#au-go'),reg=_authTab==='register';
  err.textContent='';
  if(n.length<3){err.textContent='Enter your username.';return}
  if(!p){err.textContent='Enter your password.';return}
  if(reg&&p.length<8){err.textContent='Use at least 8 characters for your password.';return}
  btn.disabled=true;btn.textContent='Please wait';
  let r;
  try{r=reg?await Account.register(n,p):await Account.login(n,p)}catch(e){r={error:'Cannot reach the server. Check your connection.'}}
  if(!$('#au-go'))return;
  btn.disabled=false;btn.textContent=reg?'Create account':'Log in';
  if(!r.ok){err.textContent=r.error;Sfx.play('err');return}
  closeModal();
  if(R.ok||R.init())S.head=headshot(S.user.avatar);
  refreshTop();Friends.start();
  const pj=Account.pendingJoin;Account.pendingJoin='';
  if(pj)history.replaceState(null,'','#/join/'+encodeURIComponent(pj));
  route();toastUI('Signed in as '+Account.user);
}
document.addEventListener('keydown',e=>{
  if(e.key==='Enter'&&e.target&&(e.target.id==='au-name'||e.target.id==='au-pw')){e.preventDefault();authSubmit()}
});

/* ============ actions ============ */
function inviteLink(){return location.href.split('#')[0]+'#/join/'+encodeURIComponent(Net.room)}
const AccountActs={
  'auth-open':()=>showAuth(),
  'auth-tab':t=>authTab(t.dataset.t),
  'auth-go':()=>authSubmit(),
  'auth-guest':()=>{closeModal();Account.pendingJoin='';if(!S.user)showWelcome()},
  logout:async()=>{
    await Account.sync();Account.clear();S.user=null;S.head='';Store.set('user',null);
    closeModal();refreshTop();history.replaceState(null,'','#/home');route();showAuth();
  },
  'fr-add':async()=>{
    const inp=$('#fr-name'),msg=$('#fr-msg');if(!inp||!msg)return;
    let n=inp.value.trim();if(!n)return;
    const cand=$$('#fr-results [data-act=fr-add-name]');
    if(cand.length===1&&cand[0].dataset.n.toLowerCase()!==n.toLowerCase())n=cand[0].dataset.n;   // one match: add that player
    msg.className='fr-msg';msg.textContent='';
    const r=await Friends.act('add',n).catch(()=>null);
    if(!r||!r.ok){msg.className='fr-msg err';msg.textContent=(r&&r.data&&r.data.error)||'Could not reach the server.';return}
    inp.value='';const rs=$('#fr-results');if(rs)rs.innerHTML='';
    msg.className='fr-msg ok';msg.textContent=`You and ${r.data.name} are now friends.`;
    Friends.apply(r.data);
  },
  'fr-remove':t=>{const n=t.dataset.n;confirmBox('Remove '+n+'?','You will stop seeing when they are online. They cannot add you again unless you add them.','Remove',()=>friendDo('remove',n))},
  'fr-join':t=>launch(t.dataset.game,{room:t.dataset.room}),
  'play-priv':t=>launch(t.dataset.id,{priv:true}),
  'fr-add-name':t=>addFriend(t.dataset.n),
  'g-players':()=>{
    const ps=[...Net.peers.values()].sort((a,b)=>a.name.localeCompare(b.name));
    const rows=ps.length?ps.map(q=>personRow({name:q.name,av:q.av},addBtn(q,Friends.list.some(f=>f.name.toLowerCase()===q.name.toLowerCase())))).join(''):'<div class="empty"><b>No one else is here yet</b>Players who join this room show up here.</div>';
    modal(`<h2>Players</h2><p>Add someone as a friend with one tap.</p><div class="fr-list" style="max-height:50vh;overflow:auto;margin-bottom:12px">${rows}</div><div class="acts"><button class="btn" data-act="modal-close">Close</button></div>`);
    fillHeads();
  },
  'g-friends':()=>{
    const rows=Friends.list.length?Friends.list.map(f=>`<div class="fr-row"><div class="fr-info"><div class="fr-name">${esc(f.name)}</div><div class="fr-st ${f.status}">${f.status==='game'?'In a game':f.status==='online'?'Online':'Offline'}</div></div><div class="fr-btns"><button class="btn sm brand" data-act="g-invite-friend" data-n="${esc(f.name)}">Invite</button></div></div>`).join(''):'<div class="empty"><b>No friends yet</b>Add friends from the Friends page first.</div>';
    modal(`<h2>Invite friends</h2><p>They will see your private room on their Friends page.</p><div class="fr-list" style="max-height:50vh;overflow:auto;margin-bottom:12px">${rows}</div><div class="acts"><button class="btn" data-act="modal-close">Close</button></div>`);
  },
  'g-invite-friend':t=>{Net.invite(t.dataset.n);t.textContent='Invited';t.disabled=true;t.classList.remove('brand')},
  'g-invite':()=>{
    if(!Net.on||!Net.room){toastUI('Invites work once you are connected to other players.');return}
    const link=inviteLink();
    const show=()=>{modal(`<h2>Invite link</h2><p>Send this link to a friend. They can join your room.</p><input type="text" readonly id="invl" value="${esc(link)}"><div class="acts"><button class="btn" data-act="modal-close">Close</button></div>`);setTimeout(()=>{const i=$('#invl');if(i)i.select()},30)};
    if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(link).then(()=>toastUI('Invite link copied')).catch(show);else show();
  }
};

/* ============ play together: direct connections, no server ============
   One player HOSTS: the room lives in the host's browser and speaks the same messages as the server does.
   Friends JOIN as clients over a WebRTC data channel. Codes are swapped by hand (copy and paste), so no
   server, account or website of any kind is needed. "Same Wi-Fi only" skips the internet lookup (STUN). */
const P2P_CAP=8;
const p2r2=v=>Math.round(v*100)/100;
const p2n=(v,lo,hi)=>{v=+v;return Number.isFinite(v)?clamp(v,lo,hi):0};
const b64u=u8=>{let s='';for(let i=0;i<u8.length;i+=0x8000)s+=String.fromCharCode.apply(null,u8.subarray(i,i+0x8000));return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')};
const unb64u=s=>{s=s.replace(/-/g,'+').replace(/_/g,'/');while(s.length%4)s+='=';const b=atob(s),u=new Uint8Array(b.length);for(let i=0;i<b.length;i++)u[i]=b.charCodeAt(i);return u};
async function p2pEncode(o){
  const json=JSON.stringify(o);
  if(typeof CompressionStream==='function'){
    const buf=await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer();
    return 'IB1-'+b64u(new Uint8Array(buf));
  }
  return 'IB0-'+b64u(new TextEncoder().encode(json));
}
async function p2pDecode(code){
  code=String(code||'').replace(/\s+/g,'');
  const m=code.match(/(IB[01])-([A-Za-z0-9_-]{20,20000})/);
  if(!m)throw new Error('That does not look like an IndieBlox code. Copy the whole code and paste it again.');
  let bytes;try{bytes=unb64u(m[2])}catch(e){throw new Error('That code is damaged. Copy it again.')}
  try{
    if(m[1]==='IB0')return JSON.parse(new TextDecoder().decode(bytes));
    if(typeof DecompressionStream!=='function')throw new Error('This browser cannot read that code. Try a newer browser.');
    const buf=await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
    return JSON.parse(new TextDecoder().decode(buf));
  }catch(e){throw new Error(e.message&&/browser/.test(e.message)?e.message:'That code is damaged. Copy it again.')}
}

/* ---- sockets that look like a WebSocket, so the game code does not care which one it uses ---- */
function loopPair(){
  const mk=()=>({readyState:1,onopen:null,onmessage:null,onclose:null,onerror:null,peer:null,
    send(s){const p=this.peer;if(p&&p.readyState===1)setTimeout(()=>{if(p.onmessage)p.onmessage({data:s})},0)},
    close(){if(this.readyState===3)return;this.readyState=3;const p=this.peer;setTimeout(()=>{if(this.onclose)this.onclose();if(p&&p.readyState!==3){p.readyState=3;if(p.onclose)p.onclose()}},0)}});
  const a=mk(),b=mk();a.peer=b;b.peer=a;return[a,b];
}
class DCSocket{
  constructor(dc){
    this.dc=dc;this.onopen=this.onmessage=this.onclose=this.onerror=null;
    this.ready=new Promise(res=>{if(dc.readyState==='open')res();else dc.addEventListener('open',()=>res(),{once:true})});
    dc.addEventListener('open',()=>{if(this.onopen)this.onopen()});
    dc.addEventListener('message',e=>{if(this.onmessage)this.onmessage({data:e.data})});
    dc.addEventListener('close',()=>{if(this.onclose)this.onclose()});
    dc.addEventListener('error',()=>{if(this.onerror)this.onerror()});
  }
  get readyState(){const s=this.dc.readyState;return s==='open'?1:s==='connecting'?0:3}
  send(s){this.dc.send(s)}
  close(){try{this.dc.close()}catch(e){}}
}

/* ---- the host's room: same rules as the server, running in the host's browser ---- */
const p2pName=n=>String(n||'').replace(/[^\p{L}\p{N} _.\-]/gu,'').trim().slice(0,18)||'Player';
function p2pAv(a){
  a=a&&typeof a==='object'?a:{};const hex=/^#[0-9a-f]{6}$/i,o={},item=/^[a-z][a-z0-9]{1,15}(~[0-9a-f]{6})?$/,part=/^[a-z][0-9]{2}$/;
  for(const k of['skin','torso','arms','legs','accent'])o[k]=hex.test(a[k])?a[k]:AV_DEFAULT[k];
  o.face=(LEGACY_FACES.has(a.face)||a.face==='mix')?a.face:'smile';
  if(o.face==='mix')for(const k of['eyes','mouth','brows','fx'])if(typeof a[k]==='string'&&part.test(a[k]))o[k]=a[k];
  for(const k of['hat','hair','acc','back','shirt','pants','shoe'])o[k]=(a[k]==='none'||(typeof a[k]==='string'&&item.test(a[k])))?a[k]:'none';
  for(const [k,lo,hi] of [['bh',.8,1.25],['bw',.8,1.25],['hs',.8,1.3]]){const v=+a[k];o[k]=Number.isFinite(v)?Math.round(clamp(v,lo,hi)*100)/100:1}
  return o;
}
const P2PHost={on:false,game:'',cap:P2P_CAP,ps:new Map(),nid:1,t0:0,timer:0,socks:new Set(),onchange:null,
  start(game){this.stop();this.on=true;this.game=game;this.nid=1;this.t0=performance.now();this.timer=setInterval(()=>this.tick(),100)},
  stop(){
    clearInterval(this.timer);this.on=false;
    for(const s of [...this.socks]){try{s.close()}catch(e){}}
    this.socks.clear();this.ps.clear();
  },
  attach(sock){
    const P={id:0,sock,name:'Player',av:null,joined:false,self:false,last:performance.now(),x:0,y:0,z:0,r:0,v:0,f:1,e:0,sc:0,dirty:false,chatT:[]};
    this.socks.add(sock);
    sock.onmessage=ev=>{P.last=performance.now();let m;try{m=JSON.parse(ev.data)}catch(e){return}this.msg(P,m)};
    sock.onclose=()=>{this.socks.delete(sock);this.drop(P)};
    return P;
  },
  selfSocket(){const[a,b]=loopPair();const P=this.attach(b);P.self=true;return a},
  send(P,o){try{if(P.sock.readyState===1)P.sock.send(JSON.stringify(o))}catch(e){}},
  bc(o,except){const s=JSON.stringify(o);for(const p of this.ps.values())if(p!==except&&p.sock.readyState===1){try{p.sock.send(s)}catch(e){}}},
  pub(P){return{id:P.id,name:P.name,av:P.av,s:[P.x,P.y,P.z,P.r,P.v,P.f,P.e,P.sc]}},
  uniqueName(n){
    const used=new Set([...this.ps.values()].map(p=>p.name.toLowerCase()));
    if(!used.has(n.toLowerCase()))return n;
    for(let i=2;i<99;i++){const c=n.slice(0,15)+' '+i;if(!used.has(c.toLowerCase()))return c}
    return n;
  },
  names(){return[...this.ps.values()].map(p=>({name:p.name,self:p.self}))},
  msg(P,m){
    if(!m||typeof m.t!=='string'||!this.on)return;
    if(m.t==='join'){
      if(P.joined)return;
      if(this.ps.size>=this.cap){this.send(P,{t:'err',code:'full',m:'The host\'s room is full.'});return}
      if(m.game&&String(m.game)!==this.game){this.send(P,{t:'err',code:'noroom',m:'That is a different game.'});return}
      P.id=this.nid++;P.name=this.uniqueName(p2pName(m.name));P.av=p2pAv(m.av);P.joined=true;this.ps.set(P.id,P);
      this.send(P,{t:'welcome',id:P.id,room:'p2p',priv:false,mine:false,cap:this.cap,st:(performance.now()-this.t0)/1000,chat:true,
        players:[...this.ps.values()].filter(q=>q!==P).map(q=>this.pub(q))});
      this.bc({t:'join',p:this.pub(P)},P);
      if(this.onchange)this.onchange();
    }else if(!P.joined){return}
    else if(m.t==='s'){
      P.x=p2n(m.x,-5000,5000);P.y=p2n(m.y,-500,5000);P.z=p2n(m.z,-5000,5000);P.r=p2n(m.r,-7,7);P.v=p2n(m.v,0,1);
      P.f=(m.f|0)&3;P.e=(m.e|0)&3;P.sc=Math.floor(p2n(m.sc,-1e9,1e9));P.dirty=true;
    }else if(m.t==='chat'){
      const txt=String(m.m||'').replace(/[\u0000-\u001f\u007f<>]/g,'').trim().slice(0,120);if(!txt)return;
      const now=performance.now();P.chatT=P.chatT.filter(t=>now-t<6000);
      if(P.chatT.length>=5||(P.chatT.length&&now-P.chatT[P.chatT.length-1]<600))return;
      P.chatT.push(now);this.bc({t:'chat',id:P.id,name:P.name,m:txt});
    }else if(m.t==='ev'){
      const k=String(m.k||'');if(k!=='mv'&&k!=='ko')return;
      const now=performance.now();P.evT=(P.evT||[]).filter(t=>now-t<1000);if(P.evT.length>=20)return;P.evT.push(now);
      const o={t:'ev',id:P.id,k};
      if(k==='mv'){o.m=p2n(m.m,0,99)|0;o.c=p2n(m.c,0,9)|0;o.x=p2r2(p2n(m.x,-5000,5000));o.y=p2r2(p2n(m.y,-500,5000));o.z=p2r2(p2n(m.z,-5000,5000));o.r=p2r2(p2n(m.r,-7,7))}else o.by=p2n(m.by,0,1e6)|0;
      this.bc(o,P);
    }else if(m.t==='hit'){
      const T=this.ps.get(m.to|0);if(!T||T===P)return;const now=performance.now();P.hitT=(P.hitT||[]).filter(t=>now-t<1000);if(P.hitT.length>=14)return;P.hitT.push(now);
      this.send(T,{t:'hit',from:P.id,d:p2n(m.d,0,60),kx:p2n(m.kx,-40,40),kz:p2n(m.kz,-40,40),ky:p2n(m.ky,0,30),st:p2n(m.st,0,2.5)});
    }
  },
  drop(P){
    if(!P.joined)return;P.joined=false;this.ps.delete(P.id);
    this.bc({t:'leave',id:P.id});if(this.onchange)this.onchange();
  },
  tick(){
    const now=performance.now(),d=[];
    for(const P of [...this.ps.values()]){
      if(!P.self&&now-P.last>12000){try{P.sock.close()}catch(e){}continue}
      if(P.dirty){P.dirty=false;d.push([P.id,p2r2(P.x),p2r2(P.y),p2r2(P.z),p2r2(P.r),p2r2(P.v),P.f,P.e,P.sc])}
    }
    if(!d.length)return;
    for(const P of this.ps.values()){const mine=d.filter(a=>a[0]!==P.id);if(mine.length)this.send(P,{t:'snap',d:mine})}
  }
};

/* ---- making and reading invite / reply codes ---- */
const P2P={
  lan:!!Store.get('p2plan',false),
  ice(){return this.lan?[]:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun1.l.google.com:19302'}]},
  gathered(pc,ms){
    return new Promise(res=>{
      if(pc.iceGatheringState==='complete')return res();
      const done=()=>{pc.removeEventListener('icegatheringstatechange',h);clearTimeout(t);res()};
      const h=()=>{if(pc.iceGatheringState==='complete')done()};
      pc.addEventListener('icegatheringstatechange',h);const t=setTimeout(done,ms);
    });
  },
  async offer(){   // the host makes one of these for each friend
    const pc=new RTCPeerConnection({iceServers:this.ice()});
    const dc=pc.createDataChannel('ib');
    const sock=new DCSocket(dc);P2PHost.attach(sock);   // attach now so the friend's first message is never missed
    await pc.setLocalDescription(await pc.createOffer());await this.gathered(pc,this.lan?1500:4000);
    const code=await p2pEncode({v:1,t:'o',g:P2PHost.game,n:S.user.name,l:this.lan?1:0,s:pc.localDescription.sdp});
    pc.addEventListener('connectionstatechange',()=>{if(pc.connectionState==='failed'||pc.connectionState==='closed')sock.close()});
    return{pc,sock,code,used:false};
  },
  async finish(h,replyCode){   // the host pastes the friend's reply
    const a=await p2pDecode(replyCode);
    if(a.t!=='a'||typeof a.s!=='string')throw new Error('That is an invite code, not a reply. Paste the reply your friend sent back.');
    await h.pc.setRemoteDescription({type:'answer',sdp:a.s});
  },
  async answer(code){   // the friend pastes the host's invite
    const o=await p2pDecode(code);
    if(o.t!=='o'||typeof o.s!=='string'||!/^[a-z0-9-]{3,24}$/.test(o.g||''))throw new Error('That is a reply code, not an invite. Paste the code the host sent you.');
    if(!PREMADE.some(g=>g.id===o.g))throw new Error('That game is not in this version of IndieBlox.');
    this.lan=!!o.l;   // follow the host's choice
    const pc=new RTCPeerConnection({iceServers:this.ice()});
    let sockRef=null;
    const opened=new Promise((res,rej)=>{
      const to=setTimeout(()=>rej(new Error('It did not connect. Check that the host pasted your reply, and that you are both online or on the same Wi-Fi.')),60000);
      pc.addEventListener('datachannel',e=>{sockRef=new DCSocket(e.channel);sockRef.ready.then(()=>{clearTimeout(to);res(sockRef)})});
      pc.addEventListener('connectionstatechange',()=>{if(pc.connectionState==='failed'){clearTimeout(to);rej(new Error('The connection failed. Try again, or switch on Same Wi-Fi only if you are together.'))}});
    });
    opened.catch(()=>{});
    await pc.setRemoteDescription({type:'offer',sdp:o.s});
    await pc.setLocalDescription(await pc.createAnswer());await this.gathered(pc,this.lan?1500:4000);
    const reply=await p2pEncode({v:1,t:'a',s:pc.localDescription.sdp});
    pc.addEventListener('connectionstatechange',()=>{if(pc.connectionState==='closed'&&sockRef)sockRef.close()});
    return{pc,game:o.g,host:o.n||'the host',reply,opened,lan:this.lan};
  }
};

/* ---- screens ---- */
async function p2pCopy(id){
  const el=$('#'+id);if(!el)return;const v=el.value;
  try{if(navigator.clipboard&&navigator.clipboard.writeText){await navigator.clipboard.writeText(v);toastUI('Copied');return}}catch(e){}
  try{el.focus();el.select();if(document.execCommand('copy')){toastUI('Copied');return}}catch(e){}
  toastUI('Press and hold the code, then choose Copy');
}
function togetherHTML(){
  const games=PREMADE.map(g=>`<option value="${g.id}">${esc(g.title)}</option>`).join('');
  return `<h1 class="h1">Play together</h1>
    <p class="muted" style="max-width:64ch;margin-top:4px">No account and no server. One person hosts a game and sends a short code. Friends paste it to join. It works on the same Wi-Fi or over the internet.</p>
    <div class="tg-grid">
      <div class="tg-card"><h2>Host a game</h2><p>You start the game and friends connect straight to you.</p><label class="lbl" for="tg-game">Game</label><select id="tg-game">${games}</select><button class="btn brand" data-act="p2p-host">Host a game</button></div>
      <div class="tg-card"><h2>Join a game</h2><p>Your friend sends you a code. Paste it to join their game.</p><button class="btn brand" data-act="p2p-join">Join a game</button></div>
      <div class="tg-card"><h2>Same Wi-Fi with the IndieBlox program</h2><div id="tg-lanbox"><p>Looking for your Wi-Fi address...</p></div></div>
    </div>
    <label class="tg-lan"><input type="checkbox" id="tg-lan"${P2P.lan?' checked':''}> Same Wi-Fi only (works with no internet)</label>
    <ul class="tg-help"><li>Up to ${P2P_CAP} players. The host keeps the game open, and if the host leaves, everyone leaves.</li>
      <li>Over the internet, devices ask a free public helper (Google STUN) only to find each other. Game data goes directly between devices.</li>
      <li>Same Wi-Fi only skips that lookup, so it works on a hotspot or a network with no internet. Some public Wi-Fi stops devices seeing each other.</li>
      <li>The five built-in games work. Games from Studio are not supported yet.</li></ul>`;
}
const P2PUI={cur:null,jcur:null,
  supported(){return typeof RTCPeerConnection==='function'},
  async host(id){
    if(!this.supported()){toastUI('This browser cannot make direct connections. Try Chrome, Edge, Safari or Firefox.');return}
    if(!PREMADE.some(g=>g.id===id))return;
    P2PHost.start(id);P2PHost.onchange=()=>this.players();
    await launch(id,{p2p:{role:'host'}});
    const t0=Date.now(),iv=setInterval(()=>{   // open the invite window once the game is ready
      if(Play.active&&Play.ready&&Net.p2p&&Net.on){clearInterval(iv);this.invite()}
      else if(Date.now()-t0>25000||!Play.active)clearInterval(iv);
    },300);
  },
  discard(){const c=this.cur;this.cur=null;if(c&&!c.used){try{c.pc.close()}catch(e){}try{c.sock.close()}catch(e){}}},
  setStatus(t){const e=$('#p2p-status');if(e)e.textContent=t},
  players(){
    const el=$('#p2p-players');if(!el)return;
    const n=P2PHost.names();
    el.innerHTML=`<b>In this game (${n.length}/${P2P_CAP})</b><ul>${n.map(p=>`<li>${esc(p.name)}${p.self?' (you)':''}</li>`).join('')}</ul>`;
  },
  async invite(){
    modal(`<h2>Invite players</h2><p>Up to ${P2P_CAP-1} friends can join you.</p>
      <div class="p2p-step"><b>1. Send this code to your friend</b><textarea class="code" id="p2p-offer" readonly placeholder="Making your code..."></textarea>
        <div class="acts"><button class="btn" data-act="p2p-copy" data-t="p2p-offer">Copy code</button>${navigator.share?'<button class="btn" data-act="p2p-share" data-t="p2p-offer">Share</button>':''}</div></div>
      <div class="p2p-step"><b>2. Paste the reply code they send back</b><textarea class="code" id="p2p-reply" placeholder="Paste the reply code here"></textarea>
        <div class="acts"><button class="btn brand" data-act="p2p-connect">Connect</button></div></div>
      <p class="p2p-status" id="p2p-status" role="status"></p><div id="p2p-players" class="p2p-players"></div>
      <label class="tg-lan"><input type="checkbox" id="p2p-lan"${P2P.lan?' checked':''}> Same Wi-Fi only (no internet needed)</label>
      <div class="acts" style="margin-top:12px"><button class="btn" data-act="p2p-more">Invite another friend</button><button class="btn brand" data-act="modal-close">Done</button></div>`,'p2p-box');
    this.players();await this.newOffer();
  },
  async newOffer(){
    const o=$('#p2p-offer');if(o)o.value='';this.discard();this.setStatus('Making your code...');
    try{
      const h=await P2P.offer();this.cur=h;const e=$('#p2p-offer');if(e)e.value=h.code;
      this.setStatus(P2P.lan?'Same Wi-Fi mode: your friend must be on this Wi-Fi. Send the code, then paste their reply.':'Send the code, then paste their reply.');
    }catch(e){this.setStatus('Could not make a code: '+(e.message||e))}
  },
  async connect(){
    const h=this.cur;if(!h){this.setStatus('Make a code first: tap Invite another friend.');return}
    const code=(($('#p2p-reply')||{}).value||'').trim();if(!code){this.setStatus('Paste the reply code first.');return}
    this.setStatus('Connecting...');
    try{
      await P2P.finish(h,code);
      await Promise.race([h.sock.ready,new Promise((_,rej)=>setTimeout(()=>rej(new Error('It did not connect. Ask your friend to try again, and check you are both online or on the same Wi-Fi.')),30000))]);
      h.used=true;this.cur=null;
      const r=$('#p2p-reply'),o=$('#p2p-offer');if(r)r.value='';if(o)o.value='';
      this.setStatus('Connected! Tap Invite another friend to add more.');this.players();
    }catch(e){this.setStatus(e.message||'That did not work. Try again.')}
  },
  joinModal(){
    if(!this.supported()){toastUI('This browser cannot make direct connections. Try Chrome, Edge, Safari or Firefox.');return}
    modal(`<h2>Join a game</h2><div id="p2p-jin"><p>Paste the invite code the host sent you.</p><textarea class="code" id="p2p-code" placeholder="IB1-..."></textarea>
      <div class="acts"><button class="btn" data-act="modal-close">Cancel</button><button class="btn brand" data-act="p2p-answer">Join</button></div></div>
      <div id="p2p-jbody"></div>`,'p2p-box');
  },
  async answer(){
    const code=($('#p2p-code')||{}).value||'',body=$('#p2p-jbody');if(!body)return;
    body.innerHTML='<p class="p2p-status">Working...</p>';
    let r;
    try{r=await P2P.answer(code)}catch(e){body.innerHTML=`<p class="p2p-status err">${esc(e.message||'That did not work.')}</p>`;return}
    const jin=$('#p2p-jin');if(jin)jin.style.display='none';
    body.innerHTML=`<p>Joining <b>${esc(r.host)}</b>'s game. <b>Send this reply code back to the host:</b></p>
      <textarea class="code" id="p2p-reply-out" readonly>${esc(r.reply)}</textarea>
      <div class="acts">${navigator.share?'<button class="btn" data-act="p2p-share" data-t="p2p-reply-out">Share</button>':''}<button class="btn brand" data-act="p2p-copy" data-t="p2p-reply-out">Copy reply</button></div>
      <p class="p2p-status" id="p2p-jstatus" role="status">Waiting for the host to connect...</p>`;
    p2pCopy('p2p-reply-out');
    try{
      const sock=await r.opened;closeModal();
      await launch(r.game,{p2p:{role:'client',sock}});
    }catch(e){const s=$('#p2p-jstatus');if(s){s.classList.add('err');s.textContent=e.message||'It did not connect.'}}
  }
};
const P2PActs={
  'p2p-host':t=>P2PUI.host(t.dataset.id||($('#tg-game')||{}).value||'sky-obby'),
  'p2p-join':()=>P2PUI.joinModal(),
  'p2p-answer':()=>P2PUI.answer(),
  'p2p-connect':()=>P2PUI.connect(),
  'p2p-more':()=>P2PUI.newOffer(),
  'p2p-copy':t=>p2pCopy(t.dataset.t),
  'p2p-share':t=>{const v=($('#'+t.dataset.t)||{}).value;if(navigator.share&&v)navigator.share({text:v}).catch(()=>{})},
  'g-p2p':()=>P2PUI.invite()
};
document.addEventListener('change',e=>{
  const t=e.target;if(!t||(t.id!=='tg-lan'&&t.id!=='p2p-lan'))return;
  P2P.lan=t.checked;Store.set('p2plan',P2P.lan);
  const o=$('#tg-lan'),i=$('#p2p-lan');if(o)o.checked=P2P.lan;if(i)i.checked=P2P.lan;
  if(t.id==='p2p-lan')P2PUI.newOffer();
});

/* ---- LAN: the IndieBlox program on one computer, friends on the same Wi-Fi open its address ---- */
function drawQR(canvas,text){
  try{
    const qr=qrcode(0,'M');qr.addData(text);qr.make();
    const n=qr.getModuleCount(),s=Math.max(1,Math.floor(canvas.width/(n+8))),off=Math.floor((canvas.width-n*s)/2),g=canvas.getContext('2d');
    g.fillStyle='#fff';g.fillRect(0,0,canvas.width,canvas.height);g.fillStyle='#000';
    for(let r=0;r<n;r++)for(let c=0;c<n;c++)if(qr.isDark(r,c))g.fillRect(off+c*s,off+r*s,s,s);
  }catch(e){canvas.remove()}
}
async function fillLan(){
  const box=$('#tg-lanbox');if(!box)return;
  if(!Net.base()){
    box.innerHTML='<p>To play over Wi-Fi with no internet, start the IndieBlox program on one computer (double-click <b>Start IndieBlox</b> in the download). Other devices on the same Wi-Fi open the address it shows and type a name. Host a game above also works on Wi-Fi.</p>';return;
  }
  let j=null;try{const r=await fetch(Net.api('/api/lan'),{cache:'no-store'});if(r.ok)j=await r.json()}catch(e){}
  if(!$('#tg-lanbox'))return;
  if(!j||!j.urls.length){$('#tg-lanbox').innerHTML='<p>No Wi-Fi network was found on this computer. Connect it to Wi-Fi, or use a direct connection.</p>';return}
  $('#tg-lanbox').innerHTML=`<p>Friends on the same Wi-Fi open this address${j.guests?' and type a name. No account needed.':'. They need an account here.'}</p>`+
    j.urls.map((u,i)=>`<div class="tg-urlrow"><input class="tg-urlbox" id="tg-url-${i}" readonly value="${esc(u)}" aria-label="Wi-Fi address"><button class="btn sm" data-act="p2p-copy" data-t="tg-url-${i}">Copy</button></div><canvas class="tg-qr" data-qr="${esc(u)}" width="220" height="220" aria-label="QR code for ${esc(u)}"></canvas>`).join('');
  $$('.tg-qr').forEach(c=>drawQR(c,c.dataset.qr));
}

/* ============ LAN rooms: a map you can edit while you play, with an owner ============ */
/* The map lives on the IndieBlox program (the LAN server). Everyone in the room sees the same parts.
   Only the owner can build. If the owner leaves, the room waits 30 seconds; then the best player on the
   leaderboard becomes owner. When the first owner comes back they get ownership back. */
const LAN_SKY={day:['#3d9cff','#cfeeff'],sunset:['#5b2a86','#ff9a5c'],night:['#0a0f24','#2d3b69'],space:['#02030a','#1a1440']};
const LAN_TEMPLATES={
  baseplate:{name:'Baseplate',desc:'The default map. A big flat plate, ready to build on.',sky:'day',parts:[
    {k:'solid',x:0,y:-.5,z:0,sx:240,sy:1,sz:240,c:'#5bd16a'},{k:'spawn',x:0,y:.2,z:0,sx:6,sy:.4,sz:6,c:'#3b8bff'}]},
  starter:{name:'Starter course',desc:'A small obby to change and extend.',sky:'day',parts:[
    {k:'solid',x:0,y:-.5,z:0,sx:24,sy:1,sz:24,c:'#5bd16a'},{k:'spawn',x:0,y:.2,z:0,sx:6,sy:.4,sz:6,c:'#3b8bff'},
    {k:'solid',x:0,y:1,z:-18,sx:6,sy:1,sz:6,c:'#ff8a3d'},{k:'solid',x:4,y:2,z:-27,sx:6,sy:1,sz:6,c:'#ffd23f'},
    {k:'mover',x:0,y:3,z:-37,sx:8,sy:1,sz:8,c:'#a45cff',ax:'x',amp:8,sp:1},{k:'checkpoint',x:0,y:4,z:-50,sx:10,sy:1,sz:10,c:'#ffd23f'},
    {k:'kill',x:0,y:3,z:-64,sx:14,sy:1,sz:18,c:'#ff5a1f'},{k:'solid',x:0,y:4,z:-64,sx:3,sy:1,sz:18,c:'#5b6470'},
    {k:'finish',x:0,y:4,z:-82,sx:10,sy:1,sz:10,c:'#ffcf33'},{k:'coin',x:0,y:4,z:-18,sx:2,sy:2,sz:2,c:'#ffcf33'},
    {k:'coin',x:4,y:5,z:-27,sx:2,sy:2,sz:2,c:'#ffcf33'},{k:'coin',x:0,y:7,z:-50,sx:2,sy:2,sz:2,c:'#ffcf33'}]}
};

/* ---- one part of the map, alive in the world ---- */
function lanMakePart(w,q,id){
  const e={id,q:Object.assign({},q),obj:null,mesh:null};
  if(q.k==='coin'){const c=w.coin(q.x,q.y,q.z);e.obj=c;e.mesh=c.h.children[0]}
  else{
    const kind={kill:'kill',bounce:'bounce',checkpoint:'checkpoint',finish:'finish'}[q.k];
    const p=w.box(q.x,q.y,q.z,q.sx,q.sy,q.sz,q.c,{kind});e.obj=p;e.mesh=p.mesh;
    if(q.k==='mover')w.mover(p,{ax:q.ax||'x',amp:q.amp==null?10:q.amp,speed:q.sp||1,phase:id*.9});
  }
  if(e.mesh)e.mesh.userData.pid=id;
  return e;
}
function lanRemove(w,e){
  const o=e.obj;
  if(e.q.k==='coin'){o.got=true;w.scene.remove(o.h);const i=w.coins.indexOf(o);if(i>=0)w.coins.splice(i,1)}
  else w.removeBox(o);
}

/* ---- the world for a LAN room: empty until the server sends the map ---- */
function buildLanMap(w){
  w.voidY=-150;w.boardLabel='Coins';w.cam.dist=20;w.spawn={x:0,y:3,z:0};
  const L=w.lan={parts:new Map(),sky:'day',ownerName:'',awayEnd:0,got:0,placed:false,fin:0,
    setSky(name){const t=LAN_SKY[name]||LAN_SKY.day;this.sky=LAN_SKY[name]?name:'day';w.setSky(t[0],t[1],140,700)},
    spawnFix(){
      let sp=null;for(const e of this.parts.values())if(e.q.k==='spawn')sp=e.q;
      w.spawn=sp?{x:sp.x,y:sp.y+sp.sy/2+.2,z:sp.z}:{x:0,y:3,z:0};
    },
    load(map){
      for(const e of [...this.parts.values()])lanRemove(w,e);this.parts.clear();this.got=0;w.score=0;
      this.setSky(map.sky);
      for(const q of map.parts)this.parts.set(q.id,lanMakePart(w,q,q.id));
      this.spawnFix();
      if(!this.placed){this.placed=true;const p=w.p;p.x=w.spawn.x;p.y=w.spawn.y;p.z=w.spawn.z;p.vy=0}
      Build.changed({op:'load'});
    },
    apply(m){
      if(m.op==='add'){this.parts.set(m.part.id,lanMakePart(w,m.part,m.part.id));this.spawnFix()}
      else if(m.op==='del'){const e=this.parts.get(m.id);if(e){lanRemove(w,e);this.parts.delete(m.id);this.spawnFix()}}
      else if(m.op==='upd'){const e=this.parts.get(m.id);if(e){const q=Object.assign({},e.q,m.patch);lanRemove(w,e);this.parts.set(m.id,lanMakePart(w,q,m.id));this.spawnFix()}}
      else if(m.op==='sky')this.setSky(m.sky);
      Build.changed(m);
    }
  };
  L.setSky('day');
  w.onCoin=()=>{L.got++;w.score=L.got;w.stat('coins','Coins',String(L.got));w.reward(1,true)};
  w.onFinish=()=>{const t=performance.now();if(t-L.fin>6000){L.fin=t;w.reward(20);w.confetti(w.p.x,w.p.y+2,w.p.z);w.toast('You reached the finish! +20 coins',2600);Sfx.play('win')}};
  w.stat('coins','Coins','0');
  w.update(()=>{
    const bb=$('#btn-build');if(bb)bb.classList.toggle('hidden',!Net.isOwner());
    const rm=k=>{const e=document.getElementById('st-'+k);if(e)e.remove()};
    if(Net.ownerId||!L.awayEnd)w.stat('owner','Owner',Net.isOwner()?'You':(L.ownerName||'nobody'));else rm('owner');
    if(!Net.ownerId&&L.awayEnd){const s=Math.max(0,Math.ceil((L.awayEnd-performance.now())/1000));w.stat('away','Owner left',s>0?'new owner in '+s+'s':'choosing...')}else rm('away');
  });
}

/* ============ Build mode (owner only) ============ */
function buildBarHTML(){
  const kinds=Object.keys(KINDS).map(k=>`<button class="bd-k" data-act="bd-kind" data-v="${k}"><i style="background:${KINDS[k].c}"></i>${KINDS[k].n}</button>`).join('');
  const cols=['#8fa3b8','#ff4d5e','#ff8a3d','#ffd23f','#7ed957','#22c3c3','#3b8bff','#a45cff','#ff5cae','#ffffff','#2b2f3a','#8a5a3a'].map(c=>`<button class="bd-c" data-act="bd-col" data-v="${c}" style="background:${c}" aria-label="${c}"></button>`).join('');
  const sky=[['day','Day'],['sunset','Sunset'],['night','Night'],['space','Space']].map(s=>`<option value="${s[0]}">${s[1]}</option>`).join('');
  return `<div class="bd-props hidden" id="bd-props"></div>
    <div class="bd-bar"><div class="bd-row"><div class="seg"><button data-act="bd-tool" data-v="place">Place</button><button data-act="bd-tool" data-v="select">Select</button></div><div class="bd-kinds">${kinds}</div></div>
    <div class="bd-row"><div class="bd-cols">${cols}<input type="color" id="bd-color" value="#8fa3b8" aria-label="Custom color"></div>
      <select id="bd-snap" aria-label="Grid snap">${[1,2,4,8].map(v=>`<option value="${v}"${v===2?' selected':''}>Snap ${v}</option>`).join('')}</select>
      <select id="bd-sky" aria-label="Sky">${sky}</select>
      <button class="btn sm" data-act="bd-zoom" data-d="-1" aria-label="Zoom in">+</button><button class="btn sm" data-act="bd-zoom" data-d="1" aria-label="Zoom out">-</button>
      <button class="btn sm brand" data-act="bd-exit">Done</button></div><div class="bd-tip" id="bd-tip"></div></div>`;
}
const Build={on:false,tool:'place',kind:'solid',color:'#8fa3b8',snap:2,sel:0,drag:null,wantSel:false,ray:null,outline:null,ready:false,
  cam:{yaw:.6,pitch:.85,dist:38,tx:0,ty:0,tz:0},
  toggle(){if(this.on)this.off();else this.enter()},
  enter(){
    if(!W||!W.lan)return;
    if(!Net.isOwner()){W.toast('Only the owner can build.',2000);return}
    const box=$('#build');if(!this.ready){this.ready=true;box.innerHTML=buildBarHTML();
      $('#bd-snap').onchange=e=>{this.snap=+e.target.value};
      $('#bd-sky').onchange=e=>Net.send({t:'edit',op:'sky',sky:e.target.value});
      $('#bd-color').oninput=e=>{this.color=e.target.value;if(this.sel)this.patch({c:e.target.value});this.sync()}}
    this.on=true;const p=W.p;Object.assign(this.cam,{tx:p.x,ty:p.y,tz:p.z,yaw:W.cam.yaw,pitch:.85,dist:38});
    In.reset();Lock.release();box.classList.remove('hidden');$('#crosshair').classList.add('hidden');$('#btn-build').classList.add('on');
    if(!this.outline){this.outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),new THREE.LineBasicMaterial({color:0xffb31a}));this.outline.visible=false}
    if(!this.outline.parent)W.scene.add(this.outline);
    $('#bd-sky').value=W.lan.sky;this.sync();this.select(0);
  },
  off(){
    if(!this.on)return;this.on=false;this.drag=null;this.select(0);
    const b=$('#build');if(b)b.classList.add('hidden');const bb=$('#btn-build');if(bb)bb.classList.remove('on');
    if(this.outline&&this.outline.parent)this.outline.parent.remove(this.outline);
    In.reset();Lock.sync();
  },
  sync(){
    $$('#build [data-act=bd-tool]').forEach(b=>b.classList.toggle('on',b.dataset.v===this.tool));
    $$('#build [data-act=bd-kind]').forEach(b=>b.classList.toggle('on',b.dataset.v===this.kind));
    $$('#build [data-act=bd-col]').forEach(b=>b.classList.toggle('on',b.dataset.v===this.color));
    const t=$('#bd-tip');if(t)t.textContent=this.tool==='place'?(IS_TOUCH?'Tap to place a '+KINDS[this.kind].n+'. Drag to look. Left thumb moves the camera.':'Click to place a '+KINDS[this.kind].n+'. Drag to look, W A S D to move the camera, Q and E for up and down.'):'Click a part to select it. Delete removes it.';
  },
  updateCam(dt,cam,w){
    const c=this.cam,k=In.axis(),sp=(In.keys.ShiftLeft?90:45)*dt*(c.dist/40+.3);
    if(k.x||k.z){c.tx+=(-Math.sin(c.yaw)*k.z+Math.cos(c.yaw)*k.x)*sp;c.tz+=(-Math.cos(c.yaw)*k.z-Math.sin(c.yaw)*k.x)*sp}
    if(In.keys.KeyE)c.ty+=sp*.6;if(In.keys.KeyQ)c.ty-=sp*.6;
    const cp=Math.cos(c.pitch);
    cam.position.set(c.tx+Math.sin(c.yaw)*cp*c.dist,c.ty+Math.sin(c.pitch)*c.dist,c.tz+Math.cos(c.yaw)*cp*c.dist);cam.lookAt(c.tx,c.ty,c.tz);
    if(w.skyMesh)w.skyMesh.position.copy(cam.position);
    const p=w.p;w.sun.position.set(c.tx+50,c.ty+90,c.tz+35);w.sun.target.position.set(c.tx,c.ty,c.tz);
  },
  /* pointer: drag turns the camera (or pans with Shift / right button), a click places or selects */
  down(e){const el=$('#gview');this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),btn:e.button};el.setPointerCapture(e.pointerId)},
  move(e){
    const d=this.drag;if(!d||d.id!==e.pointerId)return;
    const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;const c=this.cam;
    if(e.shiftKey||d.btn===1||d.btn===2){const s=c.dist*.0022;c.tx+=(-Math.cos(c.yaw)*dx+Math.sin(c.yaw)*dy)*s;c.tz+=(Math.sin(c.yaw)*dx+Math.cos(c.yaw)*dy)*s}
    else{c.yaw-=dx*.006;c.pitch=clamp(c.pitch+dy*.005,.08,1.5)}
  },
  up(e){
    const d=this.drag;if(!d||d.id!==e.pointerId)return;this.drag=null;
    if(d.btn===0&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<6&&performance.now()-d.t<450&&e.type==='pointerup')this.click(e);
  },
  pick(e){
    const rc=$('#gview').getBoundingClientRect();
    const ndc=new THREE.Vector2((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);
    if(!this.ray)this.ray=new THREE.Raycaster();
    W.scene.updateMatrixWorld(true);Play.cam.updateMatrixWorld(true);this.ray.setFromCamera(ndc,Play.cam);
    const meshes=[];for(const p of W.lan.parts.values())if(p.mesh)meshes.push(p.mesh);
    const hits=this.ray.intersectObjects(meshes,false);
    if(hits.length){const h=hits[0],id=h.object.userData.pid,coin=W.lan.parts.get(id).q.k==='coin';return{id,pt:h.point.clone(),n:coin||!h.face?new THREE.Vector3(0,1,0):h.face.normal.clone()}}
    const v=new THREE.Vector3();
    if(this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),v))return{id:0,pt:v,n:new THREE.Vector3(0,1,0)};
    return null;
  },
  click(e){
    const h=this.pick(e);if(!h)return;
    if(this.tool==='select'){this.select(h.id);return}
    this.place(h.pt,h.n);
  },
  place(pt,n){
    const K=KINDS[this.kind],s=K.s,sn=this.snap,sv=v=>Math.round(v/sn)*sn;let x=pt.x,y=pt.y,z=pt.z;
    if(Math.abs(n.y)>.5){x=sv(x);z=sv(z);y=pt.y+n.y*s[1]/2}
    else if(Math.abs(n.x)>.5){x=pt.x+n.x*s[0]/2;y=sv(y);z=sv(z)}
    else{z=pt.z+n.z*s[2]/2;x=sv(x);y=sv(y)}
    const q={k:this.kind,x:+x.toFixed(2),y:+y.toFixed(2),z:+z.toFixed(2),sx:s[0],sy:s[1],sz:s[2],c:this.kind==='coin'?K.c:this.color};
    if(this.kind==='mover'){q.ax='x';q.amp=10;q.sp=1}
    this.wantSel=true;Net.send({t:'edit',op:'add',part:q});Sfx.play('click');
  },
  patch(p){if(this.sel)Net.send({t:'edit',op:'upd',id:this.sel,patch:p})},
  part(){return this.sel&&W&&W.lan?W.lan.parts.get(this.sel):null},
  nudge(a,d){const e=this.part();if(e)this.patch({[a]:+(e.q[a]+d*this.snap).toFixed(2)})},
  resize(a,d){const e=this.part();if(!e)return;const k={x:'sx',y:'sy',z:'sz'}[a];this.patch({[k]:Math.max(.2,+(e.q[k]+d*this.snap).toFixed(2))})},
  del(){if(this.sel){Net.send({t:'edit',op:'del',id:this.sel});this.select(0)}},
  dup(){const e=this.part();if(!e)return;const q=Object.assign({},e.q);q.x=+(q.x+this.snap).toFixed(2);q.z=+(q.z-this.snap).toFixed(2);this.wantSel=true;Net.send({t:'edit',op:'add',part:q})},
  select(id){
    this.sel=id;const pr=$('#bd-props');if(!pr)return;
    if(!id||!this.part()){this.sel=0;pr.classList.add('hidden');if(this.outline)this.outline.visible=false;return}
    const e=this.part(),ax=(a,l)=>`<button data-act="bd-nudge" data-a="${a}" data-d="-1">${l}-</button><button data-act="bd-nudge" data-a="${a}" data-d="1">${l}+</button>`;
    const sz=(a,l)=>`<button data-act="bd-size" data-a="${a}" data-d="-1">${l}-</button><button data-act="bd-size" data-a="${a}" data-d="1">${l}+</button>`;
    pr.innerHTML=`<b>${KINDS[e.q.k].n}</b><div class="bd-g">Move ${ax('x','X')}${ax('y','Up')}${ax('z','Z')}</div><div class="bd-g">Size ${e.q.k==='coin'?'<i>fixed</i>':sz('x','W')+sz('y','H')+sz('z','D')}</div>
      <div class="bd-g"><button data-act="bd-dup">Duplicate</button><button class="danger" data-act="bd-del">Delete</button></div>`;
    pr.classList.remove('hidden');this.outlineNow();
  },
  outlineNow(){
    const e=this.part(),o=this.outline;if(!o)return;
    if(!e){o.visible=false;return}
    const q=e.q,sx=q.k==='coin'?2.6:q.sx,sy=q.k==='coin'?2.6:q.sy,sz=q.k==='coin'?2.6:q.sz;
    o.position.set(q.x,q.y,q.z);o.scale.set(sx+.25,sy+.25,sz+.25);o.visible=true;
  },
  changed(m){
    if(!this.on){return}
    if(m.op==='add'&&this.wantSel){this.wantSel=false;this.select(m.part.id)}
    else if(m.op==='del'&&m.id===this.sel)this.select(0);
    else if(m.op==='upd'&&m.id===this.sel)this.select(this.sel);
    else if(m.op==='load'){this.select(0)}
    if(m.op==='sky'){const s=$('#bd-sky');if(s)s.value=m.sky}
  },
  key(e){
    const step=this.snap,k=e.code;let h=true;
    if(k==='Delete'||k==='Backspace')this.del();
    else if(k==='ArrowLeft')this.nudge('x',-1);else if(k==='ArrowRight')this.nudge('x',1);
    else if(k==='ArrowUp')this.nudge('z',-1);else if(k==='ArrowDown')this.nudge('z',1);
    else if(k==='PageUp'||(k==='KeyR'&&this.sel))this.nudge('y',1);else if(k==='PageDown'||(k==='KeyF'&&this.sel))this.nudge('y',-1);
    else if((e.ctrlKey||e.metaKey)&&k==='KeyD')this.dup();
    else h=false;
    if(h)e.preventDefault();return h;
  }
};

/* ============ the LAN button: rooms on this network, make a room ============ */
const Lan={rooms:[],timer:0,ok:false,sel:'baseplate',
  start(){this.stop();this.refresh();this.timer=setInterval(()=>this.refresh(),4000)},
  stop(){clearInterval(this.timer);this.timer=0},
  async refresh(){
    if(!Net.base())return;
    try{const r=await fetch(Net.api('/api/lan/rooms'),{cache:'no-store'});if(!r.ok)throw 0;const j=await r.json();this.rooms=j.rooms||[];this.ok=true}
    catch(e){this.ok=false}
    paintLan();
  },
  async create(){
    const name=(($('#lan-name')||{}).value||'').trim()||(S.user.name+"'s room"),k=this.sel;let map,tpl;
    if(k.startsWith('game:')){const g=S.games.find(x=>x.id===k.slice(5));if(!g){toastUI('Pick a map first.');return}map={parts:g.parts,sky:g.sky};tpl='mine'}
    else{const t=LAN_TEMPLATES[k]||LAN_TEMPLATES.baseplate;map={parts:t.parts,sky:t.sky};tpl=k}
    let r;try{r=await Account.call('POST','/api/lan/rooms',{name,ownerName:S.user.name,tpl,map},15000)}catch(e){toastUI('Could not reach the LAN server.');return}
    if(!r.ok){toastUI((r.data&&r.data.error)||'Could not make the room.');return}
    Store.set('lansecret:'+r.data.room,r.data.secret);this.enter(r.data.room,r.data.name,r.data.secret);
  },
  enter(key,name,secret){
    const art0=art('custom',key+'|day');
    Play.start({id:'lan-'+key,title:name,genre:'LAN',art:'custom',seed:key+'|day',thumb:art0,creator:'LAN',build:buildLanMap,data:{},lanRoom:key,secret:secret||Store.get('lansecret:'+key,''),noHistory:true});
  },
  saveMap(){
    const L=W&&W.lan;if(!L||!L.parts.size){toastUI('There is nothing to save yet.');return}
    const parts=[...L.parts.values()].map(e=>{const q=Object.assign({},e.q);return q}).slice(0,600);
    const g={id:'g'+Date.now().toString(36)+Math.floor(Math.random()*999).toString(36),title:String((Net.lan&&Net.lan.name)||'LAN map').slice(0,40),desc:'Saved from a LAN room.',sky:L.sky,pub:false,parts};
    S.games.unshift(g);save();toastUI('Saved a copy in Create'+(L.parts.size>600?' (the first 600 parts)':''));
  }
};
function lanHTML(){
  const online=!!Net.base();
  const mine=S.games.map(g=>`<button class="lan-tpl${Lan.sel==='game:'+g.id?' on':''}" data-act="lan-tpl" data-k="game:${esc(g.id)}"><b>${esc(g.title)}</b><span>Your game &middot; ${g.parts.length} parts</span></button>`).join('');
  return `<section class="lan-hero"><div class="lan-ico">${ico('wifi',46)}<i></i><i></i><i></i></div><div><h1 class="h1">LAN</h1><p>Play and build with people on your Wi-Fi. Make a room, pick a map, and change it while you play.</p></div></section>`+
  (online?`<div class="lan-grid"><section class="lan-card"><h2>Rooms on this network</h2><div id="lan-rooms" class="lan-rooms"><p class="muted">Looking for rooms...</p></div></section>
    <section class="lan-card"><h2>Make a room</h2><label class="lbl" for="lan-name">Room name</label><input type="text" id="lan-name" maxlength="30" placeholder="${esc(S.user.name)}'s room" autocomplete="off">
      <div class="lbl">Map</div><div class="lan-tpls"><button class="lan-tpl${Lan.sel==='baseplate'?' on':''}" data-act="lan-tpl" data-k="baseplate"><b>Baseplate</b><span>The default map. A big flat plate, ready to build on.</span></button><button class="lan-tpl${Lan.sel==='starter'?' on':''}" data-act="lan-tpl" data-k="starter"><b>Starter course</b><span>A small obby to change and extend.</span></button>${mine}</div>
      <button class="btn brand" data-act="lan-create">Create and enter</button>
      <p class="muted" style="margin-top:10px">You are the owner. You can build while everyone plays. If you leave, the room waits 30 seconds, then the top player on the leaderboard takes over. Come back and it is yours again.</p></section></div>`
  :`<div class="lan-grid"><section class="lan-card"><h2>LAN needs the IndieBlox program</h2><p>Start the program on one computer (double-click <b>Start IndieBlox</b> in the download). Then open the address it shows on every device on the same Wi-Fi. This is where the LAN button works.</p><a class="btn" href="#/together">Play together instead</a></section></div>`);
}
function paintLan(){
  const box=$('#lan-rooms');if(!box)return;
  if(!Lan.ok){box.innerHTML='<p class="muted">Cannot reach the LAN server. Is the program still running?</p>';return}
  if(!Lan.rooms.length){box.innerHTML='<p class="muted">No rooms yet. Make one on the right.</p>';return}
  box.innerHTML=Lan.rooms.map(r=>{
    const mine=!!Store.get('lansecret:'+r.key,'');
    return `<div class="lan-room"><div class="lan-rn"><b>${esc(r.name)}</b><span>Owner ${esc(r.owner)}${mine?' (you)':''} &middot; ${r.players}/${r.cap} playing &middot; ${r.parts} parts${r.away?' &middot; <em>owner away</em>':''}</span></div><button class="btn sm brand" data-act="lan-join" data-k="${esc(r.key)}" data-n="${esc(r.name)}">${mine?'Enter':'Join'}</button></div>`;
  }).join('');
}
const LanActs={
  'lan-tpl':t=>{Lan.sel=t.dataset.k;$$('.lan-tpl').forEach(b=>b.classList.toggle('on',b===t))},
  'lan-create':()=>Lan.create(),
  'lan-join':t=>Lan.enter(t.dataset.k,t.dataset.n),
  'g-savemap':()=>Lan.saveMap(),
  'bd-toggle':()=>Build.toggle(),
  'bd-exit':()=>Build.off(),
  'bd-tool':t=>{Build.tool=t.dataset.v;if(Build.tool==='place')Build.select(0);Build.sync()},
  'bd-kind':t=>{Build.kind=t.dataset.v;Build.tool='place';Build.select(0);Build.sync()},
  'bd-col':t=>{Build.color=t.dataset.v;const c=$('#bd-color');if(c)c.value=Build.color;if(Build.sel)Build.patch({c:Build.color});Build.sync()},
  'bd-nudge':t=>Build.nudge(t.dataset.a,+t.dataset.d),
  'bd-size':t=>Build.resize(t.dataset.a,+t.dataset.d),
  'bd-del':()=>Build.del(),
  'bd-dup':()=>Build.dup(),
  'bd-zoom':t=>{Build.cam.dist=clamp(Build.cam.dist*(+t.dataset.d>0?1.2:.83),8,200)}
};

/* ============ small ui helpers ============ */
function toastUI(msg){
  const r=$('#toast-root'),d=document.createElement('div');d.className='toast';d.textContent=msg;r.appendChild(d);
  setTimeout(()=>{d.remove()},2600);
}
function modal(html,cls){$('#modal-root').innerHTML=`<div class="modal" data-act="modal-bg"><div class="box${cls?' '+cls:''}" role="dialog" aria-modal="true">${html}</div></div>`;const i=$('#modal-root input[type=text]');if(i)i.focus()}
function closeModal0(){$('#modal-root').innerHTML=''}
let _confirmCb=null;
function confirmBox(title,msg,okLabel,cb){
  _confirmCb=cb;
  modal(`<h2>${esc(title)}</h2><p>${msg}</p><div class="acts"><button class="btn" data-act="modal-close">Cancel</button><button class="btn brand" data-act="confirm-ok">${esc(okLabel)}</button></div>`);
}
function headImg(cls){
  if(S.head)return `<img class="${cls}" alt="" src="${S.head}">`;
  return `<div class="${cls}" style="display:grid;place-items:center;font-family:var(--disp);font-size:1.1em;color:#2a1a00">${esc((S.user?S.user.name:'G').charAt(0).toUpperCase())}</div>`;
}
function refreshTop(){
  $('#coins').innerHTML=coinIco(18)+'<span>'+(S.user?S.user.coins.toLocaleString():'0')+'</span>';
  $('#me').innerHTML=headImg('head')+'<b>'+esc(S.user?S.user.name:'Guest')+'</b>';
  const lb=$('#login-btn');if(lb)lb.classList.toggle('hidden',!(S.user&&!Account.token&&Net.statsOk));
}
function refreshCoins(){const el=$('#coins span');if(el&&S.user)el.textContent=S.user.coins.toLocaleString()}
let _headT=0;
function queueHead(){clearTimeout(_headT);_headT=setTimeout(()=>{if(S.user&&R.ok){S.head=headshot(S.user.avatar);refreshTop()}},300)}
function freshUser(name){return{name,coins:500,avatar:Object.assign({},AV_DEFAULT),owned:[],played:[],votes:{},favs:[],best:{}}}

/* ============ game data helpers ============ */
function gameFromCustom(c){
  return{id:c.id,title:c.title,genre:'Community',art:'custom',seed:c.id+'|'+c.sky,creator:S.user?S.user.name:'You',likes:90,active:0,visits:0,
    desc:c.desc||'A game made in IndieBlox Studio.',how:['Move with W A S D or the arrow keys','Press Space to jump','Explore and reach the finish'],build:buildCustom,data:c,community:true,pub:c.pub};
}
function gameFromRemote(r){
  return{id:r.id,title:r.title,genre:'Community',art:'custom',seed:r.id+'|'+r.sky,creator:r.author||'Creator',likes:90,active:0,visits:0,
    desc:r.desc||'A game made in IndieBlox Studio.',how:['Move with W A S D or the arrow keys','Press Space to jump','Explore and reach the finish'],
    build:buildCustom,data:Community.full[r.id]||null,community:true,remote:true,pub:true};
}
function allGames(){
  const mine=S.games.filter(g=>g.pub),ids=new Set(mine.map(g=>g.id));
  const remote=Community.ok?Community.list.filter(r=>!ids.has(r.id)).map(gameFromRemote):[];
  return PREMADE.concat(mine.map(gameFromCustom),remote);
}
function findGame(id){
  const p=PREMADE.find(g=>g.id===id);if(p)return p;
  const c=S.games.find(g=>g.id===id);if(c)return gameFromCustom(c);
  const r=Community.list.find(x=>x.id===id);return r?gameFromRemote(r):null;
}
function thumbOf(g){return art(g.art,g.seed)}
function defOf(g){return Object.assign({},g,{thumb:thumbOf(g),creator:g.creator||'IndieBlox'})}
function likePct(g){const v=(S.user&&S.user.votes[g.id])||0;return clamp(Math.round(g.likes+v*(g.community?4:1)),1,100)}
function activeOf(g){const c=Net.count(g.id);if(c!==null)return c;return g.community?null:Math.round(g.active*(.92+.16*Math.sin(Date.now()/90000+hash(g.id)%7)))}
async function launch(id,opts){
  let g=findGame(id);
  if(!g&&Net.api('/x')){toastUI('Loading game');await Community.fetchOne(id);g=findGame(id)}
  if(!g)return;
  if(g.remote&&!g.data){
    toastUI('Loading game');const r=await Community.fetchOne(id);
    if(!r){toastUI('Could not load that game');return}g=findGame(id);
  }
  Sfx.init();Play.start(Object.assign(defOf(g),opts||{}));
}
function cardHTML(g){
  const a=activeOf(g);
  return `<div class="card" data-act="open" data-id="${g.id}" tabindex="0" role="link" aria-label="${esc(g.title)}"><div class="thumb"><img alt="" src="${thumbOf(g)}"></div><h3>${esc(g.title)}</h3>${STANDALONE?`<div class="stats"><span>${esc(g.genre)}</span></div>`:`<div class="stats"><span>${ico('thumb',14)}${likePct(g)}%</span><span>${ico('users',14)}${a==null?'New':fmtNum(a)}</span></div>`}</div>`;
}
function rowHTML(title,games,link){
  return `<section class="row"><div class="row-h"><h2>${title}</h2>${link?`<a href="${link}">See all</a>`:''}</div><div class="scroller">${games.map(cardHTML).join('')}</div></section>`;
}

/* ============ views ============ */
function heroDeco(){return `<svg class="deco" viewBox="0 0 330 250" aria-hidden="true">${isoC(232,30,46,'#ff7a1a')+isoC(172,86,46,'#fff3d0')+isoC(290,92,46,'#1b1200')+isoC(232,144,46,'#ffffff')}</svg>`}
function homeHTML(){
  const u=S.user,cont=u.played.map(findGame).filter(Boolean).slice(0,8),last=cont[0];
  const comm=allGames().filter(g=>g.community);
  return `<div class="hero">${headImg('head')}<div><h1>Hey ${esc(u.name)}. Ready to jump in?</h1><p>Six games are live, and each one is built with the same tools you get in Studio.</p><div class="acts"><button class="btn dark" data-act="play" data-id="${last?last.id:'sky-obby'}">${ico('play',16)} ${last?'Jump back in':'Play Sky Obby'}</button><a class="btn line" href="#/create">Build a game</a></div></div>${heroDeco()}</div>`+
    (cont.length?rowHTML('Continue playing',cont):'')+
    rowHTML('Featured games',PREMADE,'#/games')+
    (comm.length?rowHTML('Made by creators',comm,'#/games?g=Community'):
      `<section class="row"><div class="row-h"><h2>Made by creators</h2></div><div class="empty"><b>No community games yet</b>Games you publish from Studio show up here for everyone to play.<br><a class="btn brand" href="#/create">Open Studio</a></div></section>`);
}
function discoverHTML(qs){
  const q=(qs.get('q')||'').trim().toLowerCase(),gf=qs.get('g')||'All';
  const genres=['All','Obby','Survival','Adventure','Shooter','Tycoon','Community'];
  const list=allGames().filter(g=>(gf==='All'||g.genre===gf)&&(!q||g.title.toLowerCase().includes(q)||g.genre.toLowerCase().includes(q)));
  return `<h1 class="h1">${q?'Results for &ldquo;'+esc(q)+'&rdquo;':'Discover'}</h1><div class="chips">${genres.map(g=>`<a class="chip${g===gf?' on':''}" href="#/games?g=${g}${q?'&q='+encodeURIComponent(q):''}">${g}</a>`).join('')}</div>`+
    (list.length?`<div class="grid" style="margin-top:18px">${list.map(cardHTML).join('')}</div>`:`<div class="empty" style="margin-top:18px"><b>No games found</b>Try a different word or pick another genre.</div>`);
}
function gameHTML(id){
  const h=gameHTML0(id);   // the single-file build has no players online, so it hides the sample player counts and votes
  return STANDALONE?h.replace(/<button class="btn icon[^"]*" data-act="(?:vote|fav)"[\s\S]*?<\/button>/g,'').replace(/<div><span>(?:Playing|Approval|Visits)<\/span><b>[^<]*<\/b><\/div>/g,''):h;
}
function gameHTML0(id){
  const g=findGame(id);
  if(!g)return `<div class="empty"><b>Game not found</b>It may have been unpublished or deleted.<br><a class="btn brand" href="#/games">Back to Discover</a></div>`;
  const v=S.user.votes[g.id]||0,fav=S.user.favs.includes(g.id),a=activeOf(g);
  const best=S.user.best[{ 'sky-obby':'obby','lava-rise':'lava','coin-islands':'islands' }[g.id]];
  const how=g.how.slice();if(IS_TOUCH)how.unshift('On a touch screen, drag on the left to move and on the right to look');
  return `<div class="gp"><div class="gp-top"><div class="gp-thumb"><img alt="" src="${thumbOf(g)}"></div><div class="gp-info"><h1>${esc(g.title)}</h1><div class="by">By <b>${esc(g.creator||'IndieBlox')}</b></div>
    <div class="gp-acts"><button class="btn play" data-act="play" data-id="${g.id}">Play</button>${Account.token&&Net.statsOk?`<button class="btn" data-act="play-priv" data-id="${g.id}" title="Only people you invite, or who have your link, can join">Private room</button>`:''}${!Net.statsOk&&PREMADE.some(x=>x.id===g.id)&&P2PUI.supported()?`<button class="btn" data-act="p2p-host" data-id="${g.id}" title="Host this game and invite friends with a code">Play with friends</button>`:''}
    <button class="btn icon${v===1?' on':''}" data-act="vote" data-v="1" data-id="${g.id}" aria-label="Like" aria-pressed="${v===1}">${ico('thumb')}</button>
    <button class="btn icon${v===-1?' on':''}" data-act="vote" data-v="-1" data-id="${g.id}" aria-label="Dislike" aria-pressed="${v===-1}">${ico('thumbd')}</button>
    <button class="btn icon${fav?' on':''}" data-act="fav" data-id="${g.id}" aria-label="Favorite" aria-pressed="${fav}">${ico('star')}</button></div>
    <div class="gp-stats"><div><span>Playing</span><b>${a==null?'New':a.toLocaleString()}</b></div><div><span>Approval</span><b>${likePct(g)}%</b></div><div><span>Visits</span><b>${g.visits?fmtNum(g.visits):'New'}</b></div><div><span>Genre</span><b>${esc(g.genre)}</b></div>${best!==undefined?`<div><span>Your best</span><b>${g.id==='coin-islands'||g.id==='sky-obby'||g.id==='lava-rise'?fmtTime(best):best}</b></div>`:''}</div></div></div>
    <div class="sec"><h2>About</h2><p>${esc(g.desc)}</p></div>
    <div class="sec"><h2>Controls</h2><ul>${how.map(h=>`<li>${esc(h)}</li>`).join('')}</ul></div></div>`;
}
function mgCard(g){
  const gg=gameFromCustom(g);
  return `<div class="mgc"><div class="thumb"><img alt="" src="${thumbOf(gg)}"></div><div class="b"><h3>${esc(g.title)}</h3><span class="tag${g.pub?' live':''}">${g.pub?'Published':'Draft'}</span><div class="m">
    <button class="btn sm brand" data-act="edit-game" data-id="${g.id}">${ico('edit',15)} Edit</button><button class="btn sm" data-act="play" data-id="${g.id}">${ico('play',14)} Play</button>
    <button class="btn sm" data-act="pub-game" data-id="${g.id}">${g.pub?'Unpublish':'Publish'}</button><button class="btn sm danger" data-act="del-game" data-id="${g.id}" aria-label="Delete">${ico('trash',15)}</button></div></div></div>`;
}
function createHTML(){
  return `<div class="gp"><h1 class="h1">Create</h1><p class="muted" style="max-width:62ch;margin-top:4px">IndieBlox Studio lets you build a game out of blocks, test it right away, and publish it for everyone to play.</p>
    <div class="row2"><button class="btn brand" data-act="new-game">${ico('plus',16)} New game</button><button class="btn" data-act="import-game">Import a share code</button></div>`+
    (S.games.length?`<div class="mg">${S.games.map(mgCard).join('')}</div>`:`<div class="empty" style="margin-top:18px"><b>You have not built a game yet</b>New games start with a small course you can test in one click.</div>`)+
    `<div class="sec"><h2>How Studio works</h2><ul><li>Pick a part on the left, then click the ground to place it.</li><li>Click a part to select it, then change its size, position and color.</li><li>Use Test to play your game, and Publish when it is ready.</li><li>Share a code so a friend can import your game.</li></ul></div></div>`;
}

/* ============ avatar editor ============ */
const Avatar={tab:'colors',sc:null,cam:null,av:null,yaw:.4,drag:null,ok:false,
  start(){
    const st=$('#av-stage');this.ok=R.attach(st);
    if(!this.ok){st.innerHTML='<div class="empty" style="margin:20px">The 3D preview needs WebGL, which is turned off in this browser.</div>';this.fill();return}
    this.sc=new THREE.Scene();
    this.sc.add(new THREE.HemisphereLight(0xffffff,0xc08a4a,.95));
    const d=new THREE.DirectionalLight(0xffffff,.65);d.position.set(6,10,12);this.sc.add(d);
    const fl=new THREE.Mesh(new THREE.CylinderGeometry(4.4,4.4,.3,44),new THREE.MeshLambertMaterial({color:'#2a1a00'}));fl.position.y=-.15;this.sc.add(fl);
    this.cam=new THREE.PerspectiveCamera(32,1,.1,100);this.cam.position.set(0,3.8,17.5);this.cam.lookAt(0,3,0);
    R.onfit=(w,h)=>{this.cam.aspect=w/h;this.cam.updateProjectionMatrix()};R.fit();
    this.rebuild();
    st.onpointerdown=e=>{this.drag={x:e.clientX};st.setPointerCapture(e.pointerId)};
    st.onpointermove=e=>{if(this.drag){this.yaw+=(e.clientX-this.drag.x)*.012;this.drag.x=e.clientX}};
    st.onpointerup=st.onpointercancel=()=>{this.drag=null};
    Loop.fn=(dt,t)=>{
      if(!this.drag)this.yaw+=dt*.55;this.av.rotation.y=this.yaw;
      animAvatar(this.av,t,0,false,null,dt,null);R.render(this.sc,this.cam);
    };
    this.fill();
  },
  rebuild(){if(!this.sc)return;if(this.av){this.sc.remove(this.av);disposeObj(this.av)}this.av=buildAvatar(S.user.avatar);this.av.rotation.y=this.yaw;this.sc.add(this.av)},
  stop(){Loop.fn=null;R.onfit=null;if(this.sc){this.sc.traverse(o=>{if(o.geometry)o.geometry.dispose()});this.sc=null}this.av=null;R.detach()},
  commit(){save();this.rebuild();queueHead()},
  fill(){const b=$('#av-body');if(b)b.innerHTML=this.body();$$('.tab').forEach(t=>t.classList.toggle('on',t.dataset.t===this.tab));avAfterFill()},
  swRow(title,key,pal,also){
    const cur=S.user.avatar[key];
    return `<div class="swrow"><h4>${title}</h4><div class="sws">${pal.map(c=>`<button class="sw${c===cur?' on':''}" style="background:${c}" data-act="av-color" data-k="${key}" data-v="${c}" aria-label="${c}"></button>`).join('')}<input type="color" value="${cur}" data-input="av-color" data-k="${key}" aria-label="Custom color"></div></div>`;
  },
  body(){return avBody()}
};
function avatarHTML(){
  const tabs=AV_TABS;
  return `<div class="av-wrap"><div class="av-stage" id="av-stage"><div class="hint">Drag to turn your avatar</div></div><div class="av-panel"><div class="tabs">${tabs.map(t=>`<button class="tab" data-act="av-tab" data-t="${t[0]}">${t[1]}</button>`).join('')}</div><div id="av-body"></div>
    <div class="av-tools"><button class="btn sm" data-act="av-rand">${ico('dice',16)} Randomize</button><button class="btn sm" data-act="av-reset">Reset avatar</button></div></div></div>`;
}

/* ============ modals: welcome, profile, app ============ */
function showWelcome(){
  const nm=botName().replace(/\d+$/,'')+Math.floor(rand(10,99));
  modal(`<h2>Welcome to IndieBlox</h2><p>Pick a username. You can change it any time.</p><input type="text" id="wname" maxlength="18" value="${esc(nm)}" aria-label="Username" autocomplete="off"><div class="acts"><button class="btn brand" data-act="welcome-ok">Let&rsquo;s play</button></div>`);
  setTimeout(()=>{const i=$('#wname');if(i){i.focus();i.select()}},30);
}
function showProfile(){
  const th=Store.get('theme','auto'),acct=!!Account.token;
  modal(`<h2>Your profile</h2>${acct?`<p>Signed in as <b>${esc(Account.user)}</b>. Your progress is saved to your account.</p>`:'<p>Your progress is saved in this browser only.</p><input type="text" id="pname" maxlength="18" value="'+esc(S.user.name)+'" aria-label="Username">'}
    <div class="seg" style="margin-bottom:14px" role="group" aria-label="Theme">${['auto','light','dark'].map(t=>`<button class="${th===t?'on':''}" data-act="theme" data-t="${t}">${t[0].toUpperCase()+t.slice(1)}</button>`).join('')}</div>
    <div class="acts">${acct?'<button class="btn danger" data-act="logout">Log out</button>':`<button class="btn danger" data-act="reset-all">Reset everything</button>${Net.statsOk?'<button class="btn" data-act="auth-open">Log in</button>':''}`}<button class="btn" data-act="modal-close">Close</button>${acct?'':'<button class="btn brand" data-act="profile-save">Save name</button>'}</div>`);
}
let _installEvt=null;
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();_installEvt=e});
function showApp(){
  modal(`<h2>Get the IndieBlox app</h2><p>IndieBlox installs like an app and opens full screen, with no browser bars.</p><ol><li>Android or desktop Chrome: use the install button below, or the install icon in the address bar.</li><li>iPhone or iPad: tap Share, then Add to Home Screen.</li></ol><div class="acts"><button class="btn" data-act="modal-close">Close</button>${_installEvt?'<button class="btn brand" data-act="install-go">Install now</button>':''}</div>`);
}
function applyTheme(){const t=Store.get('theme','auto'),r=document.documentElement;if(t==='auto')r.removeAttribute('data-theme');else r.setAttribute('data-theme',t)}

/* ============ router ============ */
const NAV_FX={home:['#ffb31a','#ff7a18'],games:['#2ec5ff','#2b6cff'],avatar:['#ff6ec7','#b44cff'],friends:['#ff6b81','#ff2d55'],lan:['#19d3c5','#0a8bd6'],together:['#8be04e','#1fae6a'],create:['#ffa63d','#8e5bff']};
function navFx(n,a){   // sound + animation when a menu item is used
  Sfx.init();Sfx.nav(n);
  const ni=a&&a.querySelector('.ni');if(!ni)return;
  ni.classList.remove('fx');void ni.offsetWidth;ni.classList.add('fx');clearTimeout(ni._t);ni._t=setTimeout(()=>ni.classList.remove('fx'),1500);
}
document.addEventListener('click',e=>{const a=e.target.closest&&e.target.closest('#side a[data-n]');if(a)navFx(a.dataset.n,a)});
function sideHTML(){
  const items=[['home','Home','home'],['games','Discover','discover'],['avatar','Avatar','avatar'],['friends','Friends','users'],['lan','LAN','wifi'],['together','Together','link'],['create','Create','create']].filter(i=>!(STANDALONE&&i[0]==='friends'));
  return items.map(i=>{const f=NAV_FX[i[0]]||['#ffb31a','#ff7a18'];return `<a href="#/${i[0]}" data-n="${i[0]}" style="--c1:${f[0]};--c2:${f[1]}"><span class="ni">${ico(i[2])}</span><span class="nl">${i[1]}</span></a>`}).join('')+(STANDALONE?'':`<hr><button data-act="app">${ico('app')}<span>Get the app</span></button><small>IndieBlox.com</small>`);
}
function markNav(n){
  const m={game:'games',studio:'create',p2p:'together'}[n]||n;
  $$('#side a,#topnav a').forEach(a=>a.classList.toggle('on',a.dataset.n===m));
  const v=$('#view');if(v){v.dataset.page=m;v.classList.remove('pg-in');void v.offsetWidth;v.classList.add('pg-in')}   // each page arrives its own way
}
function route(){
  const h=location.hash.replace(/^#\/?/,'')||'home',bits=h.split('?'),parts=bits[0].split('/'),name=parts[0];
  if(STANDALONE&&(name==='friends'||name==='join')){history.replaceState(null,'','#/home');return route()}
  Lan.stop();
  if(Avatar.sc)Avatar.stop();if(typeof Studio!=='undefined'&&Studio.active)Studio.stop();
  const hn=location.hash,view=$('#view');view.classList.remove('flush');view.scrollTop=0;
  if(!S.user){view.innerHTML='';return}
  markNav(name);refreshTop();
  if(name==='home'||name==='games'||name==='game'){
    const again=()=>{if(!Play.active&&location.hash===hn)route()};
    Net.refreshStats().then(f=>{if(f)again()});Community.refresh().then(ch=>{if(ch)again()});
  }
  switch(name){
    case'games':view.innerHTML=discoverHTML(new URLSearchParams(bits[1]||''));break;
    case'game':{
      const id=parts[1];
      if(!findGame(id)&&Net.api('/x')&&!Community.miss.has(id)){
        view.innerHTML='<div class="empty"><b>Loading game</b></div>';
        Community.fetchOne(id).then(r=>{if(!r)Community.miss.add(id);if(location.hash===hn)route()});break;
      }
      view.innerHTML=gameHTML(id);break}
    case'avatar':view.innerHTML=avatarHTML();Avatar.start();break;
    case'create':view.innerHTML=createHTML();break;
    case'friends':view.innerHTML=friendsHTML();paintFriends();Friends.refresh();break;
    case'together':view.innerHTML=togetherHTML();fillLan();break;
    case'lan':view.innerHTML=lanHTML();Lan.start();break;
    case'join':{
      const key=decodeURIComponent(parts[1]||''),gid=key.split('#')[0];
      if(!Account.token&&!Net.guests){Account.pendingJoin=key;view.innerHTML='<div class="empty"><b>Log in to join your friend</b></div>';showAuth('Log in to join your friend.');break}
      history.replaceState(null,'','#/game/'+gid);view.innerHTML=gameHTML(gid);launch(gid,{room:key});break}
    case'studio':view.classList.add('flush');Studio.open(parts[1]);break;
    default:view.innerHTML=homeHTML();
  }
}

/* ============ actions ============ */
const Acts={
  'modal-close':()=>closeModal(),
  'modal-bg':(t,e)=>{if(e.target===t)closeModal()},
  'confirm-ok':()=>{const cb=_confirmCb;_confirmCb=null;closeModal();if(cb)cb()},
  open:t=>{location.hash='#/game/'+t.dataset.id},
  play:t=>launch(t.dataset.id),
  vote:t=>{const id=t.dataset.id,v=+t.dataset.v,c=S.user.votes[id]||0;if(c===v)delete S.user.votes[id];else S.user.votes[id]=v;save();route()},
  fav:t=>{const id=t.dataset.id,i=S.user.favs.indexOf(id);if(i>=0)S.user.favs.splice(i,1);else S.user.favs.push(id);save();route()},
  app:()=>showApp(),
  'install-go':()=>{if(_installEvt){_installEvt.prompt();_installEvt=null}closeModal()},
  'welcome-ok':()=>{
    let n=($('#wname').value||'').trim().replace(/[<>]/g,'');if(n.length<3)n='Player'+Math.floor(rand(100,999));
    S.user=freshUser(n);save();closeModal();if(R.ok||R.init())S.head=headshot(S.user.avatar);refreshTop();route();
  },
  profile:()=>showProfile(),
  'profile-save':()=>{const n=($('#pname').value||'').trim().replace(/[<>]/g,'');if(n.length>=3){S.user.name=n;save();refreshTop();closeModal();route();toastUI('Name saved')}else toastUI('Use at least 3 characters')},
  theme:t=>{Store.set('theme',t.dataset.t);applyTheme();showProfile()},
  'reset-all':()=>confirmBox('Reset everything?','This deletes your avatar, coins and every game you made in this browser.','Reset',()=>{S.user=null;S.games=[];S.head='';save();refreshTop();location.hash='#/home';route();(Net.statsOk?showAuth():showWelcome())}),
  'g-resume':()=>Play.toggleMenu(),
  'g-respawn':()=>{if(W&&W.p.alive){W.p.inv=0;W.die('reset')}Play.toggleMenu()},
  'g-sound':()=>{Settings.set('sfx',!Sfx.on);$('#gm-sound').textContent=Sfx.on?'Sound on':'Sound off'},
  'g-leave':()=>Play.stop(),
  'g-keep':()=>{$('#gresult').classList.add('hidden');Play.paused=false;Lock.sync()},
  'g-again':()=>Play.restart(),
  'av-tab':t=>{Avatar.tab=t.dataset.t;Avatar.fill()},
  'av-color':t=>{S.user.avatar[t.dataset.k]=t.dataset.v;if(t.dataset.k==='torso')S.user.avatar.arms=t.dataset.v;Avatar.commit();Avatar.fill()},
  'av-item':t=>{
    const kind=t.dataset.kind,id=t.dataset.id,it=CATALOG[kind].find(x=>x[0]===id);
    if(isOwned(kind,id)){S.user.avatar[kind]=id;Avatar.commit();Avatar.fill();return}
    confirmBox('Buy '+it[1]+'?',`It costs ${it[2]} IndieCoins. You have ${S.user.coins}.`,'Buy',()=>{
      if(S.user.coins<it[2]){toastUI('Not enough coins. Play a game to earn more.');Sfx.play('err');return}
      S.user.coins-=it[2];S.user.owned.push(kind+':'+id);S.user.avatar[kind]=id;refreshTop();Sfx.play('buy');Avatar.commit();Avatar.fill();
    });
  },
  'av-rand':()=>{
    const r=randomAvatar();['skin','torso','arms','legs','accent'].forEach(k=>S.user.avatar[k]=r[k]);
    ['face','hat','back','shirt'].forEach(k=>{if(isOwned(k,r[k]))S.user.avatar[k]=r[k]});Avatar.commit();Avatar.fill();
  },
  'av-reset':()=>{S.user.avatar=Object.assign({},AV_DEFAULT);Avatar.commit();Avatar.fill()},
  'new-game':()=>{const g=Studio.newGame();location.hash='#/studio/'+g.id},
  'edit-game':t=>{location.hash='#/studio/'+t.dataset.id},
  'pub-game':t=>{const g=S.games.find(x=>x.id===t.dataset.id);if(g){setPublished(g,!g.pub);route()}},
  'del-game':t=>{const id=t.dataset.id,g=S.games.find(x=>x.id===id);if(!g)return;confirmBox('Delete '+esc(g.title)+'?','This cannot be undone.','Delete',()=>{if(g.pub)Community.drop(g);S.games=S.games.filter(x=>x.id!==id);save();route()})},
  'import-game':()=>modal(`<h2>Import a game</h2><p>Paste a share code from a friend.</p><textarea class="code" id="imp" placeholder="Paste share code"></textarea><div class="acts" style="margin-top:12px"><button class="btn" data-act="modal-close">Cancel</button><button class="btn brand" data-act="import-do">Import</button></div>`),
  'import-do':()=>{const g=Studio.importCode($('#imp').value);if(g){closeModal();location.hash='#/studio/'+g.id;toastUI('Game imported')}else toastUI('That code did not work')},
  'st-tool':t=>Studio.setTool(t.dataset.v),'st-kind':t=>Studio.setKind(t.dataset.v),'st-test':()=>Studio.test(),'st-pub':()=>Studio.publish(),
  'st-share':()=>Studio.share(),'st-copy':()=>{const a=$('#sharecode');a.select();try{document.execCommand('copy');toastUI('Copied')}catch(e){}},
  'st-del':()=>Studio.del(),'st-dup':()=>Studio.dup(),'st-nudge':t=>Studio.nudge(t.dataset.a,+t.dataset.d),'st-zoom':t=>Studio.zoom(+t.dataset.d),'st-back':()=>{location.hash='#/create'}
};
function closeModal(){closeModal0();if(W&&W.bt&&W.bt.picking)W.bt.go()}
Object.assign(Acts,AccountActs,SettingsActs,P2PActs,LanActs,BattleActs);
document.addEventListener('click',e=>{
  const t=e.target.closest('[data-act]');if(!t)return;
  const fn=Acts[t.dataset.act];if(!fn)return;
  Sfx.init();if(t.dataset.act!=='modal-bg'&&t.dataset.act!=='av-color')Sfx.play('click');fn(t,e);
});
document.addEventListener('keydown',e=>{
  if(Play.active)return;
  if(e.key==='Escape'&&$('#modal-root').firstChild)closeModal();
  if(e.key==='Enter'&&e.target&&e.target.id==='wname')Acts['welcome-ok']();
  if((e.key==='Enter'||e.key===' ')&&e.target&&e.target.classList&&e.target.classList.contains('card')){e.preventDefault();Acts.open(e.target)}
});
document.addEventListener('input',e=>{
  const t=e.target;
  if(t.dataset&&t.dataset.input==='av-color'){S.user.avatar[t.dataset.k]=t.value;if(t.dataset.k==='torso')S.user.avatar.arms=t.value;Avatar.commit()}
});

/* ============ avatar editor screens: many items, search, pages, colours, face builder, body ============ */
const AV_TABS=[['colors','Colors'],['face','Faces'],['hair','Hair'],['hat','Hats'],['acc','Face gear'],['back','Back'],['shirt','Shirts'],['pants','Pants'],['shoe','Shoes'],['body','Body']];
const AV_PAGE=24,AV_NAME={hat:'hats',hair:'hairstyles',acc:'face items',back:'back items',shirt:'shirts',pants:'pants',shoe:'shoes'};
const AV_BLANK='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const AvUI={q:'',page:0,vc:null,tq:0};

function avColStrip(){
  const cur=AvUI.vc,cols=VCOL.map(c=>`<button class="sw${c===cur?' on':''}" style="background:${c}" data-act="av-vcol" data-v="${c}" aria-label="${c}"></button>`).join('');
  return `<div class="av-cols"><span class="av-lbl">Colour</span><button class="chip${cur?'':' on'}" data-act="av-vcol" data-v="">Auto</button>${cols}<input type="color" id="av-vpick" value="${cur||'#ff5cae'}" aria-label="Pick any colour"></div>`;
}
function avBody(){
  const t=Avatar.tab;
  if(t==='colors')return Avatar.swRow('Skin','skin',SKIN_TONES)+Avatar.swRow('Shirt','torso',PALETTE)+Avatar.swRow('Sleeves','arms',PALETTE)+Avatar.swRow('Pants','legs',PALETTE)+Avatar.swRow('Accessory color','accent',PALETTE);
  if(t==='face')return avFaceHTML();
  if(t==='body')return avBodyHTML();
  const st=catalogStats(),n=CAT2[t].length-1;
  return `<div class="av-head"><input type="search" id="av-q" placeholder="Search ${n} ${AV_NAME[t]}" value="${esc(AvUI.q)}" aria-label="Search ${AV_NAME[t]}" autocomplete="off"><span class="av-count">${n} shapes &times; ${st.colours} colours = <b>${(n*st.colours).toLocaleString()}</b> looks</span></div>
    ${avColStrip()}<div id="av-grid" class="items"></div><div id="av-pager" class="av-pager"></div>`;
}
function avTile(kind,x,cur){
  const own=isOwned(kind,x[0]),id=mkItem(x[0],AvUI.vc||(cur[0]===x[0]?cur[1]:null)),on=cur[0]===x[0];
  return `<button class="item${on?' on':''}" data-act="av-item" data-kind="${kind}" data-id="${x[0]}"><img alt="" data-th="${kind}|${id}" src="${Thumb.cache[kind+':'+id]||AV_BLANK}"><span>${esc(x[1])}</span><small>${own?(x[2]?'Owned':'Free'):coinIco(14)+x[2]}</small></button>`;
}
function avPaint(){
  const g=$('#av-grid');if(!g)return;
  const t=Avatar.tab,a=S.user.avatar,cur=parseItem(a[t]),q=AvUI.q;
  const list=CAT2[t].filter(x=>x[0]!=='none'&&(!q||x[1].toLowerCase().includes(q)||x[0].includes(q)));
  const pages=Math.max(1,Math.ceil(list.length/AV_PAGE));AvUI.page=clamp(AvUI.page,0,pages-1);
  const slice=list.slice(AvUI.page*AV_PAGE,AvUI.page*AV_PAGE+AV_PAGE);
  const none=(AvUI.page===0&&!q)?[['none','None',0]]:[];
  g.innerHTML=(none.concat(slice)).map(x=>avTile(t,x,cur)).join('')||'<p class="muted">Nothing matches that search.</p>';
  const pg=$('#av-pager');
  if(pg)pg.innerHTML=list.length>AV_PAGE?`<button class="btn sm" data-act="av-page" data-d="-1"${AvUI.page?'':' disabled'}>Back</button><span>Page ${AvUI.page+1} of ${pages} &middot; ${list.length} shapes</span><button class="btn sm" data-act="av-page" data-d="1"${AvUI.page<pages-1?'':' disabled'}>Next</button>`:`<span class="muted">${list.length} shape${list.length===1?'':'s'}</span>`;
  avThumbs();
}
function avThumbs(){   // draw the little previews a few at a time so the page stays smooth
  cancelAnimationFrame(AvUI.tq);
  const run=()=>{
    const imgs=$$('img[data-th]:not([data-ok])').slice(0,4);
    if(!imgs.length)return;
    for(const im of imgs){const [k,id]=im.dataset.th.split('|');const u=itemThumb(k,id);if(u)im.src=u;im.dataset.ok='1'}
    AvUI.tq=requestAnimationFrame(run);
  };
  AvUI.tq=requestAnimationFrame(run);
}
function avFaceHTML(){
  const a=S.user.avatar,cur=faceParts(a,a),st=catalogStats();
  const tiles=FACE_PRESETS.map(p=>{
    const own=isOwned('face',p.id),on=(a.face===p.id)||(a.face==='mix'&&cur.join()===p.parts.join());
    return `<button class="item${on?' on':''}" data-act="av-face" data-id="${p.id}"><img alt="" data-th="face|${p.id}" src="${Thumb.cache['face:'+p.id]||AV_BLANK}"><span>${esc(p.name)}</span><small>${own?(p.price?'Owned':'Free'):coinIco(14)+p.price}</small></button>`;
  }).join('');
  const row=(title,key,idx,list)=>`<div class="av-row"><h4>${title} <small>${list.length}</small></h4><div class="av-chips">${list.map(x=>`<button class="chip${cur[idx]===x[0]?' on':''}" data-act="av-part" data-p="${key}" data-id="${x[0]}">${esc(x[1])}</button>`).join('')}</div></div>`;
  return `<div class="av-head"><span class="av-count">${st.facePresets} ready-made faces, or build your own from ${EYES.length} eyes &times; ${MOUTHS.length} mouths &times; ${BROWS.length} brows &times; ${FXS.length} extras = <b>${st.faces.toLocaleString()}</b> faces</span><button class="btn sm" data-act="av-randface">${ico('dice',16)} Random face</button></div>
    <div class="items">${tiles}</div><h3 class="av-h3">Build a face</h3>${row('Eyes','eyes',0,EYES)}${row('Mouth','mouth',1,MOUTHS)}${row('Brows','brows',2,BROWS)}${row('Extras','fx',3,FXS)}`;
}
function avBodyHTML(){
  const a=S.user.avatar,sl=(k,l,lo,hi)=>`<label class="av-sl"><span>${l}</span><input type="range" id="av-${k}" min="${lo}" max="${hi}" value="${Math.round((+a[k]||1)*100)}" data-k="${k}"><b id="av-${k}-v">${Math.round((+a[k]||1)*100)}%</b></label>`;
  return `<p class="muted">Make your avatar taller, wider, or give it a bigger head. It only changes how you look.</p>${sl('bh','Height',80,125)}${sl('bw','Width',80,125)}${sl('hs','Head size',80,130)}<button class="btn sm" data-act="av-body-reset">Reset body</button>`;
}
function avAfterFill(){
  if(Avatar.tab==='face'||['colors','body'].includes(Avatar.tab)){if(Avatar.tab==='face')avThumbs();return}
  avPaint();
}
document.addEventListener('input',e=>{
  const t=e.target;if(!t||!t.id)return;
  if(t.id==='av-q'){AvUI.q=t.value.trim().toLowerCase();AvUI.page=0;avPaint();return}
  if(t.id==='av-vpick'){AvUI.vc=t.value;const a=S.user.avatar,k=Avatar.tab,cur=parseItem(a[k]);if(cur[0]!=='none'){a[k]=mkItem(cur[0],AvUI.vc);Avatar.commit()}avPaint();return}
  if(t.dataset&&t.dataset.k&&/^av-(bh|bw|hs)$/.test(t.id)){const v=(+t.value)/100;S.user.avatar[t.dataset.k]=v;const o=$('#'+t.id+'-v');if(o)o.textContent=t.value+'%';Avatar.rebuild()}
});
document.addEventListener('change',e=>{const t=e.target;if(t&&/^av-(bh|bw|hs)$/.test(t.id||''))Avatar.commit()});

const AvActs={
  'av-tab':t=>{Avatar.tab=t.dataset.t;AvUI.q='';AvUI.page=0;AvUI.vc=null;Avatar.fill()},
  'av-color':t=>{S.user.avatar[t.dataset.k]=t.dataset.v;if(t.dataset.k==='torso')S.user.avatar.arms=t.dataset.v;Avatar.commit();Avatar.fill()},
  'av-vcol':t=>{
    AvUI.vc=t.dataset.v||null;const a=S.user.avatar,k=Avatar.tab,cur=parseItem(a[k]);
    if(cur[0]!=='none'){a[k]=mkItem(cur[0],AvUI.vc);Avatar.commit()}
    const s=$('.av-cols');if(s)s.outerHTML=avColStrip();avPaint();
  },
  'av-item':t=>{
    const kind=t.dataset.kind,id=t.dataset.id,a=S.user.avatar;
    if(id==='none'){a[kind]='none';Avatar.commit();avPaint();return}
    const it=CAT_IDX[kind].get(id);if(!it)return;
    if(isOwned(kind,id)){a[kind]=mkItem(id,AvUI.vc);Avatar.commit();avPaint();return}
    confirmBox('Buy '+it[1]+'?',`It costs ${it[2]} IndieCoins and unlocks every colour. You have ${S.user.coins}.`,'Buy',()=>{
      if(S.user.coins<it[2]){toastUI('Not enough coins. Play a game to earn more.');Sfx.play('err');return}
      S.user.coins-=it[2];S.user.owned.push(kind+':'+id);a[kind]=mkItem(id,AvUI.vc);refreshTop();Sfx.play('buy');Avatar.commit();avPaint();
    });
  },
  'av-page':t=>{AvUI.page+=+t.dataset.d;avPaint()},
  'av-face':t=>{
    const id=t.dataset.id,p=FACE_PRESETS.find(x=>x.id===id);if(!p)return;
    const apply=()=>{Object.assign(S.user.avatar,faceCfg(id));Avatar.commit();Avatar.fill()};
    if(isOwned('face',id)){apply();return}
    confirmBox('Buy the '+p.name+' face?',`It costs ${p.price} IndieCoins. You have ${S.user.coins}.`,'Buy',()=>{
      if(S.user.coins<p.price){toastUI('Not enough coins. Play a game to earn more.');Sfx.play('err');return}
      S.user.coins-=p.price;S.user.owned.push('face:'+id);refreshTop();Sfx.play('buy');apply();
    });
  },
  'av-part':t=>{
    const a=S.user.avatar,p=faceParts(a,a).slice(),idx={eyes:0,mouth:1,brows:2,fx:3}[t.dataset.p];p[idx]=t.dataset.id;
    a.face='mix';a.eyes=p[0];a.mouth=p[1];a.brows=p[2];a.fx=p[3];Avatar.commit();Avatar.fill();
  },
  'av-randface':()=>{const a=S.user.avatar;a.face='mix';a.eyes=pick(EYES)[0];a.mouth=pick(MOUTHS)[0];a.brows=pick(BROWS)[0];a.fx=pick(FXS)[0];Avatar.commit();Avatar.fill()},
  'av-body-reset':()=>{Object.assign(S.user.avatar,{bh:1,bw:1,hs:1});Avatar.commit();Avatar.fill()},
  'av-rand':()=>{
    const r=randomAvatar();Object.assign(S.user.avatar,r);Avatar.commit();Avatar.fill();
  },
  'av-reset':()=>{S.user.avatar=Object.assign({},AV_DEFAULT);Avatar.commit();Avatar.fill()}
};
Object.assign(Acts,AvActs);

/* ============ IndieBlox Studio ============ */
const KINDS={
  solid:{n:'Block',c:'#8fa3b8',s:[8,1,8]},
  kill:{n:'Lava',c:'#ff5a1f',s:[8,1,8]},
  bounce:{n:'Jump pad',c:'#39d98a',s:[5,.8,5]},
  checkpoint:{n:'Checkpoint',c:'#ffd23f',s:[8,1,8]},
  finish:{n:'Finish',c:'#ffcf33',s:[10,1,10]},
  mover:{n:'Moving block',c:'#a45cff',s:[8,1,8]},
  coin:{n:'Coin',c:'#ffcf33',s:[2,2,2]},
  spawn:{n:'Spawn',c:'#3b8bff',s:[6,.4,6]}
};
const SKY_BG={day:'#bfe3ff',sunset:'#d59a9e',night:'#1c2748',space:'#0f0c2a'};
const ST_COIN_MAT=new THREE.MeshLambertMaterial({color:'#ffcf33',emissive:'#7a5200'});
const HEXRE=/^#[0-9a-f]{6}$/i;

const Studio={active:false,g:null,sc:null,cam:null,meshes:[],sel:-1,tool:'select',kind:'solid',snap:2,
  ob:{yaw:.7,pitch:.75,dist:70,tx:0,ty:0,tz:-16},ray:null,outline:null,drag:null,keys:{},saveT:0,_kd:null,_ku:null,

  newGame(){
    const g={id:'g'+Date.now().toString(36)+Math.floor(rand(0,999)).toString(36),title:'My first obby',desc:'An obby I built in IndieBlox Studio.',sky:'day',pub:false,parts:[
      {k:'solid',x:0,y:-.5,z:0,sx:24,sy:1,sz:24,c:'#5bd16a'},
      {k:'spawn',x:0,y:.2,z:0,sx:6,sy:.4,sz:6,c:'#3b8bff'},
      {k:'solid',x:0,y:1,z:-18,sx:6,sy:1,sz:6,c:'#ff8a3d'},
      {k:'solid',x:4,y:2,z:-27,sx:6,sy:1,sz:6,c:'#ffd23f'},
      {k:'mover',x:0,y:3,z:-37,sx:8,sy:1,sz:8,c:'#a45cff',ax:'x',amp:8,sp:1},
      {k:'checkpoint',x:0,y:4,z:-50,sx:10,sy:1,sz:10,c:'#ffd23f'},
      {k:'kill',x:0,y:3,z:-64,sx:14,sy:1,sz:18,c:'#ff5a1f'},
      {k:'solid',x:0,y:4,z:-64,sx:3,sy:1,sz:18,c:'#5b6470'},
      {k:'finish',x:0,y:4,z:-82,sx:10,sy:1,sz:10,c:'#ffcf33'},
      {k:'coin',x:0,y:4,z:-18,sx:2,sy:2,sz:2,c:'#ffcf33'},{k:'coin',x:4,y:5,z:-27,sx:2,sy:2,sz:2,c:'#ffcf33'},
      {k:'coin',x:0,y:7,z:-50,sx:2,sy:2,sz:2,c:'#ffcf33'},{k:'coin',x:0,y:7.5,z:-64,sx:2,sy:2,sz:2,c:'#ffcf33'}
    ]};
    S.games.unshift(g);save();return g;
  },
  importCode(txt){
    try{
      const o=JSON.parse(decodeURIComponent(escape(atob(String(txt).trim()))));
      if(!o||!Array.isArray(o.parts))return null;
      const num=(v,d)=>{v=+v;return isFinite(v)?clamp(v,-2000,2000):d};
      const parts=o.parts.slice(0,600).filter(q=>q&&KINDS[q.k]).map(q=>({k:q.k,x:num(q.x,0),y:num(q.y,0),z:num(q.z,0),sx:clamp(num(q.sx,4),.2,400),sy:clamp(num(q.sy,1),.2,400),sz:clamp(num(q.sz,4),.2,400),
        c:HEXRE.test(q.c)?q.c:KINDS[q.k].c,ax:q.ax==='z'?'z':'x',amp:clamp(num(q.amp,10),0,100),sp:clamp(num(q.sp,1),.1,5)}));
      if(!parts.length)return null;
      const g={id:'g'+Date.now().toString(36)+Math.floor(rand(0,999)).toString(36),title:String(o.title||'Imported game').slice(0,40),desc:String(o.desc||'').slice(0,240),sky:SKY_BG[o.sky]?o.sky:'day',pub:false,parts};
      S.games.unshift(g);save();return g;
    }catch(e){return null}
  },

  html(){
    const g=this.g;
    return `<div class="st"><div class="st-bar"><button class="btn sm" data-act="st-back">${ico('back',16)} My games</button><input class="t" id="st-title" maxlength="40" value="${esc(g.title)}" aria-label="Game title"><span class="saved" id="st-saved">Saved</span><span class="sp"></span>
      <button class="btn sm" data-act="st-share">${ico('share',15)} Share code</button><button class="btn sm brand" data-act="st-test">${ico('play',14)} Test</button><button class="btn sm${g.pub?' on':''}" data-act="st-pub" id="st-pubbtn">${g.pub?'Published':'Publish'}</button></div>
      <div class="st-pal"><div class="seg" role="group" aria-label="Tool"><button data-act="st-tool" data-v="select">Select</button><button data-act="st-tool" data-v="place">Place</button></div><h5>Parts</h5>
      ${Object.keys(KINDS).map(k=>`<button class="pk" data-act="st-kind" data-v="${k}"><i style="background:${KINDS[k].c}"></i>${KINDS[k].n}</button>`).join('')}
      <h5>Grid snap</h5><select id="st-snap" aria-label="Grid snap" style="background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:7px">${[1,2,4,8].map(v=>`<option value="${v}"${v===this.snap?' selected':''}>${v} studs</option>`).join('')}</select></div>
      <div class="st-view" id="st-view"><div class="tip" id="st-tip"></div><div class="zoom"><button class="btn sm icon" data-act="st-zoom" data-d="-1" aria-label="Zoom in">${ico('plus2',18)}</button><button class="btn sm icon" data-act="st-zoom" data-d="1" aria-label="Zoom out">${ico('minus2',18)}</button></div></div>
      <div class="st-props" id="st-props"></div></div>`;
  },
  open(id){
    const g=S.games.find(x=>x.id===id);if(!g){location.hash='#/create';return}
    this.g=g;this.sel=-1;this.tool='select';this.kind='solid';this.active=true;this.keys={};
    $('#view').innerHTML=this.html();
    const vw=$('#st-view');
    if(!R.attach(vw)){vw.innerHTML='<div class="empty" style="margin:20px">Studio needs WebGL, which is turned off in this browser.</div>';this.fillProps();return}
    this.sc=new THREE.Scene();this.sc.add(new THREE.HemisphereLight(0xffffff,0x8a97b8,.95));
    const d=new THREE.DirectionalLight(0xffffff,.55);d.position.set(30,60,20);this.sc.add(d);
    const grid=new THREE.GridHelper(400,100,0x3f5878,0x6f89a8);grid.position.y=.02;grid.material.transparent=true;grid.material.opacity=.5;this.sc.add(grid);
    this.outline=new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(1,1,1)),new THREE.LineBasicMaterial({color:0xffb31a}));this.outline.visible=false;this.sc.add(this.outline);
    this.cam=new THREE.PerspectiveCamera(50,1,.5,1500);this.ray=new THREE.Raycaster();
    R.onfit=(w,h)=>{this.cam.aspect=w/h;this.cam.updateProjectionMatrix()};R.fit();
    this.fitView();this.applySky();this.rebuildAll();this.syncPal();this.fillProps();this.bind(vw);
    Loop.fn=(dt,t)=>this.tick(dt,t);
  },
  stop(){
    if(!this.active)return;this.active=false;clearTimeout(this.saveT);save();if(this.g&&this.g.pub)Community.push(this.g);
    window.removeEventListener('keydown',this._kd);window.removeEventListener('keyup',this._ku);
    Loop.fn=null;R.onfit=null;if(this.sc){disposeObj(this.sc);this.sc=null}this.meshes=[];R.detach();
  },
  bind(vw){
    $('#st-title').addEventListener('input',e=>{this.g.title=e.target.value.slice(0,40)||'Untitled';this.dirty()});
    $('#st-snap').addEventListener('change',e=>{this.snap=+e.target.value;this.fillProps()});
    const pr=$('#st-props'),h=e=>this.propInput(e.target);pr.addEventListener('input',h);pr.addEventListener('change',h);
    vw.onpointerdown=e=>{if(e.target.closest('button'))return;this.drag={id:e.pointerId,x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY,t:performance.now(),btn:e.button};vw.setPointerCapture(e.pointerId)};
    vw.onpointermove=e=>{
      const d=this.drag;if(!d||d.id!==e.pointerId)return;
      const dx=e.clientX-d.x,dy=e.clientY-d.y;d.x=e.clientX;d.y=e.clientY;const o=this.ob;
      if(e.shiftKey||d.btn===1||d.btn===2){const s=o.dist*.0022;o.tx+=(-Math.cos(o.yaw)*dx+Math.sin(o.yaw)*dy)*s;o.tz+=(Math.sin(o.yaw)*dx+Math.cos(o.yaw)*dy)*s}
      else{o.yaw-=dx*.006;o.pitch=clamp(o.pitch+dy*.005,.08,1.5)}
    };
    vw.onpointerup=e=>{const d=this.drag;this.drag=null;if(d&&d.btn===0&&Math.hypot(e.clientX-d.sx,e.clientY-d.sy)<6&&performance.now()-d.t<450&&!e.target.closest('button'))this.click(e)};
    vw.onpointercancel=()=>{this.drag=null};
    vw.oncontextmenu=e=>e.preventDefault();
    vw.onwheel=e=>{e.preventDefault();this.zoom(e.deltaY>0?1:-1)};
    this._kd=e=>{
      if(Play.active||!this.active)return;const tg=e.target;
      if(tg&&(tg.tagName==='INPUT'||tg.tagName==='TEXTAREA'||tg.tagName==='SELECT'))return;
      this.keys[e.code]=true;
      if((e.ctrlKey||e.metaKey)&&e.code==='KeyD'){e.preventDefault();this.dup();return}
      if(this.sel<0)return;
      const m={ArrowLeft:['x',-1],ArrowRight:['x',1],ArrowUp:['z',-1],ArrowDown:['z',1],KeyR:['y',1],PageUp:['y',1],KeyF:['y',-1],PageDown:['y',-1]}[e.code];
      if(m){e.preventDefault();this.nudge(m[0],m[1])}else if(e.code==='Delete'||e.code==='Backspace'){e.preventDefault();this.del()}
    };
    this._ku=e=>{this.keys[e.code]=false};
    window.addEventListener('keydown',this._kd);window.addEventListener('keyup',this._ku);
  },
  tick(dt,t){
    const o=this.ob,k=this.keys,cam=this.cam;
    const f=(k.KeyW?1:0)-(k.KeyS?1:0),r=(k.KeyD?1:0)-(k.KeyA?1:0),sp=(k.ShiftLeft?90:45)*dt*(o.dist/70+.3);
    if(f||r){o.tx+=(-Math.sin(o.yaw)*f+Math.cos(o.yaw)*r)*sp;o.tz+=(-Math.cos(o.yaw)*f-Math.sin(o.yaw)*r)*sp}
    const cp=Math.cos(o.pitch);
    cam.position.set(o.tx+Math.sin(o.yaw)*cp*o.dist,o.ty+Math.sin(o.pitch)*o.dist,o.tz+Math.cos(o.yaw)*cp*o.dist);cam.lookAt(o.tx,o.ty,o.tz);
    const ps=this.g.parts;for(let i=0;i<ps.length;i++)if(ps[i].k==='coin')this.meshes[i].rotation.y=t*1.5;
    R.render(this.sc,cam);
  },
  fitView(){
    const ps=this.g.parts;if(!ps.length){Object.assign(this.ob,{tx:0,ty:0,tz:0,dist:60});return}
    let a=1e9,b=-1e9,c=1e9,d=-1e9;for(const q of ps){a=Math.min(a,q.x-q.sx/2);b=Math.max(b,q.x+q.sx/2);c=Math.min(c,q.z-q.sz/2);d=Math.max(d,q.z+q.sz/2)}
    Object.assign(this.ob,{tx:(a+b)/2,ty:0,tz:(c+d)/2,dist:clamp(Math.max(b-a,d-c)*1.05+30,50,260),yaw:.55,pitch:.95});
  },
  zoom(d){this.ob.dist=clamp(this.ob.dist*(d>0?1.18:.85),8,300)},
  applySky(){if(this.sc)this.sc.background=new THREE.Color(SKY_BG[this.g.sky]||SKY_BG.day)},

  makeMesh(q){
    let m;
    if(q.k==='coin')m=new THREE.Mesh(new THREE.OctahedronGeometry(1.2),ST_COIN_MAT);
    else m=mkBox(q.sx,q.sy,q.sz,q.c,{kind:q.k==='kill'?'kill':undefined});
    m.position.set(q.x,q.y,q.z);return m;
  },
  rebuildAll(){
    for(const m of this.meshes){this.sc.remove(m);m.geometry.dispose()}
    this.meshes=this.g.parts.map(q=>{const m=this.makeMesh(q);this.sc.add(m);return m});this.updateOutline();
  },
  rebuildMesh(i){
    const old=this.meshes[i];this.sc.remove(old);old.geometry.dispose();
    const m=this.makeMesh(this.g.parts[i]);this.sc.add(m);this.meshes[i]=m;
  },
  updateOutline(){
    const q=this.g.parts[this.sel],o=this.outline;if(!o)return;
    if(!q){o.visible=false;return}
    o.visible=true;o.position.set(q.x,q.y,q.z);o.scale.set(q.sx+.2,q.sy+.2,q.sz+.2);
  },
  select(i){this.sel=i;this.updateOutline();this.fillProps()},
  click(e){
    const vw=$('#st-view'),rc=vw.getBoundingClientRect();
    const ndc=new THREE.Vector2((e.clientX-rc.left)/rc.width*2-1,-((e.clientY-rc.top)/rc.height)*2+1);
    this.sc.updateMatrixWorld(true);this.ray.setFromCamera(ndc,this.cam);
    const hits=this.ray.intersectObjects(this.meshes,false);
    if(this.tool==='select'){this.select(hits.length?this.meshes.indexOf(hits[0].object):-1);return}
    let pt,n;
    if(hits.length){pt=hits[0].point.clone();n=hits[0].face.normal.clone()}
    else{const v=new THREE.Vector3();if(!this.ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0,1,0),0),v))return;pt=v;n=new THREE.Vector3(0,1,0)}
    this.place(pt,n);
  },
  place(pt,n){
    const K=KINDS[this.kind],s=K.s,sn=this.snap,sv=v=>Math.round(v/sn)*sn;
    if(this.g.parts.length>=600){toastUI('Studio holds up to 600 parts per game');return}
    if(this.kind==='spawn'){this.g.parts=this.g.parts.filter(q=>q.k!=='spawn')}
    let x=pt.x,y=pt.y,z=pt.z;
    if(Math.abs(n.y)>.5){x=sv(x);z=sv(z);y=pt.y+n.y*s[1]/2}
    else if(Math.abs(n.x)>.5){x=pt.x+n.x*s[0]/2;y=sv(y);z=sv(z)}
    else{z=pt.z+n.z*s[2]/2;x=sv(x);y=sv(y)}
    const q={k:this.kind,x,y,z,sx:s[0],sy:s[1],sz:s[2],c:K.c};
    if(this.kind==='mover'){q.ax='x';q.amp=10;q.sp=1}
    this.g.parts.push(q);this.rebuildAll();this.select(this.g.parts.length-1);this.dirty();Sfx.play('click');
  },
  setTool(v){this.tool=v;this.syncPal()},
  setKind(v){this.kind=v;this.tool='place';this.syncPal()},
  syncPal(){
    $$('.st-pal .seg button').forEach(b=>b.classList.toggle('on',b.dataset.v===this.tool));
    $$('.st-pal .pk').forEach(b=>b.classList.toggle('on',this.tool==='place'&&b.dataset.v===this.kind));
    const t=$('#st-tip');if(!t)return;const tap=IS_TOUCH?'Tap':'Click';t.textContent=this.tool==='place'?tap+' the scene to place: '+KINDS[this.kind].n+'. Drag to look around.':tap+' a part to select it. Drag to look around'+(IS_TOUCH?'.':', use W A S D to move.');
  },
  fillProps(){
    const el=$('#st-props');if(!el)return;const q=this.g.parts[this.sel];
    if(!q){
      el.innerHTML=`<h4>Game settings</h4><label class="muted" for="st-desc">Description</label><textarea id="st-desc" maxlength="240" style="width:100%;height:84px;margin:4px 0 10px;background:var(--panel2);border:1px solid var(--line);border-radius:8px;padding:8px;font-size:13.5px">${esc(this.g.desc||'')}</textarea>
        <label class="muted" for="st-sky">Sky</label><select id="st-sky" style="margin:4px 0 12px">${[['day','Day'],['sunset','Sunset'],['night','Night'],['space','Space']].map(o=>`<option value="${o[0]}"${this.g.sky===o[0]?' selected':''}>${o[1]}</option>`).join('')}</select>
        <p class="muted">${this.g.parts.length} parts. Players win by touching a Finish part, or by collecting every coin when there is no Finish. Move a Spawn part to choose where players start.</p>`;
      return;
    }
    const nf=(k,l)=>`<label>${l}<input type="number" step="any" data-f="${k}" value="${+(+q[k]).toFixed(2)}"></label>`;
    const nudge=[['x',-1,'X-'],['x',1,'X+'],['y',1,'Up'],['y',-1,'Down'],['z',-1,'Z-'],['z',1,'Z+']].map(n=>`<button data-act="st-nudge" data-a="${n[0]}" data-d="${n[1]}">${n[2]}</button>`).join('');
    el.innerHTML=`<h4>${KINDS[q.k].n}</h4><div class="pg">${nf('x','X')}${nf('y','Y')}${nf('z','Z')}</div>
      ${q.k==='coin'?'':`<div class="pg">${nf('sx','Width')}${nf('sy','Height')}${nf('sz','Depth')}</div><div class="row2" style="margin:0 0 10px;align-items:center"><span class="muted">Color</span><input type="color" id="st-col" value="${q.c}" aria-label="Part color"></div>`}
      ${q.k==='mover'?`<div class="pg"><label>Direction<select data-f="ax"><option value="x"${q.ax!=='z'?' selected':''}>Side</option><option value="z"${q.ax==='z'?' selected':''}>Depth</option></select></label>${nf('amp','Range')}${nf('sp','Speed')}</div>`:''}
      <div class="muted">Move by ${this.snap} studs</div><div class="nudge">${nudge}</div>
      <div class="row2"><button class="btn sm" data-act="st-dup">${ico('copy',15)} Duplicate</button><button class="btn sm danger" data-act="st-del">${ico('trash',15)} Delete</button></div>
      <p class="muted" style="margin-top:12px">Arrow keys move the part. R and F raise and lower it.</p>`;
  },
  propInput(t){
    if(t.id==='st-desc'){this.g.desc=t.value;this.dirty();return}
    if(t.id==='st-sky'){this.g.sky=t.value;this.applySky();this.dirty();return}
    const q=this.g.parts[this.sel];if(!q)return;
    let size=false;
    if(t.id==='st-col'){q.c=t.value;size=true}
    else if(t.dataset.f==='ax'){q.ax=t.value}
    else if(t.dataset.f){
      const v=parseFloat(t.value);if(isNaN(v))return;const f=t.dataset.f;
      if(f==='sx'||f==='sy'||f==='sz'){q[f]=clamp(v,.2,400);size=true}else if(f==='sp')q[f]=clamp(v,.1,5);else if(f==='amp')q[f]=clamp(v,0,100);else q[f]=clamp(v,-2000,2000);
    }else return;
    this.partChanged(this.sel,size);
  },
  partChanged(i,rebuild){
    const q=this.g.parts[i];
    if(rebuild)this.rebuildMesh(i);else this.meshes[i].position.set(q.x,q.y,q.z);
    this.updateOutline();this.dirty();
  },
  nudge(a,d){
    const q=this.g.parts[this.sel];if(!q)return;
    q[a]=+(q[a]+d*this.snap).toFixed(3);this.partChanged(this.sel,false);
    const inp=$(`[data-f="${a}"]`);if(inp)inp.value=+q[a].toFixed(2);
  },
  dup(){
    const q=this.g.parts[this.sel];if(!q||this.g.parts.length>=600)return;
    if(q.k==='spawn'){toastUI('Only one Spawn part is allowed');return}
    const c=Object.assign({},q);c.x+=this.snap;c.z-=this.snap;this.g.parts.push(c);this.rebuildAll();this.select(this.g.parts.length-1);this.dirty();
  },
  del(){
    if(this.sel<0)return;this.g.parts.splice(this.sel,1);this.rebuildAll();this.select(-1);this.dirty();
  },
  dirty(){
    const s=$('#st-saved');if(s)s.textContent='Saving';clearTimeout(this.saveT);
    this.saveT=setTimeout(()=>{save();const e=$('#st-saved');if(e)e.textContent='Saved'},350);
  },
  test(){
    save();
    if(!this.g.parts.length){toastUI('Add at least one part first');return}
    Play.start(Object.assign(defOf(gameFromCustom(this.g)),{test:true}));
  },
  publish(){
    setPublished(this.g,!this.g.pub);
    const b=$('#st-pubbtn');if(b){b.textContent=this.g.pub?'Published':'Publish';b.classList.toggle('on',this.g.pub)}
  },
  share(){
    const o={title:this.g.title,desc:this.g.desc,sky:this.g.sky,parts:this.g.parts};
    const code=btoa(unescape(encodeURIComponent(JSON.stringify(o))));
    modal(`<h2>Share code</h2><p>Send this code to a friend. They can import it from the Create page.</p><textarea class="code" id="sharecode" readonly>${code}</textarea><div class="acts" style="margin-top:12px"><button class="btn" data-act="modal-close">Close</button><button class="btn brand" data-act="st-copy">Copy code</button></div>`);
  }
};

/* ============ boot ============ */
(async function boot(){
  applyTheme();
  $('#side').innerHTML=sideHTML();
  $('#btn-menu').innerHTML=ico('menu',22);
  $('#btn-build').innerHTML=ico('create',22);
  $('#set-btn').innerHTML=ico('sliders',18);
  Settings.applyAll();
  $('#btn-menu').addEventListener('click',()=>Play.toggleMenu());
  bindGameInput();
  requestAnimationFrame(Loop.run);
  S.games=Array.isArray(S.games)?S.games:[];
  const norm=()=>{
    const u=S.user;if(!u)return;
    u.owned=u.owned||[];u.played=u.played||[];u.votes=u.votes||{};u.favs=u.favs||[];u.best=u.best||{};
    u.avatar=Object.assign({},AV_DEFAULT,u.avatar||{});u.coins=+u.coins||0;
  };
  norm();
  Account.load();
  const jm=location.hash.match(/^#\/join\/(.+)$/);
  if(jm&&!Account.token)Account.pendingJoin=decodeURIComponent(jm[1]);
  await Account.init();norm();
  if(S.user&&R.init())S.head=headshot(S.user.avatar);
  refreshTop();
  $('#me').addEventListener('click',()=>{if(S.user)showProfile()});
  $('#coins').addEventListener('click',()=>{location.hash='#/avatar'});
  $('#searchf').addEventListener('submit',e=>{e.preventDefault();const v=$('#q').value.trim();location.hash='#/games'+(v?'?q='+encodeURIComponent(v):'')});
  window.addEventListener('hashchange',()=>{if(Play.active){Play.stop();return}route()});
  route();
  if(!S.user){
    if(Net.base()&&await Account.ping()){refreshTop();if(Net.guests)showWelcome();else showAuth(Account.pendingJoin?'Log in to join your friend.':'')}
    else showWelcome();
  }else if(Account.token)Friends.start();
})();
