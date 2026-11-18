import {randomInt,randomUUID} from 'node:crypto';
import {requireThat} from './store.mjs';
import {COIN,dayAt} from './common.mjs';

export const RANKS='23456789TJQKA',SUITS='cdhs';
export const HAND_NAMES=['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
export const HAND_MILESTONES=[0,0,1,2,3,4,6,10,15];
export const BUY_CHIP_PACKS=[10,20];
export const TASK_BONUS_CHIPS=4;

export const DEALERS=[
  {id:'seal',name:'糯糯',emoji:'🦭',tag:'温和',bonusPct:0,desc:'温和陪练'},
  {id:'owl',name:'馆长',emoji:'🦉',tag:'稳健',bonusPct:0,desc:'稳健算牌'},
  {id:'fox',name:'星狐',emoji:'🦊',tag:'赢+20%',bonusPct:20,desc:'赢牌额外+20%'}
];

export function rankFive(cards){
  const ranks=cards.map(c=>RANKS.indexOf(c[0])+2).sort((a,b)=>b-a);
  const counts=new Map();
  for(const rank of ranks)counts.set(rank,(counts.get(rank)||0)+1);
  const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const flush=cards.every(c=>c[1]===cards[0][1]);
  const straight=counts.size===5?(ranks[0]-ranks[4]===4?ranks[0]:ranks.join(',')==='14,5,4,3,2'?5:0):0;
  const [first,second]=groups;
  let type=0,values=groups.map(g=>g[0]);
  if(straight&&flush){type=8;values=[straight];}
  else if(first[1]===4)type=7;
  else if(first[1]===3&&second[1]===2)type=6;
  else if(flush)type=5;
  else if(straight){type=4;values=[straight];}
  else if(first[1]===3)type=3;
  else if(first[1]===2)type=second[1]===2?2:1;
  let score=type;
  for(let i=0;i<5;i++)score=score*15+(values[i]||0);
  return {score,type,name:HAND_NAMES[type],cards};
}

export function bestHand(cards){
  if(cards.length===5)return rankFive(cards);
  let best=null;
  const n=cards.length;
  for(let a=0;a<n-4;a++)for(let b=a+1;b<n-3;b++)for(let c=b+1;c<n-2;c++)for(let d=c+1;d<n-1;d++)for(let e=d+1;e<n;e++){
    const hand=rankFive([cards[a],cards[b],cards[c],cards[d],cards[e]]);
    if(!best||hand.score>best.score)best=hand;
  }
  return best;
}

function hasStraight(rankSet){
  for(let hi=14;hi>=6;hi--){
    let ok=true;
    for(let d=0;d<5;d++)if(!rankSet.has(hi-d)){ok=false;break;}
    if(ok)return true;
  }
  return [14,5,4,3,2].every(r=>rankSet.has(r));
}

export function analyzeHand(hole,board){
  const visible=[...hole,...board];
  const made=bestHand(visible);
  const draws=[];
  if(board.length>=3&&board.length<5){
    const unseen=52-visible.length;
    if(made.type<5){
      const suitCounts={c:0,d:0,h:0,s:0};
      for(const c of visible)suitCounts[c[1]]++;
      if(Object.values(suitCounts).some(n=>n===4)){
        const pct=Math.round(9000/unseen)/10;
        draws.push({kind:'flush',label:'同花听牌',outs:9,nextPct:pct,hint:`差1张同花 ${pct}%`});
      }
    }
    if(made.type<4){
      const present=new Set(visible.map(c=>RANKS.indexOf(c[0])+2));
      let rankHits=0;
      for(let r=2;r<=14;r++){
        if(present.has(r))continue;
        const next=new Set(present);next.add(r);
        if(hasStraight(next))rankHits++;
      }
      if(rankHits>=1){
        const outs=rankHits*4,pct=Math.round(outs*1000/unseen)/10;
        const open=rankHits>=2;
        draws.push({kind:'straight',label:open?'顺子听牌':'卡顺听牌',outs,nextPct:pct,hint:`差1张顺子 ${pct}%`});
      }
    }
  }
  const tier=made.type>=6?'极强':made.type>=4?'强牌':made.type>=2?'好牌':made.type===1?'成对':draws.length?'听牌':'高牌';
  return {made,draws,tier};
}

function dealDeck(random=randomInt){
  const deck=Array.from(RANKS).flatMap(rank=>Array.from(SUITS,suit=>rank+suit));
  for(let i=0;i<9;i++){
    const j=i+random(deck.length-i);
    [deck[i],deck[j]]=[deck[j],deck[i]];
  }
  const aiRolls=[random(100),random(100),random(100)];
  return {player:deck.slice(0,2),dealer:deck.slice(2,4),board:deck.slice(4,9),aiRolls};
}

function dealerGreeting(dealerId,practice=false){
  if(practice)return '免费试玩局，放心练手~';
  if(dealerId==='seal')return '放轻松，请出牌~';
  if(dealerId==='fox')return '猜猜我是什么牌？';
  return '请看牌行动';
}

function decideDealerCall(hand,dealerId,street,addUnit){
  const visibleCount=street==='flop'?3:street==='turn'?4:5;
  const visibleBoard=hand.board.slice(0,visibleCount);
  const info=analyzeHand(hand.dealer,visibleBoard);
  const idx=street==='flop'?0:street==='turn'?1:2;
  const roll=(hand.aiRolls?.[idx]??50);
  const unit=hand.baseBet||2;
  const heavy=addUnit>unit;
  if(info.made.type>=2)return {call:true,line:dealerId==='fox'?'正合我意，跟注！':'牌面不错，跟注'};
  if(info.draws.length>0&&street!=='river'){
    const callChance=dealerId==='seal'?70:dealerId==='owl'?85:95;
    if(roll<callChance)return {call:true,line:'有听牌，跟注！'};
  }
  if(info.made.type===1){
    const pairRank=Math.floor(info.made.score/Math.pow(15,4))%15;
    const callChance=dealerId==='seal'?(heavy?45:72):dealerId==='owl'?(heavy?(pairRank>=10?68:35):82):(heavy?78:92);
    if(roll<callChance)return {call:true,line:'有一对，跟注'};
  }
  const aceHigh=hand.dealer.some(c=>c[0]==='A'||c[0]==='K');
  const bluffCatch=dealerId==='seal'?(aceHigh&&!heavy?22:10):dealerId==='owl'?(aceHigh&&!heavy&&street==='flop'?32:14):(heavy?28:(aceHigh?58:38));
  if(roll<bluffCatch)return {call:true,line:dealerId==='fox'?'想吓我？跟注！':'跟一手看看'};
  const foldLine=dealerId==='seal'?'加注好猛，让给你啦':dealerId==='fox'?'不硬碰，底池归你':'胜率不够，弃牌';
  return {call:false,line:foldLine};
}

export class Poker{
  constructor(store){this.s=store;}
  rawRow(space){
    return this.s.get('SELECT * FROM poker_tables WHERE space_id=?',space);
  }
  parseStats(row){
    const raw=JSON.parse(row?.stats||'{}');
    return {
      hands:raw.hands||0,
      wins:raw.wins||0,
      bestType:typeof raw.bestType==='number'?raw.bestType:-1,
      ranks:raw.ranks&&typeof raw.ranks==='object'?raw.ranks:{},
      netWon:Math.max(0,Number(raw.netWon??row?.earned_chips??0))
    };
  }
  taskDoneToday(space,day=dayAt()){
    return !!this.s.get('SELECT id FROM completions WHERE space_id=? AND day=? AND done=1 LIMIT 1',space,day);
  }
  ticketRules(settings){
    const ticketCost=Math.max(10,Number(settings.drawCost)||20);
    const minWinRequired=Math.max(4,Math.ceil(ticketCost*0.25));
    const dailyTicketCap=settings.pokerDailyTickets??1;
    return {ticketCost,minWinRequired,dailyTicketCap};
  }
  snapshot(space,row=this.rawRow(space)){
    const day=dayAt(),settings=this.s.settings(space);
    const {ticketCost,minWinRequired,dailyTicketCap}=this.ticketRules(settings);
    const chips=row?.chips||0;
    const stats=this.parseStats(row);
    const earnedChips=Math.min(chips,stats.netWon);
    const exchangedToday=row?.exchange_day===day?(row?.exchanged_today||0):0;
    const dealerId=DEALERS.some(d=>d.id===row?.dealer_id)?row.dealer_id:'owl';
    const dealer=DEALERS.find(d=>d.id===dealerId);
    const coinBalance=Math.max(0,Math.floor(this.s.balance(space)/COIN));
    const hasLoan=!!this.s.credit?.active?.(space);
    const rawHand=JSON.parse(row?.hand||'null');
    let hand=null;
    if(rawHand){
      const open=!rawHand.result;
      const visibleCount=open?(rawHand.street==='flop'?3:rawHand.street==='turn'?4:5):rawHand.boardVisible||5;
      const visibleBoard=rawHand.board.slice(0,visibleCount);
      const analysis=analyzeHand(rawHand.player,visibleBoard);
      hand={
        id:rawHand.id,
        practice:!!rawHand.practice,
        street:rawHand.street,
        baseBet:rawHand.baseBet,
        stepUnit:rawHand.practice?2:rawHand.baseBet,
        playerCommitted:rawHand.playerCommitted,
        dealerCommitted:rawHand.dealerCommitted,
        pot:rawHand.pot,
        dealerId:rawHand.dealerId||dealerId,
        player:rawHand.player,
        board:visibleBoard,
        hiddenBoardCount:Math.max(0,5-visibleBoard.length),
        dealer:open?null:rawHand.dealerShown||null,
        speech:rawHand.speech||'',
        result:rawHand.result||null,
        outcome:rawHand.outcome||null,
        profit:rawHand.profit??0,
        foxBonus:rawHand.foxBonus||0,
        milestoneBonus:rawHand.milestoneBonus||0,
        milestoneName:rawHand.milestoneName||'',
        best:rawHand.best||null,
        analysis
      };
    }
    const taskDone=this.taskDoneToday(space,day);
    return {
      enabled:settings.pokerEnabled!==false,
      coinName:settings.coinName||'学习币',
      coinBalance,
      canBuyChips:!hasLoan&&this.s.balance(space)>=BUY_CHIP_PACKS[0]*COIN,
      buyPacks:BUY_CHIP_PACKS,
      chips,
      earnedChips,
      minWinRequired,
      version:row?.version||0,
      taskDone,
      canClaimTask:taskDone&&row?.task_chip_day!==day,
      taskBonusChips:TASK_BONUS_CHIPS,
      ticketCost,
      exchangedToday,
      dailyTicketCap,
      dealerId,
      dealer,
      dealers:DEALERS,
      compendium:HAND_NAMES.map((name,type)=>({type,name,bonus:HAND_MILESTONES[type],count:stats.ranks[type]||0,unlocked:!!stats.ranks[type]})),
      stats:{hands:stats.hands,wins:stats.wins,bestType:stats.bestType},
      hand
    };
  }
  state(user,spaceId){
    const space=this.s.viewSpace(user,spaceId);
    return this.snapshot(space);
  }
  read(user,query={}){
    const space=this.s.viewSpace(user,query.space_id||query.space);
    return this.snapshot(space);
  }
  move(user,body,random=randomInt){
    const space=this.s.ownSpace(user,body),settings=this.s.settings(space),day=dayAt();
    requireThat(settings.pokerEnabled!==false,'这间小屋暂时收起了星光牌屋',403);
    const {ticketCost,minWinRequired,dailyTicketCap}=this.ticketRules(settings);
    this.s.run('INSERT OR IGNORE INTO poker_tables(space_id,chips,earned_chips,dealer_id,stats) VALUES(?,0,0,?,?)',space,'owl','{}');
    const row=this.rawRow(space);
    requireThat(body.version===row.version,'牌桌状态已更新，请重新确认',409);
    let chips=row.chips,claimDay=row.claim_day,taskDay=row.task_chip_day;
    let exchangeDay=row.exchange_day,exchangedToday=exchangeDay===day?(row.exchanged_today||0):0;
    let dealerId=DEALERS.some(d=>d.id===row.dealer_id)?row.dealer_id:'owl';
    let hand=JSON.parse(row.hand||'null');
    const stats=this.parseStats(row);
    let note='';

    const settleShowdown=()=>{
      const player=bestHand([...hand.player,...hand.board]);
      const dealer=bestHand([...hand.dealer,...hand.board]);
      const cmp=Math.sign(player.score-dealer.score);
      const isPractice=!!hand.practice;
      hand.street='ended';
      hand.boardVisible=5;
      hand.dealerShown=hand.dealer;
      hand.best={player,dealer};
      stats.hands++;
      if(player.type>stats.bestType)stats.bestType=player.type;
      let milestoneBonus=0,milestoneName='';
      if(!stats.ranks[player.type]){
        stats.ranks[player.type]=1;
        if(!isPractice&&HAND_MILESTONES[player.type]>0){
          milestoneBonus=HAND_MILESTONES[player.type];
          milestoneName=player.name;
        }
      }else{
        stats.ranks[player.type]++;
      }
      if(cmp>0){
        stats.wins++;
        const baseProfit=isPractice?0:(hand.pot-hand.playerCommitted);
        const dObj=DEALERS.find(d=>d.id===hand.dealerId)||DEALERS[1];
        const foxBonus=(!isPractice&&dObj.bonusPct)?Math.max(1,Math.ceil(baseProfit*dObj.bonusPct/100)):0;
        if(!isPractice){
          chips+=hand.pot+foxBonus+milestoneBonus;
          stats.netWon+=baseProfit+foxBonus+milestoneBonus;
        }
        hand.outcome='win';
        hand.profit=baseProfit;
        hand.foxBonus=foxBonus;
        hand.result=`${isPractice?'试玩获胜':'你赢啦'} · ${player.name}`;
        hand.speech=foxBonus?`好牌！额外送 +${foxBonus} 码`:`漂亮，${player.name}赢啦！`;
      }else if(cmp<0){
        if(!isPractice){
          chips+=milestoneBonus;
          stats.netWon=Math.max(0,stats.netWon-hand.playerCommitted+milestoneBonus);
        }
        hand.outcome='lose';
        hand.profit=isPractice?0:-hand.playerCommitted;
        hand.result=`${isPractice?'试玩惜败':'惜败'} · 对手${dealer.name}`;
        hand.speech=`我是${dealer.name}，下局加油`;
      }else{
        if(!isPractice){
          chips+=hand.playerCommitted+milestoneBonus;
          stats.netWon+=milestoneBonus;
        }
        hand.outcome='tie';
        hand.profit=0;
        hand.result=`平局 · 同为${player.name}`;
        hand.speech=isPractice?'试玩平局':'平局退回投入筹码';
      }
      hand.milestoneBonus=milestoneBonus;
      hand.milestoneName=milestoneName;
      delete hand.dealer;
      delete hand.aiRolls;
    };

    switch(body.move){
      case 'dealer':{
        requireThat(!hand||hand.result,'请先打完桌上这一手牌，再切换对手',409);
        requireThat(DEALERS.some(d=>d.id===body.dealer),'请选择有效的对局伙伴');
        dealerId=body.dealer;
        note='已切换对手';
        break;
      }
      case 'buy_chips':{
        requireThat(!hand||hand.result,'请先打完这一手牌，再兑换筹码',409);
        const amount=Number(body.coins);
        requireThat([10,20,50].includes(amount),'请选择有效的筹码兑换档位');
        this.s.credit.requireDraw(space);
        const cname=settings.coinName||'学习币';
        requireThat(this.s.balance(space)>=amount*COIN,`${cname}余额不足，先完成计划攒一点${cname}吧`);
        this.s.post(space,-amount*COIN,'poker_buy',`星光牌屋 · 兑换 ${amount} 筹码`,randomUUID());
        chips+=amount;
        note=`已用 ${amount} ${cname}兑换 ${amount} 筹码`;
        break;
      }
      case 'claim_task':{
        requireThat(this.taskDoneToday(space,day),'先在今日计划完成至少 1 项打卡，再来领打卡奖励码吧');
        requireThat(taskDay!==day,'今天的打卡奖励筹码已经领过啦',409);
        chips+=TASK_BONUS_CHIPS;
        taskDay=day;
        note=`打卡奖励 +${TASK_BONUS_CHIPS} 筹码`;
        break;
      }
      case 'deal':{
        requireThat(!hand||hand.result,'请先完成桌上的这局牌',409);
        const bet=Number(body.bet);
        requireThat([0,2,5,10].includes(bet),'请选择有效的底注');
        const practice=bet===0;
        if(!practice){
          requireThat(chips>=bet,`筹码不足，可先用${settings.coinName||'学习币'}兑换筹码或点「试玩 0码」`);
          chips-=bet;
        }
        const d=dealDeck(random);
        const unit=practice?2:bet;
        hand={
          id:randomUUID(),
          practice,
          street:'flop',
          baseBet:bet,
          playerCommitted:practice?0:bet,
          dealerCommitted:practice?0:bet,
          pot:practice?unit*2:bet*2,
          dealerId,
          player:d.player,
          dealer:d.dealer,
          board:d.board,
          aiRolls:d.aiRolls,
          speech:dealerGreeting(dealerId,practice)
        };
        break;
      }
      case 'check':{
        requireThat(hand&&!hand.result&&body.handId===hand.id,'这手牌已经结束或更换了',409);
        if(hand.street==='flop'){
          hand.street='turn';
          hand.speech='过牌 · 翻第 4 张';
        }else if(hand.street==='turn'){
          hand.street='river';
          hand.speech='过牌 · 翻第 5 张';
        }else{
          settleShowdown();
        }
        break;
      }
      case 'bet':
      case 'double':{
        requireThat(hand&&!hand.result&&body.handId===hand.id,'这手牌已经结束或更换了',409);
        if(body.move==='double')requireThat(hand.street==='river','河牌圈才能发起双倍重注哦');
        const isPractice=!!hand.practice;
        const unit=isPractice?2:hand.baseBet;
        const addUnit=body.move==='double'?unit*2:unit;
        if(!isPractice){
          requireThat(chips>=addUnit,'剩余筹码不够本次加注');
          chips-=addUnit;
          hand.playerCommitted+=addUnit;
        }
        hand.pot+=addUnit;
        const ai=decideDealerCall(hand,hand.dealerId,hand.street,addUnit);
        if(!ai.call){
          stats.hands++;
          stats.wins++;
          const baseProfit=isPractice?0:(hand.pot-hand.playerCommitted);
          const dObj=DEALERS.find(d=>d.id===hand.dealerId)||DEALERS[1];
          const foxBonus=(!isPractice&&dObj.bonusPct)?Math.max(1,Math.ceil(baseProfit*dObj.bonusPct/100)):0;
          if(!isPractice){
            chips+=hand.pot+foxBonus;
            stats.netWon+=baseProfit+foxBonus;
          }
          hand.boardVisible=hand.street==='flop'?3:hand.street==='turn'?4:5;
          hand.street='ended';
          hand.dealerShown=null;
          hand.outcome='dealer_fold';
          hand.profit=baseProfit;
          hand.foxBonus=foxBonus;
          hand.result=isPractice?'试玩获胜 · 对手弃牌':'对手弃牌 · 你赢啦';
          hand.speech=ai.line+(foxBonus?` (+${foxBonus}码)`:'');
          delete hand.dealer;
          delete hand.aiRolls;
        }else{
          if(!isPractice)hand.dealerCommitted+=addUnit;
          hand.pot+=addUnit;
          if(hand.street==='flop'){
            hand.street='turn';
            hand.speech=ai.line+' · 翻第 4 张';
          }else if(hand.street==='turn'){
            hand.street='river';
            hand.speech=ai.line+' · 翻第 5 张';
          }else{
            settleShowdown();
          }
        }
        break;
      }
      case 'fold':{
        requireThat(hand&&!hand.result&&body.handId===hand.id,'这手牌已经结束或更换了',409);
        stats.hands++;
        const isPractice=!!hand.practice;
        if(!isPractice)stats.netWon=Math.max(0,stats.netWon-hand.playerCommitted);
        hand.boardVisible=hand.street==='flop'?3:hand.street==='turn'?4:5;
        hand.street='ended';
        hand.dealerShown=null;
        hand.outcome='fold';
        hand.profit=isPractice?0:-hand.playerCommitted;
        hand.result=isPractice?'试玩弃牌':'已弃牌';
        hand.speech='稳住，下局再来';
        delete hand.dealer;
        delete hand.aiRolls;
        break;
      }
      case 'exchange':{
        requireThat(!hand||hand.result,'先把桌上的这手牌打完，再来兑换抽奖机会吧',409);
        requireThat(this.s.balance(space)>=0,'请先补足学习币待补余额，再兑换抽奖机会');
        requireThat(exchangedToday<dailyTicketCap,`今天已兑满 ${dailyTicketCap} 次抽奖机会，明天再来吧`);
        requireThat(chips>=ticketCost,`需要 ${ticketCost} 枚筹码才能换 1 次抽奖机会（当前 ${chips}/${ticketCost}）`);
        requireThat(stats.netWon>=minWinRequired,`还需在牌桌累计净赢满 ${minWinRequired} 枚筹码才能兑券（当前净赢 ${stats.netWon}/${minWinRequired}，避免直接买码套券）`);
        chips-=ticketCost;
        stats.netWon=Math.max(0,stats.netWon-minWinRequired);
        exchangeDay=day;
        exchangedToday++;
        const ref=randomUUID();
        this.s.postTickets(space,1,'poker_house','星光牌屋兑换 1 次抽奖机会',ref);
        this.s.community.audit(user,space,'poker.exchange','在星光牌屋兑换 1 次抽奖机会',{cost:ticketCost,minWinRequired,exchangedToday});
        note='成功兑换 1 次免费抽奖机会 🎟️';
        break;
      }
      default:
        requireThat(false,'请选择有效的牌桌操作');
    }

    const earnedNow=Math.min(chips,stats.netWon);
    this.s.run('UPDATE poker_tables SET chips=?,earned_chips=?,claim_day=?,task_chip_day=?,exchange_day=?,exchanged_today=?,dealer_id=?,hand=?,stats=?,version=version+1 WHERE space_id=?',
      chips,earnedNow,claimDay,taskDay,exchangeDay,exchangedToday,dealerId,JSON.stringify(hand),JSON.stringify(stats),space);
    return {ok:true,note,table:this.snapshot(space)};
  }
}
