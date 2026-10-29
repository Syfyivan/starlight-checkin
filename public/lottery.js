import {petEffectLabel} from './pets.js';
import {petItemLock} from './pet-catalog.js';
export const effectLabel=p=>({room_rename:'改名体验 7 天',day_theme:'配色体验 24 小时',extra_draw:'免费机会 +1',shop_drop:'商城随机掉落 1 张'}[p.effect]||petEffectLabel(p.effect));

export function lotteryUI({getState,esc,yuan,coins,openDialog,actions,field,select,mutation,api,prizeDialog}){
  const state=()=>getState();
  let hint,anchor=null,pinned=false;
  function closeHint(){if(hint)hint.hidden=true;anchor?.removeAttribute('aria-describedby');anchor=null;pinned=false;}
  function showHint(button,pin=false){
    const prize=state()?.pool.find(p=>(p.id||'blank')===button.dataset.prize);if(!prize)return;
    if(!hint){hint=document.createElement('div');hint.id='prize-use-hint';hint.className='prize-use-hint';hint.setAttribute('role','tooltip');document.body.append(hint);}
    if(anchor!==button)closeHint();anchor=button;pinned=pin;
    const lock=petItemLock(state().pet,prize.effect),description=lock?lock+'。抽到后先存入卡包，解锁后再揭晓。':prize.description||(prize.id?'抽中后放入卡包，按卡片约定使用。':'这次没有获得奖品；消耗所选的学习币或免费机会。');
    hint.innerHTML=`<strong>${esc(lock?'神秘小礼物':prize.title)}</strong><p>${esc(description)}</p>${prize.effect==='room_rename'?'<small>使用后生效 7 天，到期恢复原名；放在卡包里不计时。</small>':''}${prize.wait_days?'<small>获得后等待 '+prize.wait_days+' 天可使用</small>':''}`;
    hint.hidden=false;button.setAttribute('aria-describedby',hint.id);
    const box=button.getBoundingClientRect(),width=hint.offsetWidth,height=hint.offsetHeight;
    hint.style.left=Math.max(12,Math.min(innerWidth-width-12,box.left+(box.width-width)/2))+'px';
    hint.style.top=Math.max(12,Math.min(innerHeight-height-12,box.top-height-8>=12?box.top-height-8:box.bottom+8))+'px';
  }
  const prizeButton=target=>target instanceof Element?target.closest('[data-action="prize-info"]'):null;
  document.addEventListener('pointerover',event=>{const button=prizeButton(event.target);if(event.pointerType==='mouse'&&button&&button!==anchor)showHint(button);});
  document.addEventListener('pointerout',event=>{if(pinned)return;if(anchor&&(anchor.contains(event.target)||hint?.contains(event.target))&&!anchor.contains(event.relatedTarget)&&!hint?.contains(event.relatedTarget))closeHint();});
  document.addEventListener('focusin',event=>{const button=prizeButton(event.target);if(button)showHint(button);});
  document.addEventListener('focusout',event=>{if(anchor?.contains(event.target)&&!pinned)closeHint();});
  document.addEventListener('click',event=>{if(!prizeButton(event.target)&&!hint?.contains(event.target))closeHint();});
  document.addEventListener('contextmenu',event=>{const button=prizeButton(event.target);if(button){event.preventDefault();showHint(button,true);}});
  document.addEventListener('keydown',event=>{if(event.key==='Escape')closeHint();});
  window.addEventListener('scroll',closeHint,true);window.addEventListener('resize',closeHint);
  function management(){
    const s=state(),r=s.lottery,o=s.admin.odds,prizes=s.admin.prizes.filter(p=>p.channel==='lottery'),removed=s.admin.removedPrizes.filter(p=>p.channel==='lottery');
    return `<section class="panel lottery-editor"><div class="panel-heading"><div><h2>抽奖专属清单</h2><p>与商城分开管理，库存互不扣减。</p></div><button class="btn sm" data-action="lucky-prize">＋ 添加奖品</button></div><div class="reward-tools"><button class="btn secondary sm" data-action="lucky-defaults">挑选默认奖励</button><button class="btn secondary sm" data-action="lucky-pet">加入小伙伴</button><button class="btn secondary sm" data-action="lucky-copy">从商城选入</button></div><div class="lottery-costs"><div><small>每次初始机会 · 估算</small><strong>¥${yuan(Math.round(r.chain_cents||0))}</strong></div><div><small>最高单次报销额度</small><strong>¥${yuan(r.maximum_cents)}</strong></div><div><small>上线后新增承诺额度</small><strong>¥${yuan(r.issued_cents)}</strong></div></div><details class="reward-guide"><summary>怎么算成本？</summary><p>预计成本 = 各奖品的「概率 × 报销额度」之和 ÷（1 − 续杯概率）。学习币不是现金收入。当前按这次的库存、价格和概率估算，下一次会重新计算。</p><p>偷偷卡按整个商城的学习币价格倒数分配概率；当前预计掉落额度 ¥${yuan(Math.round(r.drop_mean_cents))}，最高 ¥${yuan(r.drop_max_cents)}。功能卡不按人民币估价。</p><p>若保持当前概率和库存，每人每天 1 次初始机会，30 天约 ¥${yuan(Math.round((r.chain_cents||0)*30))}；每天 ${s.settings.drawLimit+(s.settings.dailyBonusKind==='ticket'?s.settings.dailyBonusAmount:0)} 次则约 ¥${yuan(Math.round((r.chain_cents||0)*30*(s.settings.drawLimit+(s.settings.dailyBonusKind==='ticket'?s.settings.dailyBonusAmount:0))))}。家庭多人参与还需乘人数；免费机会同样有成本。</p><p>平均值不能保证不超支，第一抽也可能中大奖。当前库存的直接报销额度保守合计 ¥${yuan(r.stock_exposure_cents)}，不含未来补货、修改奖品及合成加成。没有“每期 ¥100”限制。</p><p>已承诺额度包含抽中奖品、偷偷卡实际掉落和后续合成增额；目前合成新增 ¥${yuan(r.merge_cents)}。未来合成次数未知，不能计入上面的单次估算。旧版本已发的卡不追溯计数。</p><p>续杯合计最高 25%；抽中只存入 1 次机会。缺货或下架后，其概率转为“下次好运”，其他奖品概率不变。</p></details><form id="odds-form"><div class="odds-summary"><strong id="odds-total"></strong><span id="odds-blank"></span></div><p class="field-help">直接改百分比，余下是“下次好运”。0% 表示暂不参与。</p><div class="prize-admin-list">${prizes.map(p=>`<div class="record-row"><span class="record-icon ${esc(p.tone)}">${esc(p.emoji)}</span><div class="record-main"><strong>${esc(p.title)}</strong><small>${effectLabel(p)||'¥'+yuan(p.face_cents)} · 余 ${p.stock} 张 · ${p.active?'上架':'下架'}</small></div><div class="lottery-row-controls">${p.active?`<label class="odds-input"><input id="odds-${p.id}" name="odds_${p.id}" data-prize="${p.id}" value="${(o.entries.find(e=>e.id===p.id)?.bps||0)/100}" type="number" min="0" max="100" step="0.01" required aria-label="${esc(p.title)}中奖率"><span>%</span></label>`:''}<div class="reward-row-actions"><button type="button" class="btn secondary sm" data-action="lucky-prize" data-id="${p.id}">编辑</button><button class="text-btn remove-link" data-action="remove-prize" data-id="${p.id}">移除</button></div></div></div>`).join('')||'<p class="subtext">奖池还空着，先挑几份惊喜吧。</p>'}</div><div class="error-text" role="alert"></div><button class="btn mt" type="submit" ${o.entries.length?'':'disabled'}>保存中奖率</button><button type="button" class="text-btn" data-action="refresh-odds">重新加载奖池</button></form>${removed.length?`<details class="removed-prizes"><summary>已收起 ${removed.length} 份抽奖奖励</summary>${removed.map(p=>`<div class="record-row"><div class="record-main">${esc(p.title)}</div><button class="text-btn" data-action="restore-prize" data-id="${p.id}">恢复</button></div>`).join('')}</details>`:''}</section>`;
  }
  async function click(action,el){
    const s=state();
    if(action==='prize-info'){if(anchor===el&&pinned)closeHint();else showHint(el,true);return true;}
    if(action==='lucky-pet'){prizeDialog(undefined,'lottery',{effect:'pet_companion',title:'小伙伴敲敲门',description:'首次迎来糯糯海豹；重复使用增加 60 经验。',emoji:'🐾',category:'custom',face_cents:0,cost:100000000,stock:20});return true;}
    if(action==='lucky-prize'){prizeDialog(el.dataset.id,'lottery');return true;}
    if(action==='lucky-select-all'){const form=el.closest('form'),boxes=[...form.querySelectorAll('.lottery-picker input[type="checkbox"]')];for(const box of boxes)box.checked=el.dataset.checked==='1';return true;}
    if(action==='lucky-defaults'){
      openDialog('挑几份默认惊喜',`<form id="lucky-defaults-form"><p class="subtext">选一款或多款都可以。加入已有奖池时，新奖品暂为 0%，原中奖率保留；换整组时使用所选模板的建议概率。</p><div class="reward-tools"><button type="button" class="text-btn" data-action="lucky-select-all" data-checked="1">全选</button><button type="button" class="text-btn" data-action="lucky-select-all" data-checked="0">清空</button></div><div class="lottery-picker">${s.lotteryTemplates.map(p=>`<label class="lottery-choice"><input type="checkbox" name="templates" value="${p.template_id}"><span><strong>${esc(p.emoji)} ${esc(p.title)}</strong><small>${esc(p.description)}</small><small>建议概率 ${p.bps/100}% · 初始 ${p.stock} 张</small></span></label>`).join('')}</div>${select('怎样加入','replace',[['no','添加到现有奖池（已有模板跳过）'],['yes','收起旧奖池，换成所选模板']],'no')}<p class="field-help">选择“换成”会收起旧抽奖奖品。商城与已发卡不变；大奖请先确认愿意兑现。</p>${actions('加入选中的奖励')}</form>`);return true;
    }
    if(action==='lucky-copy'){
      const prizes=s.admin.prizes.filter(p=>p.channel==='shop'&&p.reward_scope!=='shared'&&(p.face_cents>0||p.effect));
      openDialog('从商城挑几份惊喜',`<form id="lucky-copy-form"><p class="subtext">可以单选、多选。各自复制为独立库存；加入后先为 0%，请在抽奖配置分配概率。共同奖励不参加个人抽奖。</p><div class="reward-tools"><button type="button" class="text-btn" data-action="lucky-select-all" data-checked="1">全选</button><button type="button" class="text-btn" data-action="lucky-select-all" data-checked="0">清空</button></div><div class="lottery-picker">${prizes.map(p=>`<label class="lottery-choice"><input type="checkbox" name="prize_ids" value="${p.id}"><span><strong>${esc(p.emoji)} ${esc(p.title)}</strong><small>${esc(effectLabel(p)||'¥'+yuan(p.face_cents))}</small></span></label>`).join('')}</div>${field('每款加入几张','stock','number',1,'required min="1" max="10000"')}${prizes.length?actions('复制选中的奖励'):'<p>先在商城准备一张单人报销卡或功能卡吧。</p>'}</form>`);return true;
    }
    if(action==='use-effect'){
      const c=s.cards.find(c=>c.id===el.dataset.id);
      if(c.effect==='day_theme')openDialog('今天换个心情',`<form id="theme-card-form" data-id="${c.id}"><p class="subtext">使用后在这间小屋体验 24 小时，只改变你自己的界面。再次使用会替换配色，并从现在重新计时。</p>${select('喜欢哪一种？','theme',[['cream','奶油晴天'],['berry','莓果软糖'],['sky','海盐天空']],'cream')}${actions('换上新配色')}</form>`);
      else if(c.effect==='shop_drop'){
        const r=await api('cards/drop-preview',{card_id:c.id});
        openDialog('小猫准备出发啦',`<form id="drop-card-form" data-id="${c.id}" data-version="${r.version}"><p>从全商城在售、有库存的报销卡中随机带回 1 张，不花学习币。功能卡和无报销额度的约定奖励不参与。</p><p class="subtext">价格越低越容易掉落，概率 =（1 ÷ 这张卡的学习币价）÷ 所有候选卡的价格倒数之和。使用时扣商城库存；清单变化会请你重新确认。</p><div class="drop-list">${r.pool.map(p=>`<div class="record-row"><div class="record-main"><strong>${esc(p.emoji)} ${esc(p.title)}</strong><small>¥${yuan(p.face_cents)} · 商城 ${coins(p.cost)} 币</small></div><b>${(p.probability*100).toFixed(3)}%</b></div>`).join('')||'<p>商城暂时没有可掉落的卡，先把偷偷卡留好。</p>'}</div>${r.pool.length?actions('用卡，随机带回一份'):'<button type="button" class="btn" data-action="close">先收好卡片</button>'}</form>`);
      }
      return true;
    }
    return false;
  }
  async function submit(form,data,key){
    if(form.id==='lucky-defaults-form'){await mutation('admin/lottery/defaults',{version:state().admin.odds.version,templates:new FormData(form).getAll('templates'),replace:data.replace==='yes'},'奖励已加入，请核对下方中奖率',key);return true;}
    if(form.id==='lucky-copy-form'){await mutation('admin/lottery/copy',{prize_ids:new FormData(form).getAll('prize_ids'),stock:Number(data.stock)},'已复制，请在下方分配中奖率',key);return true;}
    if(form.id==='theme-card-form'){await mutation('cards/use',{card_id:form.dataset.id,theme:data.theme},'新配色已生效，陪你 24 小时',key);return true;}
    if(form.id==='drop-card-form'){
      const r=await mutation('cards/use',{card_id:form.dataset.id,version:form.dataset.version},'',key);
      openDialog('小猫带回了这份心愿',`<div class="dialog-emoji">${esc(r.card.emoji)}</div><h3>${esc(r.card.title)}</h3><p>¥${yuan(r.card.face_cents)} 报销额度，已经放进卡包。没有扣学习币。</p><button class="btn full-width" data-action="close">收好啦</button>`);return true;
    }
    return false;
  }
  return {management,click,submit,closeHint};
}
