export const petEffectLabel=effect=>({pet_companion:'小伙伴 / 重复 +60 经验',pet_snack:'口粮 · +5 经验',pet_feast:'野餐 · +20 经验',pet_bow:'装扮 · 首次 +30 经验',pet_star:'装扮 · 首次 +50 经验'}[effect]||'');
export function petPurchaseHint(state,prize){
  const item=state.pet.items[prize.effect];if(!item)return '';
  if(!state.pet.owned)return '先领宠物';
  if(item.kind==='outfit'&&(state.pet.outfits.includes(prize.effect)||state.cards.some(c=>c.status==='ready'&&c.effect===prize.effect)))return '已拥有';
  return '';
}
export function petUI({getState,esc,canAct,openDialog,actions,select,mutation}){
  function picture(p,form=p.form,small=false){const file=p.owned?p.stage:'young';return `<div class="pet-portrait ${small?'pet-small':''}"><picture><source media="(prefers-reduced-motion: reduce)" srcset="pets/${form}/${file}.png"><img src="pets/${form}/${file}${small||!p.owned?'':'-idle-animated'}.png" alt="${esc(p.forms.find(f=>f.id===form)?.name)}" width="512" height="512" loading="lazy"></picture>${p.owned&&p.outfit&&!small?`<span class="pet-accessory ${p.outfit}" aria-label="${esc(p.items[p.outfit].name)}">${p.items[p.outfit].emoji}</span>`:''}</div>`;}
  function panel(){
    const s=getState(),p=s.pet,form=p.forms.find(f=>f.id===p.form),supplies=s.cards.filter(c=>c.status==='ready'&&c.effect.startsWith('pet_'));
    return `<section class="panel pet-home"><div class="pet-heading"><div><span class="pet-eyebrow">和小伙伴一起长大</span><h2>${p.owned?esc(form.name):'有只小可爱，正在等你'}</h2></div>${p.owned?`<span class="pet-level">Lv.${p.level}</span>`:'<span class="pet-level">抽奖限定</span>'}</div><div class="pet-main">${picture(p)}<div class="pet-progress"><p>${p.owned?esc(form.hint):'在抽奖里遇见「小伙伴敲敲门」，再到卡包迎接糯糯海豹。'}</p><strong>${p.xp.toLocaleString()} <small>累计经验</small></strong><progress class="progress" max="${p.nextXp?p.nextXp-p.levelStart:1}" value="${p.nextXp?p.xp-p.levelStart:1}" aria-label="宠物等级进度"></progress><small>${p.owned?(p.nextXp?'距离下一级还差 '+(p.nextXp-p.xp)+' 经验':'已到最高等级，经验继续积攒'): '已经赚到的经验会保留，遇见它就能用上'}</small><div class="pet-buttons">${p.owned?`<button class="btn sm" data-action="pet-dress" ${canAct()?'':'disabled'}>换个模样</button><button class="btn secondary sm" data-action="pet-shop">买点小礼物</button>`:'<button class="btn sm" data-page="lucky">去看看奖池</button>'}</div></div></div>${supplies.length?`<div class="pet-supplies"><h3>口粮与小礼物 <small>${supplies.length} 件待使用</small></h3>${supplies.slice(0,6).map(c=>`<div class="record-row"><span class="record-icon">${esc(c.emoji)}</span><div class="record-main"><strong>${esc(c.title)}</strong><small>${petEffectLabel(c.effect)}</small></div><button class="btn secondary sm" data-action="pet-use" data-id="${c.id}" ${!canAct()||Date.parse(c.available)>Date.now()||s.balance<0?'disabled':''}>使用</button></div>`).join('')}${supplies.length>6?'<button class="text-btn" data-page="cards">去卡包查看全部 →</button>':''}</div>`:''}<details class="pet-rules"><summary>经验与成长规则</summary><p>本屋任务实际赚到 1 学习币，就记 1 经验；全勤奖励发学习币也计入。消费不扣经验，撤销或改分同步修正经验与等级，不能靠反复勾选刷分。</p><p>食物使用后加经验；装扮首次解锁加经验，反复穿戴不再加。第一次的小伙伴只能抽到，之后再用小伙伴卡增加 60 经验。不同小屋分别成长。</p><p>Lv.3 解锁兜兜鼯鼠，Lv.4 长成进阶模样，Lv.5 解锁棉桃寄居蟹。升级自动进行，不扣累计经验；若撤销任务导致等级下降，高等级形象暂时换回糯糯。</p></details></section>`;
  }
  async function click(action,el){
    const s=getState(),p=s.pet;
    if(action==='pet-dress'){
      openDialog('今天想变成哪一种可爱？',`<form id="pet-dress-form"><div class="pet-form-grid">${p.forms.map(f=>`<label class="pet-form-option ${p.level<f.level?'locked':''}"><input type="radio" name="form" value="${f.id}" ${p.form===f.id?'checked':''} ${p.level<f.level?'disabled':''}>${picture({...p,outfit:''},f.id,true)}<strong>${esc(f.name)}</strong><small>${p.level<f.level?'Lv.'+f.level+' 解锁':'已解锁'}</small></label>`).join('')}</div>${select('穿戴小配饰','outfit',[['','先不戴'],...p.outfits.map(e=>[e,p.items[e].name])],p.outfit)}<p class="field-help">已解锁的模样随时切换，不再花币或经验。</p>${actions('就用这个模样')}</form>`);return true;
    }
    if(action==='pet-use'||action==='use-effect'&&s.cards.find(c=>c.id===el.dataset.id)?.effect.startsWith('pet_')){
      const card=s.cards.find(c=>c.id===el.dataset.id);if(!card)return false;
      const item=p.items[card.effect],duplicate=item?.kind==='outfit'&&p.outfits.includes(card.effect);
      const text=card.effect==='pet_companion'?(p.owned?'这次小伙伴会带回 60 经验。':'使用后，糯糯海豹就会住进这间小屋。已有经验直接计入成长。'):duplicate?'你已经拥有这件装扮。使用只会消耗此卡并重新穿戴，不重复增加经验。':item?.kind==='food'?`给小伙伴吃一份，增加 ${item.xp} 经验。`:`解锁并穿戴装扮，增加 ${item.xp} 经验；以后可以免费换装。`;
      openDialog(esc(card.title),`<form id="pet-use-form" data-id="${card.id}"><p>${text}</p><p class="field-help">${p.owned||card.effect==='pet_companion'?'只消耗这张卡，不再扣学习币。':'先抽到小伙伴，这张卡会替你留好。'}</p>${p.owned||card.effect==='pet_companion'?actions('确认使用'):'<button class="btn" type="button" data-action="close">先收好</button>'}</form>`);return true;
    }
    return false;
  }
  async function submit(form,data,key){
    if(form.id==='pet-dress-form'){await mutation('pets/dress',data,'已换上新模样',key);return true;}
    if(form.id==='pet-use-form'){const result=await mutation('pets/use',{card_id:form.dataset.id},'',key);openDialog(result.note,`${picture(result.pet)}<p class="pet-result">${result.petXp?'+'+result.petXp+' 经验 · ':''}Lv.${result.pet.level} · ${result.pet.xp} 经验</p><button class="btn full-width" data-page="growth">看看小伙伴</button>`);return true;}
    return false;
  }
  return {panel,click,submit};
}
