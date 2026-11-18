import {randomInt,randomUUID} from 'node:crypto';
import {requireThat} from './store.mjs';
import {dayAt} from './common.mjs';

const RANKS='23456789TJQKA',SUITS='cdhs';
const names=['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺'];
const DAILY_CHIPS=30,TICKET_COST=20;
function rankFive(cards){
  const ranks=cards.map(c=>RANKS.indexOf(c[0])+2).sort((a,b)=>b-a);
  const counts=new Map();
  for(const rank of ranks)counts.set(rank,(counts.get(rank)||0)+1);
  const groups=[...counts].sort((a,b)=>b[1]-a[1]||b[0]-a[0]);
  const flush=cards.every(c=>c[1]===cards[0][1]);
  const straight=counts.size===5?(ranks[0]-ranks[4]===4?ranks[0]:ranks.join(',')==='14,5,4,3,2'?5:0):0;
  const [first,second]=groups;
  let type=0,values=groups.map(group=>group[0]);
  if(straight&&flush){type=8;values=[straight];}
  else if(first[1]===4)type=7;
  else if(first[1]===3&&second[1]===2)type=6;
  else if(flush)type=5;
  else if(straight){type=4;values=[straight];}
  else if(first[1]===3)type=3;
  else if(first[1]===2)type=second[1]===2?2:1;
  let score=type;
  for(let i=0;i<5;i++)score=score*15+(values[i]||0);
  return {score,name:names[type],cards};
}
export function bestHand(cards){
  let best;
  for(let a=0;a<6;a++)for(let b=a+1;b<7;b++){
    const hand=rankFive(cards.filter((_,i)=>i!==a&&i!==b));
    if(!best||hand.score>best.score)best=hand;
  }
  return best;
}
function deal(){
  const deck=Array.from(RANKS).flatMap(rank=>Array.from(SUITS,suit=>rank+suit));
  for(let i=0;i<9;i++){const j=i+randomInt(deck.length-i);[deck[i],deck[j]]=[deck[j],deck[i]];}
  return {player:deck.slice(0,2),dealer:deck.slice(2,4),board:deck.slice(4,9)};
}
export class PokerPreview{
  constructor(store){
    this.s=store;
    store.db.exec(`CREATE TABLE IF NOT EXISTS preview_poker (
      space_id TEXT PRIMARY KEY REFERENCES spaces(id), chips INTEGER NOT NULL CHECK(chips>=0),
      claim_day TEXT, hand TEXT, version INTEGER NOT NULL DEFAULT 0)`);
  }
  snapshot(row){
    const hand=JSON.parse(row?.hand||'null');
    if(hand&&!hand.result){
      delete hand.dealer;
      hand.board=hand.board.slice(0,3);
    }
    return {chips:row?.chips||0,version:row?.version||0,canClaim:row?.claim_day!==dayAt(),
      hand,dailyChips:DAILY_CHIPS,ticketCost:TICKET_COST};
  }
  read(user,body){
    const space=this.s.ownSpace(user,body);
    return this.snapshot(this.s.get('SELECT * FROM preview_poker WHERE space_id=?',space));
  }
  move(user,body){
    const space=this.s.ownSpace(user,body);
    this.s.run('INSERT OR IGNORE INTO preview_poker(space_id,chips) VALUES(?,0)',space);
    const row=this.s.get('SELECT * FROM preview_poker WHERE space_id=?',space);
    requireThat(body.version===row.version,'牌桌已更新，请重新打开查看',409);
    let chips=row.chips,day=row.claim_day,hand=JSON.parse(row.hand||'null');
    switch(body.move){
      case 'claim':
        requireThat(day!==dayAt(),'今天的体验筹码已领过',409);
        chips+=DAILY_CHIPS;day=dayAt();break;
      case 'deal':
        requireThat(!hand||hand.result,'请先完成桌上的这局牌',409);
        requireThat([2,5,10].includes(body.bet)&&chips>=body.bet,'请选择余额足够的底注');
        chips-=body.bet;
        hand={...deal(),id:randomUUID(),stake:body.bet};
        break;
      case 'show': case 'raise': case 'fold': {
        requireThat(hand&&!hand.result&&body.handId===hand.id,'这手牌已经结束或更换了',409);
        if(body.move==='fold'){hand.result='弃牌';hand.profit=-hand.stake;break;}
        if(body.move==='raise'){
          requireThat(chips>=hand.stake,'剩余筹码不够加倍');
          chips-=hand.stake;hand.stake*=2;
        }
        const player=bestHand([...hand.player,...hand.board]),dealer=bestHand([...hand.dealer,...hand.board]);
        const comparison=Math.sign(player.score-dealer.score);
        hand.result=comparison>0?'你赢了':comparison<0?'系统获胜':'平局';
        hand.best={player,dealer};hand.profit=comparison*hand.stake;
        chips+=(comparison+1)*hand.stake;
        break;
      }
      case 'exchange':
        requireThat(chips>=TICKET_COST,'筹码还不足以兑换');
        chips-=TICKET_COST;
        this.s.postTickets(space,1,'poker_preview','牌桌筹码兑换 1 次抽奖机会',randomUUID());
        break;
      default:requireThat(false,'请选择有效的牌桌操作');
    }
    this.s.run('UPDATE preview_poker SET chips=?,claim_day=?,hand=?,version=version+1 WHERE space_id=?',chips,day,JSON.stringify(hand),space);
    return {ok:true,table:this.read(user,body)};
  }
}
