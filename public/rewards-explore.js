import {PET_ITEMS,petItemLock} from './pet-catalog.js';
import {petPurchaseHint} from './pets.js';
export function rewardExplorerUI({getState,canAct,esc,coins,openDialog,mutation,render,getFilter,setFilter}){
 const state=getState;let scope='',view='all';
 function sync(){const key=state().space.id;if(scope!==key){scope=key;view='all';}}
 function categoryBar(active,action,values,items){
  const count=id=>items?.filter(p=>id==='all'||(id==='pets'?p.effect?.startsWith('pet_'):id==='functions'?!!p.effect:p.category===id)).length;
  return `<div class="reward-category-bar" data-category-bar><div class="reward-category-track" role="group" aria-label="奖励分类，可左右滑动">${values.map(([id,label])=>`<button class="chip ${id===active?'active':''}" aria-pressed="${id===active}" data-action="${esc(action)}" data-value="${esc(id)}">${esc(label)}${items?`<small>${count(id)}</small>`:''}</button>`).join('')}</div><div class="category-controls"><button class="category-arrow" data-action="category-scroll" data-step="-1" aria-label="向左查看分类">‹</button><button class="category-arrow" data-action="category-scroll" data-step="1" aria-label="向右查看分类">›</button><button class="category-all" data-action="category-all" aria-label="展开全部奖励分类">分类 ▦</button></div></div>`;
 }
 function filter(items){sync();return items.filter(p=>view==='all'||!(PET_ITEMS[p.effect]&&petItemLock(state().pet,p.effect))&&p.stock>0&&(view==='affordable'?p.cost<=state().balance:p.cost>state().balance));}
 function tools(){sync();return `<div class="wish-browse-tools"><div class="wish-views" role="group" aria-label="按心愿价格浏览">${[['all','全部心愿'],['affordable','现在够得着'],['saving','想攒一攒']].map(([id,label])=>`<button data-action="wish-view" data-value="${id}" aria-pressed="${view===id}" class="${view===id?'active':''}">${label}</button>`).join('')}</div><button class="text-btn" data-action="wish-discover">逛逛别的分类 ↗</button></div>`;}
 function goalButton(prize){
  if(!canAct()||state().personalPetShop||prize.stock<=0||petPurchaseHint(state(),prize))return '';
  const selected=state().wishGoal?.prize_id===prize.id;
  return `<button class="wish-pin ${selected?'selected':''}" data-action="wish-pin" data-id="${esc(prize.id)}" aria-pressed="${selected}" aria-label="${selected?'取消心愿目标：':'设为下一份心愿：'}${esc(prize.title)}">${selected?'✓ 正在攒这份':'♡ 设为心愿'}</button>`;
 }
 function goalPanel(compact=false){
  const s=state(),g=s.wishGoal;if(!g)return '';
  const balance=Math.max(0,s.balance),ratio=Math.min(100,Math.floor(balance/Math.max(1,g.cost)*100)),ready=g.available&&g.remaining<=0;
  return `<section class="wish-goal ${compact?'wish-goal-compact':''}" aria-label="下一份心愿"><div class="wish-goal-body"><div class="wish-goal-caption"><span>${s.space.isSelf?'我的下一份心愿':'伙伴的下一份心愿'}</span><small>${coins(Math.min(balance,g.cost))} / ${coins(g.cost)} 币</small></div><div class="wish-goal-title"><strong>${esc(g.title)}</strong><span>${!g.available?esc(g.reason||'暂时不能兑换'):ready?'已经攒够啦':`再攒 ${coins(g.remaining)} 币`}</span></div><progress max="100" value="${ratio}" aria-label="心愿进度 ${ratio}%"></progress></div><div class="wish-goal-actions">${compact?'<button class="text-btn" data-page="shop">去商城 →</button>':`${ready&&canAct()&&!s.credit?.contract?.overdue?`<button class="btn sm" data-action="buy" data-id="${esc(g.prize_id)}">兑现心愿</button>`:''}${canAct()?'<button class="text-btn" data-action="wish-clear">换个心愿</button>':''}`}</div>${!compact?'<p>只记下期待，不扣币、不预留库存。价格和余额变化会一起更新。</p>':''}</section>`;
 }
 function afterRender(){for(const bar of document.querySelectorAll('[data-category-bar]')){
  const track=bar.querySelector('.reward-category-track'),active=track.querySelector('[aria-pressed="true"]');
  if(active)track.scrollLeft=Math.max(0,active.offsetLeft-track.offsetLeft-track.clientWidth/2+active.clientWidth/2);
 }}
 async function click(action,el){
  if(action==='wish-info'){
   const s=state(),p=s.prizes.find(p=>p.id===el.dataset.id);if(!p||PET_ITEMS[p.effect]&&petItemLock(s.pet,p.effect))return true;
   openDialog('这份心愿，怎么兑现？',`<section class="wish-information"><small>${esc(s.categories.find(c=>c.id===p.category)?.name||'心愿奖励')}</small><h3>${esc(p.title)}</h3><p>${esc(p.description)}</p><strong>${coins(p.cost)} 学习币</strong><p>${p.face_cents?'报销额度 ¥'+p.face_cents/100:p.effect?'功能卡 · 在卡包使用':'一次约定体验 · 和发奖人约好时间'}${p.wait_days?'，兑换后等待 '+p.wait_days+' 天可用。':'，兑换后即可使用。'}</p>${goalButton(p)}</section>`);return true;
  }
  if(action==='category-scroll'){
   const track=el.closest('[data-category-bar]').querySelector('.reward-category-track');track.scrollBy({left:Number(el.dataset.step)*track.clientWidth*.7,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});return true;
  }
  if(action==='category-all'){
   const buttons=[...el.closest('[data-category-bar]').querySelectorAll('.reward-category-track button')];
   openDialog('想逛哪一间？',`<div class="category-picker">${buttons.map(b=>`<button class="category-picker-item ${b.getAttribute('aria-pressed')==='true'?'active':''}" data-action="${esc(b.dataset.action)}" data-value="${esc(b.dataset.value)}"><span>${esc(b.childNodes[0].textContent)}</span><small>${esc(b.querySelector('small')?.textContent||'')} 款</small></button>`).join('')}</div>`);return true;
  }
  if(action==='wish-view'){sync();view=el.dataset.value;render();return true;}
  if(action==='wish-discover'){
   const s=state(),options=s.categories.filter(c=>s.prizes.some(p=>p.category===c.id&&p.stock>0)),at=options.findIndex(c=>c.id===getFilter());
   if(options.length){setFilter(options[(at+1)%options.length].id);view='all';render();}return true;
  }
  if(action==='wish-pin'||action==='wish-clear'){
   if(!canAct())return true;
   const selected=state().wishGoal?.prize_id===el.dataset.id;
   await mutation('wishes/goal',{prize_id:action==='wish-clear'||selected?null:el.dataset.id},action==='wish-clear'||selected?'心愿已收起，去挑一份新的喜欢吧':'心愿记好啦，每一点努力都更靠近它');return true;
  }
  return false;
 }
 return {categoryBar,filter,tools,goalButton,goalPanel,afterRender,click};
}
