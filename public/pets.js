import {PET_ITEMS,OUTFIT_SLOTS,COTTAGE_THEMES,normalizeEquipped,activePetSets,petItemLock,petEffectLabel} from './pet-catalog.js';
import {stagesFor,eggPortrait} from './pet-growth.js';
import {artwork,ornament,silhouette} from './illustrations.js';
import {foodShelf,petMoment,careOutcome} from './pet-care.js';
import {keepsakeIcon} from './travel-art.js';
import {KEEPSAKES} from './travel-notes.js';
export {petEffectLabel};

export function petPurchaseHint(state,prize){
 const item=PET_ITEMS[prize.effect];if(!item)return '';
 const lock=petItemLock(state.pet,prize.effect);if(lock)return lock;
 if(item.kind==='outfit'&&(state.pet.outfits.includes(prize.effect)||state.cards.some(c=>c.status==='ready'&&c.effect===prize.effect)))return '已拥有';
 return '';
}

// Pixel-measured & per-archetype calibrated anchors for all 6 species × 4 stages (512×512 canvas).
export const FIT={
 'nuonuo-seal':{
  young:{prop:false,top:[328,136],head:[324,148,134,8],ears:[324,140,156,6],face:[331,249,178,-1],neck:[324,298,195,2],bow:[274,172,82,-12],pin:[264,304,58,-6],chest:[252,330,78,-4],satchel:[216,334,96,4],ground:[94,358,102,0],float:[92,196,100,0],cape:[254,276,395,0]},
  winged:{prop:true,top:[257,89],head:[257,104,146,-3],ears:[257,96,164,-2],face:[257,214,158,-2],neck:[257,268,240,0],bow:[322,142,80,14],pin:[188,296,56,-8],chest:[174,338,74,-8],satchel:[332,340,96,4],ground:[88,384,102,0],float:[88,192,98,0],cape:[256,286,390,0]},
  moon:{prop:false,top:[328,147],head:[324,158,128,8],ears:[324,150,150,6],face:[330,247,160,-1],neck:[324,294,185,2],bow:[278,180,78,-12],pin:[266,300,56,-6],chest:[254,322,74,-4],satchel:[222,328,92,4],ground:[94,344,100,0],float:[92,196,98,0],cape:[260,272,380,0]},
  star:{prop:true,top:[257,102],head:[257,116,140,-3],ears:[257,108,158,-2],face:[257,216,152,-1],neck:[257,268,228,0],bow:[318,148,78,14],pin:[192,296,56,-8],chest:[180,334,72,-8],satchel:[326,336,94,4],ground:[90,376,100,0],float:[90,194,98,0],cape:[257,286,380,0]}
 },
 'cloud-fox':{
  young:{prop:false,top:[213,133],head:[213,138,126,-3],ears:[213,128,132,-2],face:[213,229,152,1],neck:[213,280,196,0],bow:[268,158,78,14],pin:[174,308,56,-8],chest:[206,338,76,-4],satchel:[268,350,94,4],ground:[84,384,102,0],float:[84,194,98,0],cape:[224,294,390,0]},
  winged:{prop:true,top:[208,134],head:[208,138,126,-3],ears:[208,128,132,-2],face:[208,230,154,0],neck:[208,280,202,0],bow:[266,158,78,14],pin:[158,304,54,-8],chest:[148,340,72,-8],satchel:[268,350,94,4],ground:[84,384,102,0],float:[84,194,98,0],cape:[220,294,390,0]},
  moon:{prop:false,top:[212,133],head:[212,138,126,-3],ears:[212,128,132,-2],face:[212,229,152,1],neck:[212,280,196,0],bow:[268,158,78,14],pin:[174,308,56,-8],chest:[206,338,76,-4],satchel:[268,350,94,4],ground:[84,384,102,0],float:[84,194,98,0],cape:[224,294,390,0]},
  star:{prop:true,top:[248,131],head:[246,136,130,3],ears:[246,126,136,3],face:[248,227,178,5],neck:[246,280,208,0],bow:[302,156,80,16],pin:[190,306,56,-6],chest:[180,342,72,-8],satchel:[304,350,94,4],ground:[82,384,100,0],float:[82,190,98,0],cape:[250,294,410,0]}
 },
 'pocket-glider':{
  young:{prop:true,top:[232,106],head:[230,118,148,-4],ears:[232,110,168,2],face:[232,218,188,5],neck:[232,274,236,0],bow:[302,142,82,14],pin:[166,298,56,-8],chest:[154,334,74,-8],satchel:[304,344,96,4],ground:[84,384,102,0],float:[84,192,98,0],cape:[236,290,405,0]},
  winged:{prop:true,top:[219,97],head:[219,110,146,-4],ears:[219,102,164,-2],face:[220,214,182,-2],neck:[219,272,234,0],bow:[288,134,82,14],pin:[154,296,56,-8],chest:[144,332,74,-8],satchel:[292,344,96,4],ground:[84,384,102,0],float:[84,192,98,0],cape:[222,290,405,0]},
  moon:{prop:true,top:[215,96],head:[215,109,146,-4],ears:[215,101,164,0],face:[215,213,182,1],neck:[215,270,234,0],bow:[286,134,82,14],pin:[150,296,56,-8],chest:[140,330,74,-8],satchel:[292,344,96,4],ground:[84,384,102,0],float:[84,192,98,0],cape:[222,290,405,0]},
  star:{prop:true,top:[214,97],head:[215,110,148,-4],ears:[214,102,166,-2],face:[214,217,198,-2],neck:[215,272,238,0],bow:[288,134,82,14],pin:[148,298,56,-8],chest:[138,332,74,-8],satchel:[292,344,96,4],ground:[84,384,102,0],float:[84,192,98,0],cape:[222,290,410,0]}
 },
 'moon-bunny':{
  young:{prop:false,top:[241,89],head:[242,104,154,-4],ears:[242,98,176,2],face:[241,208,244,4],neck:[244,270,214,0],bow:[308,134,84,14],pin:[196,304,58,-8],chest:[238,332,78,-4],satchel:[306,346,96,4],ground:[84,384,102,0],float:[84,190,98,0],cape:[248,290,405,0]},
  winged:{prop:true,top:[254,89],head:[254,104,148,-3],ears:[254,98,168,0],face:[254,197,212,0],neck:[254,264,214,0],bow:[314,134,82,14],pin:[200,298,56,-8],chest:[184,334,74,-8],satchel:[312,346,96,4],ground:[86,384,102,0],float:[86,190,98,0],cape:[254,290,395,0]},
  moon:{prop:false,top:[240,89],head:[241,104,154,-4],ears:[241,98,176,2],face:[240,206,242,4],neck:[243,268,214,0],bow:[308,134,84,14],pin:[196,304,58,-8],chest:[237,332,78,-4],satchel:[306,346,96,4],ground:[84,384,102,0],float:[84,190,98,0],cape:[248,290,405,0]},
  star:{prop:true,top:[254,89],head:[254,104,150,-3],ears:[254,98,170,0],face:[254,192,220,0],neck:[254,262,216,0],bow:[316,134,82,14],pin:[198,298,56,-8],chest:[184,334,74,-8],satchel:[312,346,96,4],ground:[86,384,102,0],float:[86,190,98,0],cape:[254,290,400,0]}
 },
 'cottonpod-hermit':{
  young:{prop:true,top:[272,108],head:[262,112,154,-6],ears:[262,110,180,-4],face:[293,301,244,-1],neck:[288,336,274,0],bow:[358,226,88,14],pin:[186,256,60,-8],chest:[142,344,72,-8],satchel:[370,350,92,4],ground:[82,386,100,0],float:[82,188,98,0],cape:[256,278,455,0]},
  winged:{prop:true,top:[256,92],head:[255,104,150,-5],ears:[255,102,174,-3],face:[256,321,224,-1],neck:[256,346,260,0],bow:[346,238,86,14],pin:[184,262,58,-8],chest:[144,352,72,-8],satchel:[354,354,92,4],ground:[82,386,100,0],float:[82,188,98,0],cape:[256,282,445,0]},
  moon:{prop:true,top:[262,122],head:[256,130,152,-6],ears:[256,124,178,-4],face:[285,315,242,-1],neck:[280,342,272,0],bow:[356,244,86,14],pin:[184,266,58,-8],chest:[144,352,72,-8],satchel:[364,354,92,4],ground:[82,386,100,0],float:[82,188,98,0],cape:[256,286,455,0]},
  star:{prop:true,top:[258,106],head:[258,116,152,-5],ears:[258,110,176,-3],face:[271,318,236,-1],neck:[268,344,266,0],bow:[352,242,86,14],pin:[184,266,58,-8],chest:[144,354,72,-8],satchel:[358,356,92,4],ground:[82,386,100,0],float:[82,188,98,0],cape:[256,284,455,0]}
 },
 'moss-dragon':{
  young:{prop:false,top:[233,98],head:[233,110,134,0],ears:[233,100,140,0],face:[233,206,188,-1],neck:[233,266,186,0],bow:[292,134,80,14],pin:[184,300,56,-8],chest:[228,330,76,-4],satchel:[296,344,94,4],ground:[84,384,102,0],float:[84,190,98,0],cape:[238,288,395,0]},
  winged:{prop:true,top:[253,98],head:[254,110,136,0],ears:[254,100,142,0],face:[253,216,192,3],neck:[254,268,172,0],bow:[310,134,80,14],pin:[202,298,54,-8],chest:[184,338,72,-8],satchel:[316,346,94,4],ground:[84,384,102,0],float:[84,190,98,0],cape:[255,290,405,0]},
  moon:{prop:false,top:[247,98],head:[247,110,136,0],ears:[247,100,142,0],face:[247,211,214,0],neck:[247,268,186,0],bow:[306,134,80,14],pin:[196,302,56,-8],chest:[242,332,76,-4],satchel:[310,346,94,4],ground:[84,384,102,0],float:[84,190,98,0],cape:[250,290,405,0]},
  star:{prop:true,top:[255,98],head:[255,110,136,0],ears:[255,100,142,0],face:[255,214,212,-1],neck:[255,268,172,0],bow:[312,134,80,14],pin:[204,298,54,-8],chest:[186,338,72,-8],satchel:[316,346,94,4],ground:[84,384,102,0],float:[84,190,98,0],cape:[255,290,405,0]}
 }
};

function growthControls(p,canAct){
 if(!p.owned||!p.growth)return '';
 const g=p.growth;
 return `<div class="pet-growth-status"><span>${g.name}${p.trait?' · '+p.trait:''}</span><button class="text-btn" data-action="pet-growth">成长足迹 →</button></div>${g.next?`<div class="pet-next-growth"><span>${g.next.eligible?'新的成长，准备好啦':'再积攒 '+g.next.remaining+' 经验，迎接下一阶段'}</span><button class="btn secondary sm" data-action="pet-evolve" ${canAct&&g.next.eligible?'':'disabled'}>${g.next.action}</button></div>`:''}`;
}

function resolveAnchor(form,fit,item){
 const a=item.art;
 // 1. Symmetrical back underlays (wings, celestial ribbon, starry cape)
 if(item.layer==='under'){
  const base=fit.cape||[256,288,400,0];
  if(a==='wings')return {anchor:[base[0],base[1]-18,Math.round(base[2]*1.06),0],artKey:'wings'};
  if(a==='ribbon')return {anchor:[base[0],base[1]-10,Math.round(base[2]*1.02),0],artKey:'ribbon'};
  return {anchor:[base[0],base[1]+6,base[2],0],artKey:a};
 }
 // 2. Dedicated per-item headwear adaptation
 if(a==='sprout'){
  const top=fit.top||[fit.head[0],fit.head[1]-12];
  const sc=Math.round(fit.head[2]*0.68);
  return {anchor:[top[0],Math.round(top[1]-sc*0.24),sc,fit.head[3]||0],artKey:'sprout'};
 }
 if(a==='ears')return {anchor:fit.ears||[fit.head[0],fit.head[1]+8,Math.round(fit.head[2]*1.25),fit.head[3]||0],artKey:'ears'};
 if(a==='flower')return {anchor:[Math.round(fit.head[0]-fit.head[2]*0.34),fit.head[1]+16,Math.round(fit.head[2]*0.66),-14],artKey:'flower'};
 if(a==='straw')return {anchor:[fit.head[0],fit.head[1]+2,Math.round(fit.head[2]*1.16),fit.head[3]||0],artKey:'straw'};
 if(a==='witch')return {anchor:[fit.head[0],fit.head[1]-6,Math.round(fit.head[2]*1.14),fit.head[3]||0],artKey:'witch'};
 if(a==='crown')return {anchor:[fit.head[0],fit.head[1]-2,Math.round(fit.head[2]*0.90),fit.head[3]||0],artKey:'crown'};
 if(a==='helmet'){
  if(form==='cottonpod-hermit')return {anchor:[256,236,390,0],artKey:'helmet'};
  const topY=fit.top?fit.top[1]:fit.head[1]-12;
  return {anchor:[fit.face[0],Math.round((topY+fit.face[1])*0.5+2),Math.round(Math.max(fit.head[2]*1.90,fit.face[2]*1.26)),0],artKey:'helmet'};
 }
 // 3. Dedicated per-item neckwear adaptation (automatic split-shoulder wrap when holding chest props!)
 if(a==='bow')return {anchor:fit.prop?fit.bow:[fit.neck[0],fit.neck[1]-4,82,0],artKey:'bow'};
 if(a==='scarf')return {anchor:fit.neck,artKey:fit.prop?'scarf_wrap':'scarf'};
 if(a==='raincoat')return {anchor:[fit.neck[0],fit.neck[1]+8,Math.round(fit.neck[2]*1.05),fit.neck[3]||0],artKey:fit.prop?'raincoat_wrap':'raincoat'};
 if(a==='shell_lei')return {anchor:[fit.neck[0],fit.neck[1]+(fit.prop?-2:2),Math.round(fit.neck[2]*0.96),fit.neck[3]||0],artKey:fit.prop?'shell_lei_wrap':'shell_lei'};
 if(a==='collar')return {anchor:[fit.neck[0],fit.neck[1]-2,Math.round(fit.neck[2]*0.95),fit.neck[3]||0],artKey:fit.prop?'collar_wrap':'collar'};
 if(a==='sailor')return {anchor:[fit.neck[0],fit.neck[1]+4,Math.round(fit.neck[2]*1.02),fit.neck[3]||0],artKey:fit.prop?'sailor_wrap':'sailor'};
 if(a==='pearls')return {anchor:[fit.neck[0],fit.neck[1]-1,Math.round(fit.neck[2]*0.95),fit.neck[3]||0],artKey:fit.prop?'pearls_wrap':'pearls'};
 // 4. Dedicated per-item body & companion adaptation
 if(a==='guitar')return {anchor:[fit.chest[0]+(fit.prop?-4:6),fit.chest[1]+4,Math.round(fit.chest[2]*1.22),fit.prop?-6:0],artKey:'guitar'};
 const key=item.anchor||item.art||item.slot;
 return {anchor:fit[key]||fit[item.slot]||fit.chest,artKey:a};
}

function renderAccessory(form,stage,fit,effect,userT){
 const item=PET_ITEMS[effect];
 if(!item||item.kind!=='outfit'||item.ready===false)return null;
 const {anchor:a,artKey}=resolveAnchor(form,fit,item);
 if(!a)return null;
 const dx=Number(userT?.dx||0),dy=Number(userT?.dy||0);
 const mult=Number.isFinite(Number(userT?.scale))&&Number(userT?.scale)>0?Number(userT.scale):1;
 const drot=Number(userT?.rot||0);
 const cx=Math.round((a[0]+dx)*10)/10;
 const cy=Math.round((a[1]+dy)*10)/10;
 const scale=Math.round((a[2]/100)*mult*1000)/1000;
 const rot=Math.round(((a[3]||0)+drot)*10)/10;
 const rotPart=rot?` rotate(${rot})`:'';
 return {
  slot:item.slot||'neck',
  layer:item.layer==='under'?'under':'over',
  svg:`<g data-outfit-slot="${item.slot||'neck'}" transform="translate(${cx} ${cy})${rotPart} scale(${scale}) translate(-50 -50)">${ornament(artKey)}</g>`
 };
}

export function petPortrait(p,{form=p.form,small=false,locked=false,staticPose=false}={}){
 if(locked||!p?.owned)return '<div class="pet-portrait pet-hidden '+(small?'pet-small':'')+'">'+silhouette('pet')+'</div>';
 const safe=Object.hasOwn(FIT,form)?form:'nuonuo-seal';
 if(p.growth?.isEgg)return '<div class="pet-portrait '+(small?'pet-small':'')+'">'+eggPortrait(p.growth.stage===3,safe)+'</div>';
 const rawStage=p.growth&&form===p.form?p.growth.visual:(p.stage||'young');
 const stage=['young','winged','moon','star'].includes(rawStage)?rawStage:'young';
 const fit=FIT[safe][stage]||FIT['nuonuo-seal'].young;
 const eq=normalizeEquipped({...p,level:p.level??10});
 const transforms=p.transforms&&typeof p.transforms==='object'?p.transforms:{};
 const parts=OUTFIT_SLOTS.map(([slot])=>eq[slot]?renderAccessory(safe,stage,fit,eq[slot],transforms[slot]):null).filter(Boolean);
 const under=parts.filter(x=>x.layer==='under').map(x=>x.svg).join('');
 const over=parts.filter(x=>x.layer==='over').map(x=>x.svg).join('');
 const underSvg=under?`<svg class="fitted-outfit fitted-underlay" viewBox="0 0 512 512" aria-hidden="true">${under}</svg>`:'';
 const overSvg=over?`<svg class="fitted-outfit" viewBox="0 0 512 512" aria-hidden="true">${over}</svg>`:'';
 return `<div class="pet-portrait ${small?'pet-small':''}"><div class="pet-assembly ${!small&&!staticPose?'pet-breathe':''}">${underSvg}<img src="pets/${safe}/${stage}.png" alt="成长小伙伴${parts.length?'，已穿戴配饰':''}" width="512" height="512" loading="lazy">${overSvg}</div></div>`;
}

export function wardrobePreview(p,form=p.form,outfitOrEquipped=p.equipped||p.outfit,transforms=p.transforms||{}){
 const validForm=(p.forms||[]).some(f=>f.id===form&&f.level<=p.level)?form:p.form;
 let equipped={head:'',neck:'',body:'',companion:''};
 if(typeof outfitOrEquipped==='string'){
  if(outfitOrEquipped&&p.outfits?.includes(outfitOrEquipped)&&!petItemLock(p,outfitOrEquipped)){
   const s=PET_ITEMS[outfitOrEquipped]?.slot||'neck';
   equipped[s]=outfitOrEquipped;
  }
 }else if(outfitOrEquipped&&typeof outfitOrEquipped==='object'){
  for(const [slot] of OUTFIT_SLOTS){
   const eff=outfitOrEquipped[slot]||'';
   if(eff&&p.outfits?.includes(eff)&&!petItemLock(p,eff))equipped[slot]=eff;
  }
 }
 const names=Object.values(equipped).filter(Boolean).map(e=>PET_ITEMS[e]?.name).filter(Boolean);
 const sets=activePetSets(equipped);
 const setHtml=sets.length?`<div class="wardrobe-sets">${sets.map(s=>`<span class="set-pill">${s.badge} · ${s.bonus}</span>`).join('')}</div>`:'';
 return petPortrait({...p,form:validForm,equipped,transforms,outfit:Object.values(equipped).find(Boolean)||''},{staticPose:true})+`<div><span class="pet-eyebrow">多部位试衣镜（支持直接在宠物身上拖动微调）</span><strong>${names.length?names.join(' ＋ '):'原来的可爱'}</strong><small>${names.length?'默认已按体型自动贴合；想歪戴帽子或调围巾大小，可在下方自由微调。':'头饰、颈饰、随身与小伴可自由叠穿。'}</small>${setHtml}</div>`;
}

function cottageAtmosphere(theme='sunny'){
 if(theme==='blossom')return '<div class="cottage-fx cottage-fx-blossom" aria-hidden="true"><span></span><span></span><span></span></div>';
 if(theme==='rain')return '<div class="cottage-fx cottage-fx-rain" aria-hidden="true"></div>';
 if(theme==='starlight')return '<div class="cottage-fx cottage-fx-starlight" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span></div>';
 return '';
}

function shelfDisplay(shelf=[],esc){
 if(!shelf?.length)return '';
 return `<div class="cottage-shelf-items">${shelf.slice(0,3).map((place,i)=>{
  const name=KEEPSAKES[place]?.items[KEEPSAKES[place].answer]||'旅行纪念物';
  return `<span class="cottage-souvenir pos-${i}" title="${esc(name)}">${keepsakeIcon(place,{bare:true})}</span>`;
 }).join('')}</div>`;
}

export function petUI({getState,esc,canAct,openDialog,actions,mutation}){
 let draftTransforms={},activeTuneSlot='head',dragState=null;

 function cloneTransforms(raw){
  const out={};
  for(const [slot] of OUTFIT_SLOTS){
   const t=raw?.[slot];
   out[slot]={dx:Number(t?.dx||0),dy:Number(t?.dy||0),scale:Number(t?.scale||1),rot:Number(t?.rot||0)};
  }
  return out;
 }

 function panel(){
  const s=getState(),p=s.pet,form=p.forms.find(f=>f.id===p.form)||p.forms[0],away=s.travel.away,supplies=s.cards.filter(c=>c.status==='ready'&&c.effect.startsWith('pet_'));
  const act=canAct(),egg=p.growth?.isEgg,adoption=supplies.find(c=>c.effect==='pet_companion'&&Date.parse(c.available)<=Date.now());
  const mail=s.travel.pendingGifts?.[0]?.tripId||s.travel.history?.[0]?.id;
  const greeting=egg?'轻轻敲一敲蛋壳':'摸摸小伙伴';
  const scene=p.owned&&!away?(act?`<button class="cottage-pet" data-action="pet-greet" aria-label="${greeting}">${petPortrait(p)}</button>`:'<div class="cottage-pet">'+petPortrait(p)+'</div>'):'';
  const caption=away?'正在 '+esc(s.travel.trip.destination)+' 旅行':p.owned?(act?greeting:esc(form.name)+' 在家'):'小伙伴还没入住';
  const sets=p.activeSets||[];
  const foundCount=(s.travel.album||[]).filter(a=>a.keepsakeFound).length;
  const shortcuts=p.owned?`<button class="btn sm" data-action="pet-feed" ${act&&!away&&s.balance>=0?'':'disabled'}>${egg?'给蛋添暖':'喂一口'}</button>
  <button class="btn secondary sm" data-action="pet-dress" ${act&&!away&&!egg?'':'disabled'}>混搭衣橱</button>
  ${!away&&!egg&&act?'<button class="btn secondary sm" data-action="travel-pack">准备行囊</button>':'<button class="btn secondary sm" data-action="pet-section" data-section="travel">查看旅程</button>'}
  ${act?`<button class="btn secondary sm" data-action="cottage-shelf">窗台陈列${p.shelf?.length?' · '+p.shelf.length:''}</button>`:'<button class="text-btn" data-action="pet-shop">宠物小铺 ↗</button>'}`:
  (adoption&&act?`<button class="btn" data-action="pet-use" data-id="${esc(adoption.id)}">迎接云朵蛋</button>`:'<button class="btn" data-page="lucky">去奖池遇见它</button>');
  return `<section class="panel pet-home cottage-home"><header class="pet-heading"><div><h2>${p.owned?(egg?esc(p.growth.name):esc(form.name)):'窗边的小屋'}</h2>${p.owned&&sets.length?`<div class="active-set-strip">${sets.map(st=>`<span class="set-pill">${esc(st.badge)}</span>`).join('')}</div>`:''}</div><span class="pet-level">${p.owned?'Lv.'+p.level:'等待入住'}</span></header>
  <div class="pet-main"><div class="cottage-scene theme-${esc(p.cottageTheme||'sunny')}">${cottageAtmosphere(p.cottageTheme)}${shelfDisplay(p.shelf,esc)}${scene}<span class="cottage-caption" role="status" aria-live="polite">${caption}</span></div>
  <div class="pet-progress"><div class="pet-buttons">${shortcuts}</div>
  ${p.owned&&act?'<div class="pet-sub-links"><button class="text-btn" data-action="pet-shop">去宠物小铺 ↗</button>'+(foundCount?`<small>已收集 ${foundCount} 件旅行纪念物，可摆上书桌窗台</small>`:'')+'</div>':''}
  ${p.owned?'':'<p>'+(adoption?'小伙伴的入住卡已在储物篮里。':'抽到「小伙伴敲敲门」，就能带一颗云朵蛋回家。')+'</p>'}
  ${away?'<p class="cottage-letter">预计 '+new Date(s.travel.trip.returnAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false})+' 回家</p>':''}
  ${mail?`<button class="cottage-letter" data-action="trip-letter" data-id="${esc(mail)}">${s.travel.pendingGifts?.length?'拆一封有礼物的信':'看看旅行来信'} ↗</button>`:''}
  <strong>${p.xp.toLocaleString()} <small>累计经验</small></strong><progress class="progress" max="${p.nextXp?p.nextXp-p.levelStart:1}" value="${p.nextXp?p.xp-p.levelStart:1}" aria-label="宠物等级进度"></progress><small>${p.nextXp?'还差 '+(p.nextXp-p.xp)+' 经验升到 Lv.'+(p.level+1):'经验持续积攒中'}</small>${growthControls(p,act&&!away)}</div></div>${supplies.length?`<details class="pet-supplies"><summary>小伙伴的储物篮 · ${supplies.length} 件</summary>${supplies.slice(0,6).map(c=>{const item=PET_ITEMS[c.effect],locked=petItemLock(p,c.effect);return `<div class="record-row"><span class="supply-thumb">${locked?silhouette(item?.kind):artwork(item?.art||'pet_companion')}</span><div class="record-main"><strong>${locked?'神秘小礼物':esc(c.title)}</strong><small>${locked||petEffectLabel(c.effect)}</small></div><button class="btn secondary sm" data-action="pet-use" data-id="${c.id}" ${!canAct()||away||locked||Date.parse(c.available)>Date.now()||s.balance<0?'disabled':''}>${item?.kind==='gear'?'装进背包':'使用'}</button></div>`;}).join('')}${supplies.length>6?'<button class="text-btn" data-page="cards">查看全部 →</button>':''}</details>`:''}<details class="pet-rules"><summary>经验、多部位装扮与全物种成长规则</summary><p>本屋任务实际赚到 1 币记 1 经验，阅读与旅行归来也计入。6 位绘本风伙伴各有专属彩蛋与 6 段成长旅程，达标后主动进阶，不扣币、不清空经验。</p><p>衣橱已为每位伙伴量身校准默认穿戴位置，同时支持手动拖动、缩放大小与旋转角度；旅行收集的纪念物可以摆在小屋书桌与窗台上。</p></details></section>`;
 }

 function renderTunerControls(eq){
  const wornSlots=OUTFIT_SLOTS.filter(([slot])=>!!eq[slot]);
  if(!wornSlots.length)return '<div class="outfit-tuner empty-tuner"><small>💡 勾选任意一件装扮后，即可在这里自由微调它的大小、角度与位置。</small></div>';
  if(!eq[activeTuneSlot])activeTuneSlot=wornSlots[0][0];
  const cur=draftTransforms[activeTuneSlot]||{dx:0,dy:0,scale:1,rot:0};
  const itemName=PET_ITEMS[eq[activeTuneSlot]]?.name||'当前配饰';
  return `<div class="outfit-tuner">
   <div class="tuner-head">
    <strong>✨ 自由微调贴合度 · 正在调「${esc(itemName)}」</strong>
    <button type="button" class="text-btn" data-action="tune-reset" data-slot="${activeTuneSlot}">↺ 恢复默认位置</button>
   </div>
   <div class="tuner-slot-tabs">${wornSlots.map(([slot,label])=>`<button type="button" class="chip ${slot===activeTuneSlot?'active':''}" data-action="tune-slot" data-slot="${slot}">${label} · ${esc(PET_ITEMS[eq[slot]]?.name||'')}</button>`).join('')}</div>
   <div class="tuner-sliders">
    <label><span>大小 <b>${Math.round(cur.scale*100)}%</b></span><input type="range" data-tune="scale" min="55" max="175" step="1" value="${Math.round(cur.scale*100)}"></label>
    <label><span>角度 <b>${cur.rot>0?'+'+cur.rot:cur.rot}°</b></span><input type="range" data-tune="rot" min="-45" max="45" step="1" value="${Math.round(cur.rot)}"></label>
    <label><span>左右位置 <b>${cur.dx>0?'+'+Math.round(cur.dx):Math.round(cur.dx)}</b></span><input type="range" data-tune="dx" min="-120" max="120" step="1" value="${Math.round(cur.dx)}"></label>
    <label><span>上下位置 <b>${cur.dy>0?'+'+Math.round(cur.dy):Math.round(cur.dy)}</b></span><input type="range" data-tune="dy" min="-120" max="120" step="1" value="${Math.round(cur.dy)}"></label>
   </div>
   <small class="tuner-hint">小技巧：也可以直接在上方预览图的宠物身上按住拖动「${esc(itemName)}」哦！</small>
  </div>`;
 }

 function bindWardrobeInteractions(){
  if(typeof document==='undefined')return;
  const form=document.querySelector('#pet-dress-form');
  if(!form||form.dataset.bound==='1')return;
  form.dataset.bound='1';
  form.addEventListener('input',e=>{
   const tune=e.target.dataset?.tune;
   if(!tune)return;
   const cur=draftTransforms[activeTuneSlot]||(draftTransforms[activeTuneSlot]={dx:0,dy:0,scale:1,rot:0});
   const val=Number(e.target.value);
   if(tune==='scale')cur.scale=Math.round(val)/100;
   else cur[tune]=val;
   const b=e.target.closest('label')?.querySelector('b');
   if(b)b.textContent=tune==='scale'?val+'%':tune==='rot'?(val>0?'+'+val:val)+'°':(val>0?'+'+val:String(val));
   const p=getState().pet,payload=readDressForm(form);
   form.querySelector('#pet-wardrobe-preview').innerHTML=wardrobePreview(p,payload.form,payload.equipped,draftTransforms);
  });
  const preview=form.querySelector('#pet-wardrobe-preview');
  if(preview){
   preview.addEventListener('pointerdown',e=>{
    const portrait=e.target.closest('.pet-portrait');
    const payload=readDressForm(form);
    if(!portrait||!payload.equipped[activeTuneSlot])return;
    e.preventDefault();
    const rect=portrait.getBoundingClientRect();
    const cur=draftTransforms[activeTuneSlot]||(draftTransforms[activeTuneSlot]={dx:0,dy:0,scale:1,rot:0});
    dragState={startX:e.clientX,startY:e.clientY,origDx:cur.dx,origDy:cur.dy,ratio:512/Math.max(80,rect.width)};
    preview.setPointerCapture?.(e.pointerId);
   });
   preview.addEventListener('pointermove',e=>{
    if(!dragState)return;
    const cur=draftTransforms[activeTuneSlot];
    cur.dx=Math.max(-120,Math.min(120,Math.round(dragState.origDx+(e.clientX-dragState.startX)*dragState.ratio)));
    cur.dy=Math.max(-120,Math.min(120,Math.round(dragState.origDy+(e.clientY-dragState.startY)*dragState.ratio)));
    const p=getState().pet,payload=readDressForm(form);
    preview.innerHTML=wardrobePreview(p,payload.form,payload.equipped,draftTransforms);
    const tunerBox=form.querySelector('#pet-outfit-tuner');
    if(tunerBox)tunerBox.innerHTML=renderTunerControls(payload.equipped);
   });
   const endDrag=()=>{dragState=null;};
   preview.addEventListener('pointerup',endDrag);
   preview.addEventListener('pointercancel',endDrag);
  }
 }

 let lastGreeting=-1;
 function wardrobe(){
  const s=getState(),p=s.pet,eq=normalizeEquipped(p);
  draftTransforms=cloneTransforms(p.transforms);
  activeTuneSlot=OUTFIT_SLOTS.map(([k])=>k).find(k=>eq[k])||'head';
  openDialog('混搭小衣橱 · 绘本伙伴与自由贴合',`<form id="pet-dress-form"><div class="wardrobe-preview" id="pet-wardrobe-preview">${wardrobePreview(p,p.form,eq,draftTransforms)}</div>
  <div id="pet-outfit-tuner">${renderTunerControls(eq)}</div>
  <h3 class="wardrobe-title">选择绘本小伙伴（6 位伙伴均支持完整进化）</h3>
  <div class="pet-form-grid">${p.forms.map(f=>{const locked=p.level<f.level;return `<label class="pet-form-option ${locked?'locked':''}"><input type="radio" name="form" value="${f.id}" ${p.form===f.id?'checked':''} ${locked?'disabled':''}>${petPortrait({...p,outfit:'',equipped:{}},{form:f.id,small:true,locked})}<strong>${locked?'神秘小伙伴':esc(f.name)}</strong><small>${locked?'Lv.'+f.level+' 解锁':esc(f.trait||'已解锁')}</small></label>`;}).join('')}</div>
  ${OUTFIT_SLOTS.map(([slot,slotLabel])=>{
   const slotItems=Object.entries(PET_ITEMS).filter(([,i])=>i.kind==='outfit'&&i.slot===slot);
   return `<h3 class="wardrobe-title">${slotLabel}</h3><div class="outfit-grid"><label class="outfit-choice"><input type="radio" name="slot_${slot}" value="" ${!eq[slot]?'checked':''}>${artwork('pet_companion')}<strong>不佩戴</strong><small>留出清爽本色</small></label>${slotItems.map(([effect,i])=>{const locked=petItemLock(p,effect),owned=p.outfits.includes(effect);return `<label class="outfit-choice ${locked?'locked':''}"><input type="radio" name="slot_${slot}" value="${effect}" ${eq[slot]===effect?'checked':''} ${locked||!owned?'disabled':''}>${locked?silhouette('outfit'):artwork(i.art)}<strong>${locked?'神秘装扮':esc(i.name)}</strong><small>${locked||(owned?'已收进衣橱':'Lv.'+i.level+' 小铺可兑')}</small></label>`;}).join('')}</div>`;
  }).join('')}
  <h3 class="wardrobe-title">窗边小屋光影氛围</h3>
  <div class="cottage-theme-grid">${(p.cottageThemes||COTTAGE_THEMES).map(t=>{const locked=p.level<t.level;return `<label class="outfit-choice ${locked?'locked':''}"><input type="radio" name="cottage_theme" value="${t.id}" ${(p.cottageTheme||'sunny')===t.id?'checked':''} ${locked?'disabled':''}><strong>${esc(t.name)}</strong><small>${locked?'Lv.'+t.level+' 解锁':esc(t.desc)}</small></label>`;}).join('')}</div>
  <p class="field-help">已拥有的装扮随时自由叠穿与微调大小角度，不重复花币。凑齐同系列两件即可触发套装共鸣。</p>${actions('穿好啦')}</form>`);
  bindWardrobeInteractions();
 }
 function shelfDialog(){
  const s=getState(),p=s.pet,found=(s.travel.album||[]).filter(a=>a.keepsakeFound);
  openDialog('窗台与书桌 · 纪念物陈列',`<form id="pet-shelf-form"><p class="subtext">从旅行带回的纪念物中挑选最多 3 件，分别摆在左侧书桌、右侧阳光窗台与旅行皮箱旁。</p>${found.length?`<div class="outfit-grid">${found.map(a=>{const name=KEEPSAKES[a.id]?.items[KEEPSAKES[a.id].answer]||a.place;return `<label class="outfit-choice"><input type="checkbox" name="shelf_place" value="${esc(a.id)}" ${p.shelf?.includes(a.id)?'checked':''}>${keepsakeIcon(a.id)}<strong>${esc(name)}</strong><small>${esc(a.place||'')}</small></label>`;}).join('')}</div>`:'<p class="subtext">还没有找到旅行纪念物。等小伙伴旅行归来，拆开明信片翻翻它的口袋就能收集啦。</p>'}${actions('摆好纪念物')}</form>`);
 }
 async function click(action,el){const s=getState(),p=s.pet;
  if(action==='tune-slot'){
   activeTuneSlot=el.dataset.slot||'head';
   const form=typeof document!=='undefined'?document.querySelector('#pet-dress-form'):null;
   if(form){
    const payload=readDressForm(form);
    const tunerBox=form.querySelector('#pet-outfit-tuner');
    if(tunerBox)tunerBox.innerHTML=renderTunerControls(payload.equipped);
   }
   return true;
  }
  if(action==='tune-reset'){
   const slot=el.dataset.slot||activeTuneSlot;
   draftTransforms[slot]={dx:0,dy:0,scale:1,rot:0};
   const form=typeof document!=='undefined'?document.querySelector('#pet-dress-form'):null;
   if(form){
    const payload=readDressForm(form);
    form.querySelector('#pet-wardrobe-preview').innerHTML=wardrobePreview(p,payload.form,payload.equipped,draftTransforms);
    const tunerBox=form.querySelector('#pet-outfit-tuner');
    if(tunerBox)tunerBox.innerHTML=renderTunerControls(payload.equipped);
   }
   return true;
  }
  if(action==='pet-greet'){
   if(!canAct()||!p.owned||s.travel.away)return true;
   const traitLines={
    'nuonuo-seal':'它捧稳小海苔，满足地拍了拍肚皮。',
    'cloud-fox':'它蓬松的云朵尾巴轻轻扫过你的手背，暖融融的。',
    'pocket-glider':'它把最饱满的一颗橡果往你手边推了推。',
    'moon-bunny':'它晃了晃软软的长垂耳，空气里有一点桂花甜香。',
    'cottonpod-hermit':'它从软绵绵的棉桃壳里探出眼睛，举起小圆螯打招呼。',
    'moss-dragon':'它把小书卷抱在怀里，歪着嫩芽角认真听你说话。'
   };
   const lines=p.growth?.isEgg?['蛋壳轻轻摇了两下。','里面传来一声小小的叩叩。','掌心里暖起来了。']:['它眯起眼睛，往你掌心蹭了蹭。',traitLines[p.form]||'它打了个哈欠，又挪近了一点。','它朝旅行包看了一眼，又回头望望你。','它在地毯上转了半圈，坐好等你。'];
   lastGreeting=(lastGreeting+1+Math.floor(Math.random()*(lines.length-1)))%lines.length;
   el.closest('.cottage-scene').querySelector('[role="status"]').textContent=lines[lastGreeting];
   if(!matchMedia('(prefers-reduced-motion: reduce)').matches&&el.animate){el.getAnimations().forEach(a=>a.cancel());el.animate([{translate:'0 0'},{translate:'0 -6px'},{translate:'0 0'}],{duration:440});}
   return true;
  }
  if(action==='pet-growth'){const stages=stagesFor(p.form);openDialog('一起长大的足迹',`<ol class="pet-growth-list">${stages.map((x,i)=>`<li class="${i===p.growth.stage?'current':i<p.growth.stage?'done':'locked'}"><span>${i<p.growth.stage?'✓':i+1}</span><div><strong>${i<=p.growth.stage?x.name:'还未揭晓的成长'}</strong><small>${i===p.growth.stage?'我们在这里':i<p.growth.stage?'已经走过':x.xp+' 经验后，主动迎接'}</small></div></li>`).join('')}</ol><p class="field-help">每位绘本伙伴都有专属的 6 段成长线。达标后由你主动迎接，进阶不花币、不清空衣橱。</p>`);return true;}
  if(action==='pet-evolve'){const g=p.growth;if(!g?.next)return true;openDialog(g.next.action,`<form id="pet-evolve-form" data-from="${g.stage}"><div class="growth-confirm">${petPortrait(p)}</div><h3>${g.next.name}</h3><p>${g.stage===2?'会暂时化作一颗灵蛋，3400 经验时破壳蜕变为灵阶伙伴。期间口粮仍可使用，换装和旅行等孵化后继续。':'准备好和小伙伴迎接新模样了吗？'}</p><p class="field-help">不扣学习币或经验，已有装扮会替你留好。</p>${actions(g.next.action)}</form>`);return true;}
  if(action==='pet-feed'){openDialog(p.growth?.isEgg?'给小伙伴添一点暖':'今天吃点什么',foodShelf(s,esc));return true;}
  if(action==='pet-dress'){wardrobe();return true;}
  if(action==='cottage-shelf'){shelfDialog();return true;}
  if(action==='pet-stock'){openDialog('补齐宠物小铺',`<form id="pet-stock-form"><p>加入 ${Object.values(PET_ITEMS).filter(i=>i.ready!==false&&i.shop!==false).length} 款口粮、多部位配饰与旅行行囊。已上架的同款保留原价和库存；曾移除的模板会恢复，稍后可以逐项调整。</p><p class="field-help">等级不够时，领奖人只看到神秘轮廓；另有 4 款地域风物点心由宠物旅行专属带回。</p>${actions('补齐宠物用品')}</form>`);return true;}
  if(action==='pet-use'||action==='use-effect'&&s.cards.find(c=>c.id===el.dataset.id)?.effect.startsWith('pet_')){const card=s.cards.find(c=>c.id===el.dataset.id);if(!card)return false;const item=PET_ITEMS[card.effect],lock=petItemLock(p,card.effect),duplicate=item?.kind==='outfit'&&p.outfits.includes(card.effect);
   if(s.travel.away){openDialog('等小伙伴回家',`<p>小伙伴还在旅行。口粮和装扮已经替你收好，回来再一起挑。</p><button class="btn" data-page="growth">看看它走到哪了</button>`);return true;}
   if(lock){openDialog('一份还没揭晓的小礼物',`${silhouette(item?.kind)}<p>${esc(lock)}。这张卡会替你留好。</p>`);return true;}
   if(p.growth?.isEgg&&['outfit','gear'].includes(item?.kind)){openDialog('先和小伙伴见一面',`<p>小伙伴还在蛋里，孵化后就能换装和旅行啦。这张卡会替你留好。</p><button class="btn" data-page="growth">看看成长进度</button>`);return true;}
   if(item?.kind==='gear'){openDialog(esc(card.title),artwork(item.art)+'<p>出发时消耗这件行囊，回来获得 '+item.xp+' 经验。</p><button class="btn" data-action="travel-pack" data-card="'+esc(card.id)+'">准备旅行</button>');return true;}
   const previewEquipped=item?.kind==='outfit'?{...normalizeEquipped(p),[item.slot||'neck']:card.effect}:normalizeEquipped(p);
   const text=card.effect==='pet_companion'?(p.owned?'这次小伙伴会带回 60 经验。':'使用后会收到一颗云朵蛋，轻轻孵化就能迎接伙伴，已有经验保留。'):duplicate?'已拥有这件装扮，使用会消耗此卡并穿戴到对应部位，不重复增加经验。':item?.kind==='food'?`吃掉这份${item.specialty||'口粮'}，增加 ${item.xp} 经验；也可以先留着，下次旅行再带。`:`解锁并穿戴到「${OUTFIT_SLOTS.find(([k])=>k===item.slot)?.[1]||'装扮'}」槽位，增加 ${item.xp} 经验，以后免费混搭。`;
   openDialog(esc(card.title),`<form id="pet-use-form" data-id="${esc(card.id)}">${item?.kind==='outfit'?'<div class="wardrobe-preview">'+petPortrait({...p,equipped:previewEquipped,outfit:card.effect},{staticPose:true})+'<p>叠穿之后，是这个模样</p></div>':'<div class="pet-use-illustration">'+artwork(item?.art||'pet_companion')+'</div>'}<p>${text}</p><p class="field-help">只消耗这张卡，不再扣学习币。</p>${actions('确认使用')}</form>`);return true;
  }return false;
 }
 function readDressForm(form){
  const equipped={head:'',neck:'',body:'',companion:''};
  for(const [slot] of OUTFIT_SLOTS)equipped[slot]=form.elements['slot_'+slot]?.value||'';
  return {form:form.elements.form?.value,equipped,transforms:draftTransforms,cottage_theme:form.elements.cottage_theme?.value||'sunny'};
 }
 async function submit(form,data,key){
  if(form.id==='pet-evolve-form'){const before=getState().pet;const r=await mutation('pets/evolve',{from:Number(form.dataset.from)},'',key);openDialog(r.note,petMoment(before,r.pet,{kind:'evolve',portrait:petPortrait})+'<p class="pet-result">'+r.pet.growth.name+' · '+r.pet.xp+' 经验</p><p class="field-help">成长已经记好，关闭窗口也不会丢失。</p><button class="btn full-width" data-page="growth">回到小伙伴身边</button>');return true;}
  if(form.id==='pet-stock-form'){await mutation('admin/templates',{templates:Object.entries(PET_ITEMS).filter(([,i])=>i.ready!==false&&i.shop!==false).map(([id])=>id)},'宠物小铺准备好啦',key);return true;}
  if(form.id==='pet-dress-form'){const before=getState().pet,payload=form.elements.slot_head?readDressForm(form):data,r=await mutation('pets/dress',payload,'',key);const worn=Object.values(r.pet.equipped||{}).filter(Boolean).map(e=>PET_ITEMS[e]?.name).filter(Boolean);openDialog('今天也很好看',petMoment(before,r.pet,{kind:'dress',portrait:petPortrait})+'<p class="pet-result">'+esc(worn.length?worn.join(' ＋ '):'原来的可爱')+'</p><p class="field-help">衣橱里的装扮与大小角度设置已保存，随时可以再调整。</p><button class="btn full-width" data-page="growth">穿好啦，回小屋</button>');return true;}
  if(form.id==='pet-shelf-form'){const chosen=[...form.querySelectorAll('input[name="shelf_place"]:checked')].map(i=>i.value).slice(0,3);await mutation('pets/shelf',{shelf:chosen},'窗台陈列已更新',key);return true;}
  if(form.id==='pet-use-form'){const before=getState().pet,effect=getState().cards.find(c=>c.id===form.dataset.id)?.effect,item=PET_ITEMS[effect];const r=await mutation('pets/use',{card_id:form.dataset.id},'',key);openDialog(r.note,petMoment(before,r.pet,{kind:item?.kind==='food'?'feed':item?.kind==='outfit'?'dress':'welcome',effect,portrait:petPortrait})+careOutcome(before,r.pet,r.petXp,esc,petPortrait)+(item?.kind==='food'?'<button class="btn full-width" data-action="pet-feed">再看看口粮篮</button>':'')+'<button class="btn secondary full-width mt" data-page="growth">回到小伙伴身边</button>');return true;}
  return false;
 }
 function change(form){
  if(form.id!=='pet-dress-form')return;
  const p=getState().pet,payload=readDressForm(form);
  // If user just selected a new slot item, switch active tuner tab to that slot!
  const activeEl=typeof document!=='undefined'?document.activeElement:null;
  if(activeEl?.name?.startsWith('slot_')){
   const changedSlot=activeEl.name.slice(5);
   if(payload.equipped[changedSlot])activeTuneSlot=changedSlot;
  }
  form.querySelector('#pet-wardrobe-preview').innerHTML=wardrobePreview(p,payload.form,payload.equipped,draftTransforms);
  const tunerBox=form.querySelector('#pet-outfit-tuner');
  if(tunerBox)tunerBox.innerHTML=renderTunerControls(payload.equipped);
 }
 return {panel,click,submit,change};
}
