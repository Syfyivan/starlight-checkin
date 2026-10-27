import {petEffectLabel} from './pets.js';
export const effectLabel=p=>({room_rename:'改名 1 次',day_theme:'配色体验 24 小时',extra_draw:'免费机会 +1',shop_drop:'商城随机掉落 1 张'}[p.effect]||petEffectLabel(p.effect));

export function lotteryUI({getState,esc,yuan,coins,openDialog,actions,field,select,mutation,api,prizeDialog}){
  const state=()=>getState();
  function management(){
    const s=state(),r=s.lottery,o=s.admin.odds,prizes=s.admin.prizes.filter(p=>p.channel==='lottery'),removed=s.admin.removedPrizes.filter(p=>p.channel==='lottery');
    return `<section class="panel lottery-editor"><div class="panel-heading"><div><h2>抽奖专属清单</h2><p>与商城分开管理，库存互不扣减。</p></div><button class="btn sm" data-action="lucky-prize">＋ 添加奖品</button></div><div class="reward-tools"><button class="btn secondary sm" data-action="lucky-defaults">换上 7 款默认奖励</button><button class="btn secondary sm" data-action="lucky-pet">加入小伙伴</button><button class="btn secondary sm" data-action="lucky-copy">从商城选入</button></div><div class="lottery-costs"><div><small>每次初始机会 · 估算</small><strong>¥${yuan(Math.round(r.chain_cents||0))}</strong></div><div><small>最高单次报销额度</small><strong>¥${yuan(r.maximum_cents)}</strong></div><div><small>上线后新增承诺额度</small><strong>¥${yuan(r.issued_cents)}</strong></div></div><details class="reward-guide"><summary>怎么算成本？</summary><p>预计成本 = 各奖品的「概率 × 报销额度」之和 ÷（1 − 续杯概率）。学习币不是现金收入。当前按这次的库存、价格和概率估算，下一次会重新计算。</p><p>偷偷卡按整个商城的学习币价格倒数分配概率；当前预计掉落额度 ¥${yuan(Math.round(r.drop_mean_cents))}，最高 ¥${yuan(r.drop_max_cents)}。功能卡不按人民币估价。</p><p>若保持当前概率和库存，每人每天 1 次初始机会，30 天约 ¥${yuan(Math.round((r.chain_cents||0)*30))}；每天 ${s.settings.drawLimit+(s.settings.dailyBonusKind==='ticket'?s.settings.dailyBonusAmount:0)} 次则约 ¥${yuan(Math.round((r.chain_cents||0)*30*(s.settings.drawLimit+(s.settings.dailyBonusKind==='ticket'?s.settings.dailyBonusAmount:0))))}。家庭多人参与还需乘人数；免费机会同样有成本。</p><p>平均值不能保证不超支，第一抽也可能中大奖。当前库存的直接报销额度保守合计 ¥${yuan(r.stock_exposure_cents)}，不含未来补货、修改奖品及合成加成。没有“每期 ¥100”限制。</p><p>已承诺额度包含抽中奖品、偷偷卡实际掉落和后续合成增额；目前合成新增 ¥${yuan(r.merge_cents)}。未来合成次数未知，不能计入上面的单次估算。旧版本已发的卡不追溯计数。</p><p>续杯合计最高 25%；抽中只存入 1 次机会。缺货或下架后，其概率转为“下次好运”，其他奖品概率不变。</p></details><form id="odds-form"><div class="odds-summary"><strong id="odds-total"></strong><span id="odds-blank"></span></div><p class="field-help">直接改百分比，余下是“下次好运”。0% 表示暂不参与。</p><div class="prize-admin-list">${prizes.map(p=>`<div class="record-row"><span class="record-icon ${esc(p.tone)}">${esc(p.emoji)}</span><div class="record-main"><strong>${esc(p.title)}</strong><small>${effectLabel(p)||'¥'+yuan(p.face_cents)} · 余 ${p.stock} 张 · ${p.active?'上架':'下架'}</small></div><div class="lottery-row-controls">${p.active?`<label class="odds-input"><input id="odds-${p.id}" name="odds_${p.id}" data-prize="${p.id}" value="${(o.entries.find(e=>e.id===p.id)?.bps||0)/100}" type="number" min="0" max="100" step="0.01" required aria-label="${esc(p.title)}中奖率"><span>%</span></label>`:''}<div class="reward-row-actions"><button type="button" class="btn secondary sm" data-action="lucky-prize" data-id="${p.id}">编辑</button><button class="text-btn remove-link" data-action="remove-prize" data-id="${p.id}">移除</button></div></div></div>`).join('')||'<p class="subtext">奖池还空着，先挑几份惊喜吧。</p>'}</div><div class="error-text" role="alert"></div><button class="btn mt" type="submit" ${o.entries.length?'':'disabled'}>保存中奖率</button><button type="button" class="text-btn" data-action="refresh-odds">重新加载奖池</button></form>${removed.length?`<details class="removed-prizes"><summary>已收起 ${removed.length} 份抽奖奖励</summary>${removed.map(p=>`<div class="record-row"><div class="record-main">${esc(p.title)}</div><button class="text-btn" data-action="restore-prize" data-id="${p.id}">恢复</button></div>`).join('')}</details>`:''}</section>`;
  }
  async function click(action,el){
    const s=state();
    if(action==='lucky-pet'){prizeDialog(undefined,'lottery',{effect:'pet_companion',title:'小伙伴敲敲门',description:'首次迎来糯糯海豹；重复使用增加 60 经验。',emoji:'🐾',category:'custom',face_cents:0,cost:100000000,stock:20});return true;}
    if(action==='lucky-prize'){prizeDialog(el.dataset.id,'lottery');return true;}
    if(action==='lucky-defaults'){
      openDialog('准备一小盒惊喜',`<p>7 款奖励：改名 15%、配色 24%、续杯 20%、¥5 学习卡 8%、偷偷卡 2%、¥500 自选卡 0.1%、小伙伴 15%；下次好运 15.9%。</p><p class="subtext">会收起当前抽奖清单，保留商城和已经发出的卡。默认大奖库存 1 张；请确认你愿意兑现这份大奖，再启用。之后可以改额度、库存和概率。</p><form id="lucky-defaults-form">${actions('确认换上这组奖励')}</form>`);return true;
    }
    if(action==='lucky-copy'){
      const prizes=s.admin.prizes.filter(p=>p.channel==='shop'&&(p.face_cents>0||p.effect));
      openDialog('从商城挑一份惊喜',`<form id="lucky-copy-form"><p class="subtext">复制成独立的抽奖奖品，之后的编辑和库存各管各的。添加后记得在下方分配中奖率。</p>${select('选一张商城卡','prize_id',prizes.map(p=>[p.id,p.title+' · '+(effectLabel(p)||'¥'+yuan(p.face_cents))]),prizes[0]?.id)}${field('抽奖可发几张','stock','number',1,'required min="1" max="10000"')}${prizes.length?actions('复制进抽奖清单'):'<p>先在商城准备一张报销卡或功能卡吧。</p>'}</form>`);return true;
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
    if(form.id==='lucky-defaults-form'){await mutation('admin/lottery/defaults',{version:state().admin.odds.version},'新奖池准备好啦，商城保持原样',key);return true;}
    if(form.id==='lucky-copy-form'){await mutation('admin/lottery/copy',{prize_id:data.prize_id,stock:Number(data.stock)},'已复制，请在下方分配中奖率',key);return true;}
    if(form.id==='theme-card-form'){await mutation('cards/use',{card_id:form.dataset.id,theme:data.theme},'新配色已生效，陪你 24 小时',key);return true;}
    if(form.id==='drop-card-form'){
      const r=await mutation('cards/use',{card_id:form.dataset.id,version:form.dataset.version},'',key);
      openDialog('小猫带回了这份心愿',`<div class="dialog-emoji">${esc(r.card.emoji)}</div><h3>${esc(r.card.title)}</h3><p>¥${yuan(r.card.face_cents)} 报销额度，已经放进卡包。没有扣学习币。</p><button class="btn full-width" data-action="close">收好啦</button>`);return true;
    }
    return false;
  }
  return {management,click,submit};
}
