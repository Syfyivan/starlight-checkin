const SUITS={c:'♣',d:'♦',h:'♥',s:'♠'};
const SUIT_NAMES={c:'梅花',d:'方块',h:'红桃',s:'黑桃'};
const RANK_LABELS={A:'A',K:'K',Q:'Q',J:'J',T:'10','9':'9','8':'8','7':'7','6':'6','5':'5','4':'4','3':'3','2':'2'};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

const HAND_GUIDE=[
  {type:8,name:'同花顺',sample:['9h','8h','7h','6h','5h']},
  {type:7,name:'四条',sample:['As','Ah','Ad','Ac','Ks']},
  {type:6,name:'葫芦',sample:['Ks','Kh','Kd','8c','8s']},
  {type:5,name:'同花',sample:['Ad','Jd','9d','6d','3d']},
  {type:4,name:'顺子',sample:['9s','8h','7d','6c','5s']},
  {type:3,name:'三条',sample:['Qs','Qh','Qd','9c','4s']},
  {type:2,name:'两对',sample:['Js','Jh','7d','7c','As']},
  {type:1,name:'一对',sample:['Ts','Th','Ad','8c','5s']},
  {type:0,name:'高牌',sample:['As','Kd','9h','6c','2s']}
];

function suitVector(suit,cx,cy,size,color){
  const s=size/24;
  const paths={
    h:`<path d="M0 ${7*s} C${-11*s} ${-2*s} ${-13*s} ${-10*s} ${-6*s} ${-10*s} C${-2*s} ${-10*s} 0 ${-6*s} 0 ${-4*s} C0 ${-6*s} ${2*s} ${-10*s} ${6*s} ${-10*s} C${13*s} ${-10*s} ${11*s} ${-2*s} 0 ${7*s}Z" fill="${color}"/>`,
    d:`<path d="M0 ${-11*s} L${9*s} 0 L0 ${11*s} L${-9*s} 0Z" fill="${color}"/>`,
    s:`<path d="M0 ${-11*s} C${9*s} ${-2*s} ${12*s} ${4*s} ${5*s} ${6*s} C${2*s} ${7*s} ${1*s} ${5*s} 0 ${4*s} L${2*s} ${10*s} H${-2*s} L0 ${4*s} C${-1*s} ${5*s} ${-2*s} ${7*s} ${-5*s} ${6*s} C${-12*s} ${4*s} ${-9*s} ${-2*s} 0 ${-11*s}Z" fill="${color}"/>`,
    c:`<g fill="${color}"><circle cx="0" cy="${-5*s}" r="${4.6*s}"/><circle cx="${-5*s}" cy="${1.5*s}" r="${4.6*s}"/><circle cx="${5*s}" cy="${1.5*s}" r="${4.6*s}"/><path d="M0 ${2*s} L${2.4*s} ${10*s} H${-2.4*s}Z"/></g>`
  };
  return `<g transform="translate(${cx} ${cy})">${paths[suit]||paths.s}</g>`;
}

export function renderSvgCard(card,{highlight=false,fresh=false,mini=false}={}){
  const rCode=card[0],sCode=card[1];
  const rank=RANK_LABELS[rCode]||rCode;
  const isRed=sCode==='h'||sCode==='d';
  const ink=isRed?'#bf3934':'#25332f';
  const trim=highlight?'#e8b43b':'#d8ccb4';
  const cls=['svg-playing-card',mini?'mini-card':'',highlight?'best-card':'',fresh?'card-flip':''].filter(Boolean).join(' ');

  let centerArt='';
  if(rCode==='A'){
    centerArt=`<circle cx="50" cy="70" r="24" fill="${isRed?'#fdf0ed':'#eef3f0'}" stroke="${isRed?'#ecc6be':'#cad7d0'}" stroke-width="1.5"/>${suitVector(sCode,50,70,34,ink)}`;
  }else if(rCode==='K'||rCode==='Q'||rCode==='J'){
    const crown=rCode==='K'
      ?'<path d="M33 66 L37 50 L44 58 L50 46 L56 58 L63 50 L67 66Z" fill="#ebd07e" stroke="#85652d" stroke-width="2"/>'
      :rCode==='Q'
      ?'<path d="M35 66 Q50 44 65 66Z" fill="#eed68a" stroke="#85652d" stroke-width="2"/><circle cx="50" cy="48" r="4" fill="#df8b86"/>'
      :'<path d="M38 66 L50 46 L62 66Z" fill="#b7d0c8" stroke="#4d6b63" stroke-width="2"/>';
    centerArt=`<rect x="28" y="40" width="44" height="60" rx="7" fill="${isRed?'#fcf1ee':'#eff4f1'}" stroke="#d9c69c" stroke-width="1.5"/>${crown}${suitVector(sCode,50,82,20,ink)}`;
  }else{
    centerArt=`<rect x="30" y="42" width="40" height="56" rx="8" fill="${isRed?'#fdf4f2':'#f3f6f4'}" opacity=".75"/>${suitVector(sCode,50,70,29,ink)}`;
  }

  return `<span class="${cls}" aria-label="${SUIT_NAMES[sCode]||''}${rank}">
    <svg viewBox="0 0 100 140" aria-hidden="true">
      <rect x="2" y="2" width="96" height="136" rx="11" fill="#fffdf8" stroke="${trim}" stroke-width="${highlight?4:2}"/>
      <rect x="7" y="7" width="86" height="126" rx="7" fill="none" stroke="#efe7d4" stroke-width="1"/>
      <text x="16" y="27" font-family="Georgia,serif" font-size="20" font-weight="700" text-anchor="middle" fill="${ink}">${rank}</text>
      ${suitVector(sCode,16,41,13,ink)}
      ${centerArt}
      <g transform="rotate(180 50 70)">
        <text x="16" y="27" font-family="Georgia,serif" font-size="20" font-weight="700" text-anchor="middle" fill="${ink}">${rank}</text>
        ${suitVector(sCode,16,41,13,ink)}
      </g>
    </svg>
  </span>`;
}

export function renderSvgBack(label='✦'){
  return `<span class="svg-playing-card poker-back-wrap" aria-hidden="true">
    <svg viewBox="0 0 100 140">
      <rect x="2" y="2" width="96" height="136" rx="11" fill="#fffdf8" stroke="#c8d6ce" stroke-width="2"/>
      <rect x="8" y="8" width="84" height="124" rx="7" fill="#2c594e" stroke="#8fb5a6" stroke-width="1.5"/>
      <path d="M20 20h60v100H20Z" fill="none" stroke="#ebd38e66" stroke-width="1.5" stroke-dasharray="4 3"/>
      <circle cx="50" cy="70" r="18" fill="#21463d" stroke="#ebd38e" stroke-width="1.5"/>
      <text x="50" y="76" font-size="18" text-anchor="middle" fill="#f7e6b2">${esc(label)}</text>
    </svg>
  </span>`;
}

function legacyPokerTable(t){
  const h=t.hand,open=h&&!h.result;
  const button=(move,title,disabled=false,bet=0)=>`<button class="btn secondary sm" data-action="poker-move" data-move="${move}" data-bet="${bet}" ${disabled?'disabled':''}>${title}</button>`;
  const hand=h?`<section class="poker-felt clubhouse-felt"><small>公共牌</small><div class="card-row board-cards">${(h.board||[]).map(c=>renderSvgCard(c)).join('')}${open?renderSvgBack('?')+renderSvgBack('?'):''}</div><p>你的底牌</p><div class="card-row">${(h.player||[]).map(c=>renderSvgCard(c)).join('')}</div><p>系统底牌　${open?'盖牌中':(h.dealer||[]).map(c=>renderSvgCard(c,{mini:true})).join('')}</p>${h.result?`<h3>${esc(h.result)} · ${h.profit>0?'+':''}${h.profit} 筹码</h3>`:`<p>双方各押 ${h.stake} 筹码，轮到你选择。</p>`}</section>`:'';
  return `<p>你有 <strong>${t.chips}</strong> 筹码。</p>${hand}
    <div class="reward-tools">${open?button('show','摊牌')+button('raise','加倍',t.chips<h.stake)+button('fold','弃牌'):
      [2,5,10].map(n=>button('deal','押 '+n+' 发牌',t.chips<n,n)).join('')}</div>
    <div class="reward-tools mt">${button('claim','领 +'+t.dailyChips,!t.canClaim)}${button('exchange','换抽奖',t.chips<t.ticketCost)}</div>`;
}

function microHint(h){
  if(!h)return '';
  if(h.result)return h.best?`对手：${h.best.dealer.name}`:'本局结束';
  const type=h.analysis?.made?.type??0;
  const draws=h.analysis?.draws||[];
  if(type>=4)return '🔥 强牌可加注';
  if(type>=2)return '💪 好牌可加注';
  if(draws.length)return '🎯 '+draws[0].hint;
  if(type===1)return '🙂 稳健过牌';
  return '💡 建议过牌';
}

export function pokerHouseEntry(p,canAct=true){
  if(!p||p.enabled===false)return '';
  const open=p.hand&&!p.hand.result;
  const minWin=p.minWinRequired||5;
  const readyTicket=p.chips>=p.ticketCost&&p.earnedChips>=minWin&&p.exchangedToday<p.dailyTicketCap;
  const tag=readyTicket?'🎟️ 可换抽奖':p.canClaimTask?`✨ 打卡+${p.taskBonusChips}`:'';
  return `<section class="panel poker-entry-card">
    <div class="poker-entry-compact">
      <div class="poker-entry-main">
        <strong>🃏 星光牌屋 ${tag?`<span class="set-pill">${esc(tag)}</span>`:''}</strong>
        <span class="subtext">筹码 <b>${p.chips}</b> · 满 <b>${p.ticketCost}</b> 码（净赢≥${minWin}）换免费抽奖</span>
      </div>
      <button type="button" class="btn sm" data-action="poker-house" ${canAct?'':'disabled'}>${open?'继续牌局':'上桌玩两把'}</button>
    </div>
  </section>`;
}

export function pokerTable(t){
  if(t.earnedChips===undefined)return legacyPokerTable(t);
  const h=t.hand,open=!!(h&&!h.result);
  const cname=t.coinName||'学习币';
  const minWin=t.minWinRequired||5;
  const activeDealer=(t.dealers||[]).find(d=>d.id===(h?.dealerId||t.dealerId))||t.dealer||{id:'owl',name:'馆长',emoji:'🦉',tag:'稳健'};

  const liveBestCards=open?(h?.analysis?.made?.cards||[]):(h?.best?.player?.cards||[]);
  const bestSet=new Set(liveBestCards);
  const dealerBestSet=new Set(h?.best?.dealer?.cards||[]);

  const actBtn=(move,label,{disabled=false,bet=undefined,primary=false,danger=false}={})=>
    `<button type="button" class="poker-act-btn ${primary?'primary':''} ${danger?'danger':''}" data-action="poker-act" data-move="${move}" ${bet!==undefined?`data-bet="${bet}"`:''} ${disabled?'disabled':''}>${label}</button>`;

  const supplyBtn=(move,label,{disabled=false,primary=false,coins=0}={})=>
    `<button type="button" class="btn ${primary?'':'secondary '}sm" data-action="poker-act" data-move="${move}" ${coins?`data-coins="${coins}"`:''} ${disabled?'disabled':''}>${label}</button>`;

  const dealerPills=`<div class="poker-dealers" role="group" aria-label="选择对手">${(t.dealers||[]).map(d=>{
    const current=d.id===(h?.dealerId||t.dealerId);
    const label=d.bonusPct?`${d.emoji} ${d.name}+${d.bonusPct}%`:`${d.emoji} ${d.name}`;
    return `<button type="button" class="dealer-pill ${current?'active':''}" data-action="poker-act" data-move="dealer" data-dealer="${esc(d.id)}" ${open||current?'disabled':''}>${esc(label)}</button>`;
  }).join('')}</div>`;

  let felt='';
  if(h){
    const freshIdx=open?(h.street==='turn'?3:h.street==='river'?4:-1):-1;
    const boardHtml=h.board.map((c,i)=>renderSvgCard(c,{highlight:bestSet.has(c),fresh:i===freshIdx})).join('')+
      Array.from({length:h.hiddenBoardCount||0},()=>renderSvgBack('✦')).join('');
    const playerCards=h.player.map(c=>renderSvgCard(c,{highlight:bestSet.has(c)})).join('');
    const dealerCards=open?`${renderSvgBack(activeDealer.emoji)}${renderSvgBack(activeDealer.emoji)}`:
      (h.dealer?h.dealer.map(c=>renderSvgCard(c,{highlight:dealerBestSet.has(c)})).join(''):`${renderSvgBack('弃')}${renderSvgBack('牌')}`);
    const madeName=open?(h.analysis?.made?.name||'高牌'):(h.best?.player?.name||h.analysis?.made?.name||'');
    const outcomeClass=h.outcome==='win'||h.outcome==='dealer_fold'?'win':h.outcome==='lose'||h.outcome==='fold'?'lose':'tie';
    const profitText=h.practice?'不计筹码':`${h.profit>0?'+'+h.profit:h.profit} 码`;
    const resultBanner=h.result?`<div class="poker-result-banner ${outcomeClass}">
      <strong>${esc(h.result)} · ${profitText}${h.foxBonus?` <em>(星狐+${h.foxBonus})</em>`:''}${h.milestoneBonus?` <em>(首通+${h.milestoneBonus})</em>`:''}</strong>
    </div>`:'';

    felt=`<section class="poker-felt clubhouse-felt">
      <div class="poker-seat dealer-seat">
        <div class="dealer-mini-tag">
          <strong>${esc(activeDealer.emoji)} ${esc(activeDealer.name)}</strong>
          <span>${esc(h.speech||'请出牌')}</span>
        </div>
        <div class="card-row">${dealerCards}</div>
      </div>
      <div class="board-zone">
        <span class="pot-pill">${h.practice?'试玩底池':'底池'} <strong>${h.pot}</strong></span>
        <div class="card-row board-cards">${boardHtml}</div>
      </div>
      ${resultBanner}
      <div class="poker-seat player-seat">
        <div class="card-row">${playerCards}</div>
        <div class="player-hand-pill">
          ${madeName?`<strong>${esc(madeName)}</strong>`:''}
          <span class="poker-coach-bar" role="status">${esc(microHint(h))}</span>
        </div>
      </div>
    </section>`;
  }else{
    const canEx=t.chips>=t.ticketCost&&t.earnedChips>=minWin&&t.exchangedToday<t.dailyTicketCap;
    const idleTip=canEx?'🎉 已达标，可点下方换免费抽奖':t.chips<2?'💡 可免费「试玩 0码」或用'+cname+'兑码':'7张自动挑最强5张 · 选底注发牌';
    felt=`<section class="poker-felt clubhouse-felt empty-felt">
      <div class="empty-cards-preview" aria-hidden="true">
        ${renderSvgCard('As')}${renderSvgCard('Kh')}${renderSvgBack(activeDealer.emoji)}
      </div>
      <p class="empty-felt-hint poker-coach-bar" role="status">${esc(idleTip)}</p>
    </section>`;
  }

  const unit=h?.stepUnit||h?.baseBet||2;
  const playControls=open?`<div class="poker-action-bar">
    ${actBtn('check',h.street==='river'?'亮牌':'过牌',{primary:true})}
    ${actBtn('bet',h.practice?'试玩加注':`加注 +${unit}`,{disabled:!h.practice&&t.chips<unit})}
    ${h.street==='river'?actBtn('double',h.practice?'试玩重注':`重注 +${unit*2}`,{disabled:!h.practice&&t.chips<unit*2}):''}
    ${actBtn('fold','弃牌',{danger:true})}
  </div>`:`<div class="poker-action-bar">
    ${actBtn('deal','试玩 0码',{bet:0,primary:t.chips<2})}
    ${[2,5,10].map((n,idx)=>
      actBtn('deal',`押 ${n} 发牌`,{disabled:t.chips<n,bet:n,primary:idx===0&&t.chips>=2&&t.chips<15||idx===1&&t.chips>=15})
    ).join('')}
  </div>`;

  const canExchange=!open&&t.chips>=t.ticketCost&&t.earnedChips>=minWin&&t.exchangedToday<t.dailyTicketCap;
  const compendiumUnlocked=(t.compendium||[]).filter(c=>c.unlocked).length;
  const compMap=new Map((t.compendium||[]).map(c=>[c.type,c]));

  return `<div class="poker-house-modal">
    <div class="poker-top-strip">
      <div class="poker-stat-pills">
        <span class="pstat">🪙 筹码 <strong>${t.chips}</strong></span>
        <span class="pstat highlight" title="需满 ${minWin} 净赢码方可兑券">📈 净赢 <strong>${t.earnedChips}/${minWin}</strong></span>
      </div>
      ${dealerPills}
    </div>
    ${felt}
    ${playControls}
    <div class="poker-supply-bar">
      ${supplyBtn('buy_chips',`🪙 10${cname}兑10码`,{coins:10,disabled:open||!t.canBuyChips,primary:!open&&t.chips<2&&t.canBuyChips})}
      ${supplyBtn('claim_task',t.canClaimTask?`✨ 打卡 +${t.taskBonusChips} 码`:(t.taskDone?'打卡码已领':`打卡送 +${t.taskBonusChips}`),{disabled:open||!t.canClaimTask,primary:!open&&t.canClaimTask})}
      ${supplyBtn('exchange',`🎟️ ${t.ticketCost}码换抽 (${t.exchangedToday}/${t.dailyTicketCap})`,{disabled:!canExchange,primary:canExchange})}
    </div>
    <details class="poker-compendium">
      <summary>? 玩法与牌型图 (${compendiumUnlocked}/9)</summary>
      <p class="compendium-brief">「试玩 0码」免费练手不计筹码；正式局可用${esc(cname)} 1:1 兑码，满 ${t.ticketCost} 码且对局净赢≥${minWin} 码可换 1 次抽奖。</p>
      <div class="hand-guide-list">
        ${HAND_GUIDE.map(g=>{
          const c=compMap.get(g.type)||{unlocked:false,bonus:0};
          return `<div class="hand-guide-row ${c.unlocked?'unlocked':''}">
            <strong>${c.unlocked?'✓ ':'◌ '}${esc(g.name)} ${c.bonus&&!c.unlocked?`<span class="set-pill">+${c.bonus}</span>`:''}</strong>
            <div class="hand-guide-cards" aria-hidden="true">${g.sample.map(card=>renderSvgCard(card,{mini:true})).join('')}</div>
          </div>`;
        }).join('')}
      </div>
    </details>
  </div>`;
}
