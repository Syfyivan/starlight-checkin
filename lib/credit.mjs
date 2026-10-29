import {COIN,dayAt} from './common.mjs';
import {id,now,hash,integer,string,requireThat} from './store.mjs';

const DAY=86400000;
export const DEFAULT_CREDIT_RULES=Object.freeze({enabled:false,limitCoins:300,annualBps:600});
const dayStart=day=>Date.parse(day+'T00:00:00+08:00');
const daysBetween=(a,b)=>Math.round((dayStart(b)-dayStart(a))/DAY);
const addDays=(day,n)=>dayAt(dayStart(day)+n*DAY);
// Actual/365, Shanghai calendar days. Round only each cumulative amount to a micro-coin.
export const creditInterest=(principal,annualBps,days)=>Number(BigInt(principal)*BigInt(annualBps)*BigInt(days)/(10000n*365n));

export class Credit {
  constructor(store,{clock=Date.now}={}){this.s=store;this.clock=clock;}
  today(){return dayAt(this.clock());}
  supported(space){const r=this.s.get('SELECT giver_id,family_id FROM spaces WHERE id=?',space);return !!(r?.giver_id||r?.family_id);}
  rules(space){const r=this.s.get('SELECT value FROM credit_rules WHERE space_id=?',this.s.rewardSpaceId(space));const value={...DEFAULT_CREDIT_RULES,...(r?JSON.parse(r.value):{})};return {...value,version:hash(JSON.stringify(value))};}
  active(space){return this.s.get("SELECT * FROM credit_contracts WHERE space_id=? AND status='active'",space);}
  requireSettled(spaces,message='还有学习币借款或分期未结清，请先还清，或请发奖人商量减免'){requireThat(!spaces.some(space=>this.active(space)),message,409);}
  requireSpend(space){const c=this.active(space);requireThat(!c||!this.contract(c).overdue,'先处理逾期账单，再继续逛商城吧；完成任务和还款仍然可用',409);}
  requireDraw(space){requireThat(!this.active(space),'借款或分期还未结清，先暂停学习币抽奖；免费机会仍可使用',409);}
  saveRules(user,b){
    const space=this.s.viewSpace(user,b.space_id);requireThat(this.supported(space),'借贷体验需要有发奖人的小屋或家庭，个人空间暂不开放',403);
    const pool=this.s.admin(user,space),old=this.rules(space);requireThat(b.expectedVersion===old.version,'借贷规则刚有调整，刷新后再保存吧',409);
    requireThat(typeof b.enabled==='boolean','选择是否开放模拟借贷');const rules={enabled:b.enabled,limitCoins:integer(b.limitCoins,1,100000,'每人额度'),annualBps:integer(b.annualBps,0,1200,'年化利率（基点）')};
    this.s.run('INSERT INTO credit_rules VALUES(?,?,?,?) ON CONFLICT(space_id) DO UPDATE SET value=excluded.value,updated_by=excluded.updated_by,updated=excluded.updated',pool,JSON.stringify(rules),user.id,now());
    this.s.community.audit(user,space,'credit.rules','调整学习币借贷规则',{before:old,after:rules});return {ok:true,rules:this.rules(space)};
  }
  borrowingReason(space){
    const room=this.s.get('SELECT * FROM spaces WHERE id=?',space),rules=this.rules(space);
    if(!this.supported(space))return '借贷体验需要有发奖人的小屋或家庭';
    if(room.status!=='active')return '这间小屋已经收起来啦';
    if(!this.s.familyPlay.eligible(space))return '家长发奖家庭的管家不参与借款领奖';
    if(!rules.enabled)return '发奖人还没有开放借贷体验';
    if(this.active(space))return '先还清当前这一笔，再考虑新的心愿吧';
    if(this.s.community.pendingClose(space))return '小屋正在商量关闭，先等伙伴们决定吧';
    if(this.s.balance(space)<0)return '先补足待补余额，再来体验借贷吧';
    return '';
  }
  requireBorrower(user,b){const space=this.s.ownSpace(user,b),reason=this.borrowingReason(space);requireThat(!reason,reason,409);return space;}
  prize(space,prizeId){
    const p=this.s.get("SELECT * FROM prizes WHERE id=? AND room_id=? AND channel='shop' AND reward_scope='individual' AND removed=0 AND active=1 AND stock>0",prizeId,this.s.rewardSpaceId(space));
    requireThat(p&&!p.effect,'分期只支持当前小屋在售的个人报销卡或约定体验，功能卡与共同奖励暂不支持',404);return p;
  }
  prizeVersion(p){return p?hash(JSON.stringify([p.id,p.room_id,p.title,p.description,p.emoji,p.tone,p.category,p.face_cents,p.tier,p.cost,p.stock,p.active,p.removed,p.channel,p.reward_scope,p.effect,p.wait_days])):'';}
  schedule(principal,annualBps,kind,termDays,periods,start){
    const count=kind==='loan'?1:periods,interval=kind==='loan'?termDays:7,part=Math.floor(principal/count);
    return Array.from({length:count},(_,i)=>{const basis=principal-part*i;return {number:i+1,startsOn:addDays(start,i*interval),dueAt:addDays(start,(i+1)*interval),basis,principal:i===count-1?basis:part,interest:creditInterest(basis,annualBps,interval)};});
  }
  preview(user,b){
    const space=this.requireBorrower(user,b),rules=this.rules(space);requireThat(['loan','installment'].includes(b.kind),'选择借款或商城分期');
    const p=b.kind==='installment'?this.prize(space,string(b.prize_id,'奖品编号',100)):null;
    const principal=p?p.cost:integer(b.amountCoins,1,rules.limitCoins,'借款学习币')*COIN;
    requireThat(principal<=rules.limitCoins*COIN,'这份心愿超过了小屋开放的借贷额度');
    const termDays=b.kind==='loan'?integer(b.termDays,7,30,'借款天数'):0,periods=b.kind==='installment'?integer(b.periods,3,6,'分期期数'):1;
    requireThat(b.kind!=='loan'||[7,14,30].includes(termDays),'借款可以选 7、14 或 30 天');requireThat(b.kind!=='installment'||[3,6].includes(periods),'分期可以选 3 或 6 期，每周一期');
    const today=this.today(),installments=this.schedule(principal,rules.annualBps,b.kind,termDays,periods,today),maxInterest=installments.reduce((n,r)=>n+r.interest,0);
    const quote={id:id(),expiresAt:this.clock()+5*60000,kind:b.kind,principal,annualBps:rules.annualBps,termDays,periods,periodDays:b.kind==='installment'?7:termDays,maxInterest,totalMax:principal+maxInterest,startedAt:today,maturityAt:installments.at(-1).dueAt,installments,prizeId:p?.id||null,prizeTitle:p?.title||''};
    this.s.run('DELETE FROM credit_quotes WHERE expires<?',this.clock()-DAY);
    this.s.run('INSERT INTO credit_quotes VALUES(?,?,?,?,?,?,?,?,?,?)',quote.id,space,user.id,JSON.stringify(quote),rules.version,this.prizeVersion(p),today,quote.expiresAt,null,now());
    return {ok:true,quote};
  }
  accept(user,b){
    const space=this.requireBorrower(user,b),q=this.s.get('SELECT * FROM credit_quotes WHERE id=? AND space_id=? AND user_id=?',string(b.quote_id,'报价编号',100),space,user.id);
    requireThat(q&&!q.consumed&&q.expires>this.clock()&&q.quoted_day===this.today(),'这份报价已过期或用过啦，请重新预览',409);
    requireThat(q.rules_version===this.rules(space).version,'借贷规则刚有变化，请重新预览合同',409);const terms=JSON.parse(q.terms),p=terms.kind==='installment'?this.prize(space,terms.prizeId):null;
    requireThat(q.prize_version===this.prizeVersion(p),'奖品价格、库存或内容刚有变化，请重新预览',409);
    const cid=id();this.s.run('INSERT INTO credit_contracts(id,space_id,user_id,quote_id,kind,principal,annual_bps,started_on,maturity_on,max_interest,prize_id,prize_title,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',cid,space,user.id,q.id,terms.kind,terms.principal,terms.annualBps,terms.startedAt,terms.maturityAt,terms.maxInterest,p?.id||null,p?.title||'',now());
    for(const r of terms.installments)this.s.run('INSERT INTO credit_installments(contract_id,number,starts_on,due_on,basis,principal,interest) VALUES(?,?,?,?,?,?,?)',cid,r.number,r.startsOn,r.dueAt,r.basis,r.principal,r.interest);
    this.s.post(space,terms.principal,'credit_disbursement',terms.kind==='loan'?'学习币借款到账':'商城分期本金',cid);
    let card=null;if(p){card=this.s.issue(user,p,'installment');this.s.post(space,-p.cost,'shop',`分期兑换 · ${p.title}`,card.id);this.s.run('UPDATE credit_contracts SET card_id=? WHERE id=?',card.id,cid);this.s.run('DELETE FROM wish_goals WHERE space_id=? AND prize_id=?',space,p.id);}
    this.s.run('UPDATE credit_quotes SET consumed=? WHERE id=?',cid,q.id);
    this.s.community.audit(user,space,'credit.accept',terms.kind==='loan'?'确认学习币借款':'分期兑换 · '+p.title,{contract_id:cid,kind:terms.kind,principal:terms.principal/COIN,annualBps:terms.annualBps,maxInterest:terms.maxInterest/COIN,maturityAt:terms.maturityAt,card_id:card?.id||null});
    return {ok:true,contract:this.contract(this.active(space),user),card};
  }
  contract(c,user){
    if(!c)return null;const day=c.closed_on||this.today(),active=c.status==='active',rows=this.s.all('SELECT * FROM credit_installments WHERE contract_id=? ORDER BY number',c.id);
    const installments=rows.map(r=>{
      const accrued=creditInterest(r.basis,c.annual_bps,Math.max(0,Math.min(daysBetween(r.starts_on,day),daysBetween(r.starts_on,r.due_on))));
      const remaining=active?r.principal-r.paid_principal+r.interest-r.paid_interest:0;
      return {number:r.number,startsOn:r.starts_on,dueAt:r.due_on,principal:r.principal,interest:r.interest,accruedInterest:accrued,paidPrincipal:r.paid_principal,paidInterest:r.paid_interest,remaining,dueNow:active&&r.due_on<=day&&remaining>0,overdue:active&&r.due_on<day&&remaining>0,paid:remaining===0};
    });
    const paidPrincipal=rows.reduce((n,r)=>n+r.paid_principal,0),paidInterest=rows.reduce((n,r)=>n+r.paid_interest,0),accrued=installments.reduce((n,r)=>n+r.accruedInterest,0),principalRemaining=active?c.principal-paidPrincipal:0,interestRemaining=active?Math.max(0,accrued-paidInterest):0;
    return {id:c.id,kind:c.kind,status:c.status,principal:c.principal,annualBps:c.annual_bps,startedAt:c.started_on,maturityAt:c.maturity_on,periods:rows.length,periodDays:c.kind==='installment'?7:daysBetween(c.started_on,c.maturity_on),maxInterest:c.max_interest,totalMax:c.principal+c.max_interest,principalRemaining,interestAccrued:accrued,interestRemaining,payoffAmount:principalRemaining+interestRemaining,dueAmount:installments.filter(r=>r.dueNow).reduce((n,r)=>n+r.remaining,0),overdue:installments.some(r=>r.overdue),installments,paidPrincipal,paidInterest,waivedPrincipal:c.waived_principal,waivedInterest:c.waived_interest,futureInterestSaved:c.future_interest_saved,prizeId:c.prize_id,prizeTitle:c.prize_title,cardId:c.card_id,closedAt:c.closed_on,canWaive:!!user&&active&&user.id!==c.user_id&&this.s.canManage(user,c.space_id,{closed:true}),version:hash(JSON.stringify([c.id,c.status,day,rows.map(r=>[r.number,r.paid_principal,r.paid_interest]),this.s.balance(c.space_id)]))};
  }
  repay(user,b){
    const space=this.s.ownSpace(user,b,{closed:true}),c=this.s.get("SELECT * FROM credit_contracts WHERE id=? AND space_id=? AND user_id=? AND status='active'",string(b.contract_id,'合同编号',100),space,user.id);requireThat(c,'这笔借款已结清，或不属于当前小屋',404);
    const current=this.contract(c,user);requireThat(b.expectedVersion===current.version,'账单或余额刚有变化，请刷新后重新确认',409);requireThat(['due','payoff'].includes(b.mode),'选择偿还到期账单或提前结清');
    const balance=Math.max(0,this.s.balance(space)),wanted=b.mode==='due'?current.dueAmount:current.payoffAmount;requireThat(wanted>0,b.mode==='due'?'还没有到期账单，可以选择提前结清':'这笔借款已经还清啦',409);
    if(b.mode==='payoff')requireThat(balance>=wanted,'学习币还不够一次结清；到期后也可以先偿还一部分');const amount=Math.min(balance,wanted);requireThat(amount>0,'还没有可用于还款的学习币，先完成一些计划吧');
    let left=amount,principal=0,interest=0;const allocation=[];
    for(const r of current.installments){
      if(b.mode==='due'&&!r.dueNow)continue;
      const payInterest=Math.min(left,Math.max(0,(b.mode==='due'?r.interest:r.accruedInterest)-r.paidInterest));left-=payInterest;
      const payPrincipal=Math.min(left,r.principal-r.paidPrincipal);left-=payPrincipal;
      if(payInterest||payPrincipal){this.s.run('UPDATE credit_installments SET paid_principal=paid_principal+?,paid_interest=paid_interest+? WHERE contract_id=? AND number=?',payPrincipal,payInterest,c.id,r.number);allocation.push({number:r.number,principal:payPrincipal,interest:payInterest});principal+=payPrincipal;interest+=payInterest;}
    }
    requireThat(left===0,'还款金额计算未完成，请重新打开账单',409);const pid=id();this.s.post(space,-amount,'credit_repayment',b.mode==='payoff'?'提前结清学习币账单':'偿还到期学习币账单',pid);
    this.s.run('INSERT INTO credit_payments VALUES(?,?,?,?,?,?,?,?,?,?)',pid,c.id,space,user.id,b.mode,principal,interest,JSON.stringify(allocation),'',now());
    const totals=this.s.get('SELECT SUM(principal-paid_principal) principal,SUM(interest-paid_interest) interest FROM credit_installments WHERE contract_id=?',c.id);
    if(b.mode==='payoff'||totals.principal+totals.interest===0)this.s.run("UPDATE credit_contracts SET status='paid',future_interest_saved=?,closed_on=?,closed=? WHERE id=?",b.mode==='payoff'?totals.interest:0,this.today(),now(),c.id);
    this.s.community.audit(user,space,'credit.repay',b.mode==='payoff'?'提前结清学习币账单':'偿还到期学习币账单',{contract_id:c.id,payment_id:pid,principal:principal/COIN,interest:interest/COIN,partial:amount<wanted});
    return {ok:true,paid:amount,principal,interest,partial:amount<wanted,contract:this.contract(this.s.get('SELECT * FROM credit_contracts WHERE id=?',c.id),user)};
  }
  waive(user,b){
    const space=this.s.viewSpace(user,b.space_id);this.s.admin(user,space,{closed:true});const c=this.s.get("SELECT * FROM credit_contracts WHERE id=? AND space_id=? AND status='active'",string(b.contract_id,'合同编号',100),space);requireThat(c,'这笔借款已结清，或不属于当前小屋',404);
    requireThat(c.user_id!==user.id,'自己的借款需要另一位奖品管家帮忙商量，不能给自己减免',403);
    const current=this.contract(c,user);requireThat(b.expectedVersion===current.version,'账单或余额刚有变化，请刷新后再确认',409);const reason=string(b.reason,'减免说明',300),future=Math.max(0,c.max_interest-current.interestAccrued);
    this.s.run("UPDATE credit_contracts SET status='waived',waived_principal=?,waived_interest=?,future_interest_saved=?,closed_on=?,closed=? WHERE id=?",current.principalRemaining,current.interestRemaining,future,this.today(),now(),c.id);
    const pid=id();this.s.run('INSERT INTO credit_payments VALUES(?,?,?,?,?,?,?,?,?,?)',pid,c.id,space,user.id,'waive',current.principalRemaining,current.interestRemaining,'[]',reason,now());
    this.s.community.audit(user,space,'credit.waive','发奖人减免学习币账单',{contract_id:c.id,principal:current.principalRemaining/COIN,interest:current.interestRemaining/COIN,futureInterestSaved:future/COIN,reason});
    const room=this.s.get('SELECT * FROM spaces WHERE id=?',space),related=new Set([room.learner_id,...(room.family_id?this.s.all('SELECT user_id FROM family_members WHERE family_id=? AND is_admin=1',room.family_id).map(r=>r.user_id):[room.giver_id])]);
    for(const recipient of related)if(recipient)this.s.community.notice(user,recipient,'学习币账单已减免',`${user.name} 已减免这笔未还本金和已发生利息，未来利息也不再收取。说明：${reason}`);
    return {ok:true,contract:this.contract(this.s.get('SELECT * FROM credit_contracts WHERE id=?',c.id),user)};
  }
  state(user,space){
    space=this.s.viewSpace(user,space);const owner=this.s.get('SELECT learner_id FROM spaces WHERE id=?',space).learner_id,canManage=this.s.canManage(user,space,{closed:true});if(owner!==user.id&&!canManage)return null;
    const supported=this.supported(space),reason=this.borrowingReason(space);return {supported,canBorrow:owner===user.id&&!reason,reason,rules:this.rules(space),canManage:canManage&&supported,contract:this.contract(this.active(space),user),history:this.s.all("SELECT * FROM credit_contracts WHERE space_id=? AND status<>'active' ORDER BY created DESC,id LIMIT 10",space).map(c=>this.contract(c,user))};
  }
}
