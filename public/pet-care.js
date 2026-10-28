import {PET_ITEMS,petItemLock} from './pet-catalog.js';
import {artwork,silhouette} from './illustrations.js';

// Group physical cards for the UI; the server still consumes one exact card ID.
export function foodInventory(state,at=state.serverNow??Date.now()){
 const groups=new Map();
 for(const c of state.cards){if(c.status!=='ready'||PET_ITEMS[c.effect]?.kind!=='food')continue;
  if(!groups.has(c.effect))groups.set(c.effect,[]);groups.get(c.effect).push(c);
 }
 return [...groups].map(([effect,cards])=>{const item=PET_ITEMS[effect],lock=petItemLock(state.pet,effect),ready=cards.filter(c=>Date.parse(c.available)<=at).sort((a,b)=>a.available.localeCompare(b.available)||a.id.localeCompare(b.id));
  return {effect,item,count:cards.length,ready:ready.length,card:ready[0],lock,blocked:lock||(state.travel.away?'旅行中，回来再喂':state.balance<0?'先补足待补余额':!ready.length?'还没到可用时间':'')};
 });
}
export function newlyUnlocked(before,after){
 return Object.entries(PET_ITEMS).filter(([,i])=>i.ready!==false&&i.level>before.level&&i.level<=after.level).map(([effect,item])=>({effect,...item}));
}
export function foodShelf(state,esc){
 const groups=foodInventory(state);
 return '<p class="subtext">挑一份已经收好的口粮。喂食用掉一张卡，旅行就不能再带同一份啦。</p><div class="pet-food-shelf">'+groups.map(g=>'<button class="food-choice '+(g.lock?'locked':'')+'" data-action="pet-use" data-id="'+esc(g.card?.id||'')+'" '+(g.blocked?'disabled':'')+'><span class="food-choice-art">'+(g.lock?silhouette('food'):artwork(g.item.art))+'</span><span><strong>'+esc(g.lock?'神秘口粮':g.item.name)+'</strong><small>'+esc(g.blocked||'喂一份 · +'+g.item.xp+' 经验')+'</small></span><b>×'+g.count+'</b></button>').join('')+'</div>'+(!groups.length?'<div class="pet-food-empty">'+artwork('bowl')+'<p>小碗还空着，去小铺挑一份吧。</p></div>':'')+'<button class="btn secondary full-width" data-action="pet-shop">去小铺补充口粮</button>';
}
const faces={
 'nuonuo-seal':{young:[353,270],winged:[254,217],moon:[358,275],star:[253,210]},
 'pocket-glider':{young:[241,261],winged:[241,254]},
 'cottonpod-hermit':{young:[281,380],winged:[280,393]}
};
function bite(art){
 if(art==='berry')return '<circle r="9" fill="#8d7595"/><path d="m-4-5 4 3 4-3" fill="none" stroke="#e5cce0" stroke-width="2"/>';
 if(art==='soup')return '<path d="M-10-3Q0-16 10-3L7 8H-7Z" fill="#d8b390" stroke="#ac8667"/><path d="M-5 7h10v7H-5Z" fill="#f6e4be"/>';
 return '<path d="M-10 6Q-14-5-4-7Q0-15 6-7Q17-4 10 7Z" fill="#fff0cf" stroke="#cab38b" stroke-width="1.5"/><path d="m-4 0 4 3 4-4" fill="none" stroke="#abc093" stroke-width="2"/>';
}
function sparkles(){return '<svg class="moment-sparks" viewBox="0 0 512 512" aria-hidden="true">'+[[125,165],[382,182],[126,325],[374,343],[256,94]].map(([x,y],i)=>'<g class="moment-spark" style="--spark-delay:'+i*90+'ms" transform="translate('+x+' '+y+')"><path d="m0-9 3 6 6 3-6 3-3 6-3-6-6-3 6-3Z" fill="#cfb66b"/><circle cx="13" cy="-12" r="2" fill="#a8b89a"/></g>').join('')+'</svg>';}

// All motion is presentational: called only after a successful server mutation.
export function petMoment(before,after,{kind='welcome',effect='',portrait}){
 const item=PET_ITEMS[effect],egg=after.growth?.isEgg,hatch=before.growth?.isEgg&&!egg,stage=after.form==='nuonuo-seal'?after.growth?.visual||after.stage:after.stage;
 const face=faces[after.form]?.[stage]||[256,270];
 const mode=kind==='evolve'?(hatch?'hatch':egg?'cocoon':'grow'):kind==='feed'&&egg?'warm':kind;
 const beforeHtml=['hatch','cocoon','grow'].includes(mode)?'<div class="moment-before">'+portrait(before,{staticPose:true})+'</div>':'';
 const crack=hatch?'<svg class="moment-crack" viewBox="0 0 512 512" aria-hidden="true"><path d="m246 139-12 46 29 29-26 44 42 34-19 45 19 43" fill="none" stroke="#b8a58b" stroke-width="3" stroke-linejoin="round"/></svg><svg class="moment-shells" viewBox="0 0 512 512" aria-hidden="true"><path class="shell-left" d="m205 310 22 12 13-19 17 20-9 64q-57-5-66-51Z" fill="#efe4d0" stroke="#c7b796"/><path class="shell-right" d="m269 321 19-23 18 23 21-11 5 31q-13 38-58 46Z" fill="#f4ead6" stroke="#c7b796"/></svg>':'';
 const bites=mode==='feed'?'<div class="moment-dish">'+artwork(item?.art||'bowl')+'</div><svg class="moment-bites" viewBox="0 0 512 512" aria-hidden="true">'+[0,1,2].map(i=>'<g class="moment-bite" style="--bite-delay:'+i*430+'ms;--to-x:'+face[0]+'px;--to-y:'+face[1]+'px">'+bite(item?.art)+'</g>').join('')+'</svg>':'';
 return '<div class="pet-moment moment-'+mode+'" aria-hidden="true"><span class="moment-halo"></span>'+beforeHtml+'<div class="moment-after">'+portrait(after,{staticPose:true})+'</div>'+crack+bites+sparkles()+(mode==='feed'||mode==='warm'?'<svg class="moment-heart" viewBox="0 0 40 40"><path d="M20 32 6 18C-3 4 17 0 20 12 25 0 43 4 34 18Z" fill="#dba99e"/></svg>':'')+'</div>';
}
export function careOutcome(before,after,xp,esc,portrait){
 const unlocks=newlyUnlocked(before,after),forms=after.forms.filter(f=>f.level>before.level&&f.level<=after.level);
 return '<div class="care-outcome" role="status"><strong>'+(after.level>before.level?'长大一点 · Lv.'+after.level:xp>0?'收下 '+xp+' 经验':'今天也很好看')+'</strong><p>'+before.xp+' → '+after.xp+' 经验'+(after.level>before.level?' · 新东西在等你啦':'')+'</p></div>'+((unlocks.length||forms.length)?'<div class="care-unlocks"><h3>这次新解锁</h3><div>'+unlocks.map(i=>'<span>'+artwork(i.art)+'<small>'+esc(i.name)+'</small></span>').join('')+forms.map(f=>'<span>'+(portrait?portrait({...after,outfit:''},{form:f.id,small:true,staticPose:true}):artwork('pet_companion'))+'<small>'+esc(f.name)+'</small></span>').join('')+'</div></div>':'');
}
