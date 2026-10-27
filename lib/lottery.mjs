import {randomInt} from 'node:crypto';
import {hash,id,now,requireThat,integer} from './store.mjs';
import {COIN} from './common.mjs';

export const LOTTERY_TEMPLATES=[
  {title:'小屋新招牌',emoji:'🏡',effect:'room_rename',bps:1500,stock:15,cost:20,description:'给小屋改一次名字，挂上喜欢的新招牌。'},
  {title:'换个心情 · 一日卡',emoji:'🎨',effect:'day_theme',bps:2400,stock:24,cost:100,description:'奶油、莓果、晴空，选一种小屋配色体验 24 小时。只改变你自己的界面。'},
  {title:'好运续杯',emoji:'🎟️',effect:'extra_draw',bps:2000,stock:20,cost:100,description:'抽中后存入 1 次免费机会，想用时再抽，不会自动连抽。'},
  {title:'灵感小火苗',emoji:'🕯️',category:'study',face_cents:500,bps:800,stock:5,cost:25,description:'AI 工具、API 或学习用品的 ¥5 报销额度。'},
  {title:'偷偷心愿卡',emoji:'🐈',effect:'shop_drop',bps:200,stock:1,cost:500,description:'从商城随机掉落一张在售、有库存的报销卡；学习币价格越低，掉落概率越高。'},
  {title:'快乐大礼包',emoji:'🕹️',category:'play',face_cents:50000,bps:10,stock:1,cost:10000,description:'游戏或玩具的 ¥500 报销额度，把小期待变成大快乐。'}
].map((p,i)=>({category:'custom',face_cents:0,effect:'',tone:['sky','lilac','yellow','mint','peach','sky'][i],tier:'抽奖限定',wait_days:0,active:true,channel:'lottery',template_id:'lucky-'+(i+1),...p}));

// Price, not face value or remaining stock, sets the per-item drop probability.
export function inversePrices(items){
  const sum=items.reduce((n,p)=>n+1/p.cost,0);
  return items.map(p=>({...p,probability:(1/p.cost)/sum}));
}
export class Lottery {
  constructor(store){this.s=store;}
  record(space,cents,kind,ref){
    integer(cents,0,100_000_000,'新增额度');if(!cents)return;
    this.s.run('INSERT INTO lottery_costs VALUES(?,?,?,?,?,?)',id(),this.s.rewardSpaceId(space),cents,kind,ref,now());
  }
  dropPool(space){return inversePrices(this.s.all("SELECT * FROM prizes WHERE room_id=? AND channel='shop' AND removed=0 AND active=1 AND stock>0 AND effect='' AND face_cents>0 ORDER BY id",this.s.rewardSpaceId(space)));}
  report(space,pool=this.s.pool(space)){
    const drops=this.dropPool(space),dropMean=drops.reduce((n,p)=>n+p.probability*p.face_cents,0),dropMax=Math.max(0,...drops.map(p=>p.face_cents));
    let direct=0,replay=0,maximum=0,stockExposure=0;const unavailable=[];
    for(const p of pool.filter(p=>p.id)){
      const liability=p.effect==='shop_drop'?dropMax:p.face_cents||0;maximum=Math.max(maximum,liability);stockExposure+=p.stock*liability;
      if(p.effect==='extra_draw')replay+=p.probability;
      if(p.effect==='shop_drop'){
        if(!drops.length)unavailable.push(p.title);
        direct+=p.probability*dropMean;
      }else direct+=p.probability*(p.face_cents||0);
      if(!p.effect&&!p.face_cents)unavailable.push(p.title);
    }
    const blocked=pool.length<2?'奖池还在准备中':unavailable.length?'请发奖人补齐奖品额度，或为偷偷卡准备商城报销卡':replay>.25?'续杯概率超过 25%，请发奖人调整':'';
    const costs=this.s.all('SELECT kind,SUM(cents) cents FROM lottery_costs WHERE room_id=? GROUP BY kind',this.s.rewardSpaceId(space));
    return {direct_cents:direct,return_probability:replay,chain_cents:replay<1?direct/(1-replay):null,maximum_cents:maximum,stock_exposure_cents:stockExposure,drop_mean_cents:dropMean,drop_max_cents:dropMax,issued_cents:costs.reduce((n,c)=>n+c.cents,0),merge_cents:costs.find(c=>c.kind==='merge')?.cents||0,blocked};
  }
  copy(user,body){
    const room=this.s.admin(user,body.space_id),p=this.s.get('SELECT * FROM prizes WHERE id=? AND room_id=? AND removed=0',body.prize_id,room);
    requireThat(p,'这张奖励不在当前小屋',404);const channel=p.channel==='shop'?'lottery':'shop';
    requireThat(channel==='lottery'||!['shop_drop','extra_draw'].includes(p.effect),'续杯和偷偷卡仅在抽奖中提供');
    const result=this.s.savePrize(user,{...p,id:undefined,space_id:room,channel,cost:p.cost/COIN,stock:integer(body.stock,1,10000,'新奖池库存'),weight:0});
    return {...result,copied:p.title,channel};
  }
  defaults(user,body){
    const room=this.s.admin(user,body.space_id),config=this.s.oddsConfig(room);
    requireThat(body.version===config.version,'奖池刚刚有变化，请刷新后再设置',409);
    this.s.run("UPDATE prizes SET removed=1 WHERE room_id=? AND channel='lottery'",room);
    const settings={...this.s.settings(room),fixedOdds:true,blankWeight:3090};
    this.s.run('INSERT INTO room_settings VALUES(?,?) ON CONFLICT(space_id) DO UPDATE SET value=excluded.value',room,JSON.stringify(settings));
    for(const t of LOTTERY_TEMPLATES){
      const result=this.s.savePrize(user,{...t,space_id:room});
      this.s.run('UPDATE prizes SET weight=?,template_id=? WHERE id=?',t.bps,t.template_id,result.id);
    }
    return {ok:true,count:LOTTERY_TEMPLATES.length};
  }
  award(user,prize,space){
    this.record(space,prize.face_cents||0,'draw',prize.id);
    const card=this.s.issue(user,prize,'draw');
    this.s.run('UPDATE cards SET lottery_funded=1 WHERE id=?',card.id);card.lottery_funded=1;
    if(prize.effect==='extra_draw'){
      this.s.postTickets(space,1,'extra_draw','好运续杯 · 存入 1 次免费机会',card.id);
      this.s.run("UPDATE cards SET status='used',delivery_note=? WHERE id=?",'已存入 1 次免费机会',card.id);
      card.status='used';card.delivery_note='已存入 1 次免费机会';
    }
    return card;
  }
  ready(user,body){
    const space=this.s.ownSpace(user,body),card=this.s.get('SELECT * FROM cards WHERE id=? AND user_id=? AND space_id=?',body.card_id,user.id,space);
    requireThat(card,'这张卡不在你的当前小屋里',404);requireThat(card.status==='ready','这张卡已经用过啦',409);
    requireThat(Date.parse(card.available)<=Date.now(),'还没到这张卡的使用时间');requireThat(this.s.balance(space)>=0,'先补足学习币待补余额吧');
    return {space,card};
  }
  inspectDrop(user,body){
    const {space,card}=this.ready(user,body);requireThat(card.effect==='shop_drop','请选择偷偷心愿卡');
    const pool=this.dropPool(space);
    return {ok:true,pool,version:hash(JSON.stringify([card.id,pool]))};
  }
  use(user,body,random=randomInt){
    const {space,card}=this.ready(user,body);let result={ok:true},note='';
    if(card.effect==='day_theme'){
      requireThat(['cream','berry','sky'].includes(body.theme),'选一种喜欢的配色吧');
      const expires=new Date(Date.now()+86400_000).toISOString();
      this.s.run('INSERT INTO room_themes VALUES(?,?,?) ON CONFLICT(space_id) DO UPDATE SET theme=excluded.theme,expires=excluded.expires',space,body.theme,expires);
      note='配色体验至 '+expires;result.theme={theme:body.theme,expires};
    }else if(card.effect==='shop_drop'){
      const {pool,version}=this.inspectDrop(user,body);requireThat(pool.length,'商城暂时没有符合额度的报销卡，这张偷偷卡先留好',409);
      requireThat(body.version===version,'掉落清单或价格刚刚变了，请重新查看概率',409);
      // Secure integer randomness mapped onto the inverse-price CDF; no user-supplied RNG.
      const draw=random(2**48-1)/(2**48-1);let cumulative=0,chosen=pool.at(-1);
      for(const p of pool){cumulative+=p.probability;if(draw<cumulative){chosen=p;break;}}
      result.card=this.s.issue(user,chosen,'shop_drop');this.record(space,chosen.face_cents,'shop_drop',card.id);
      this.s.run('UPDATE cards SET lottery_funded=1 WHERE id=?',result.card.id);result.card.lottery_funded=1;
      note='掉落 · '+chosen.title;result.dropOdds=pool.map(p=>({id:p.id,title:p.title,probability:p.probability}));
    }else requireThat(false,'这张功能卡请从对应入口使用');
    this.s.run("UPDATE cards SET status='used',delivery_note=? WHERE id=?",note,card.id);
    return {...result,usedCard:card.title};
  }
  theme(space){return this.s.get('SELECT theme,expires FROM room_themes WHERE space_id=? AND expires>?',space,now())||null;}
}
