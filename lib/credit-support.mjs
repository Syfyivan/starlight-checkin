import {COIN,dayAt} from './common.mjs';
import {id,now,hash,integer,string,requireThat} from './store.mjs';
const DAY=86400000,addDays=(day,n)=>dayAt(Date.parse(day+'T00:00:00+08:00')+n*DAY);
export const CREDIT_PERIODS=[3,6,12,24,36];

export class CreditSupport {
 constructor(credit){this.c=credit;this.s=credit.s;}
 agreement(cid){return JSON.parse(this.s.get('SELECT value FROM credit_agreements WHERE contract_id=?',cid)?.value||'null');}
 saveAgreement(cid,value){this.s.run('INSERT INTO credit_agreements VALUES(?,?) ON CONFLICT(contract_id) DO UPDATE SET value=excluded.value',cid,JSON.stringify(value));}
 recovery(cid){const r=this.s.get("SELECT * FROM credit_recoveries WHERE contract_id=? AND status='accepted' ORDER BY rowid DESC LIMIT 1",cid);return r?{...r,data:JSON.parse(r.value)}:null;}
 rows(c){return this.recovery(c.id)?.data.rows||this.s.all('SELECT * FROM credit_installments WHERE contract_id=? ORDER BY number',c.id);}
 pay(c,number,principal,interest){const r=this.recovery(c.id);if(r){const row=r.data.rows.find(x=>x.number===number);row.paid_principal+=principal;row.paid_interest+=interest;this.s.run('UPDATE credit_recoveries SET value=?,updated=? WHERE id=?',JSON.stringify(r.data),now(),r.id);}else this.s.run('UPDATE credit_installments SET paid_principal=paid_principal+?,paid_interest=paid_interest+? WHERE contract_id=? AND number=?',principal,interest,c.id,number);}
 notify(c,sender,subject,text){for(const uid of new Set([c.user_id,...this.c.reviewers(c.space_id)]))this.s.community.mail(sender,uid,'notice',subject,{text,creditSpaceId:c.space_id},'done');}
 actor(user,b,{manager=false}={}){const space=this.s.viewSpace(user,b.space_id),c=this.s.get('SELECT * FROM credit_contracts WHERE id=? AND space_id=?',string(b.contract_id,'合同编号',100),space);requireThat(c,'找不到当前小屋的合同',404);if(manager){this.s.admin(user,space,{closed:true});requireThat(c.user_id!==user.id,'请另一位发奖人来处理自己的合同',403);}else requireThat(c.user_id===user.id||this.s.canManage(user,space,{closed:true}),'只有本人和发奖人可以查看这份约定',403);return c;}
 checkVersion(c,b,user){const current=this.c.contract(c,user);requireThat(b.expectedVersion===current.version,'账单或约定刚有变化，请刷新后再确认',409);return current;}
 delivery(user,b){
  const c=this.actor(user,b),current=this.checkVersion(c,b,user),a=this.agreement(c.id);requireThat(a?.delivery==='waiting'&&c.status==='active','这份心愿不在等待交付',409);requireThat(['confirm','cancel'].includes(b.action),'请选择确认交付或取消');
  const side=user.id===c.user_id?'learner':'giver';requireThat(b.action==='cancel'||!a[side+'Confirmed'],'你已经确认实际交付',409);
  if(b.action==='cancel'){
   a[side+'Cancel']=true;const other=side==='learner'?'giver':'learner';
   if((a.learnerConfirmed||a.giverConfirmed)&&!a[other+'Cancel']){this.saveAgreement(c.id,a);this.s.community.audit(user,c.space_id,'credit.delivery.cancel-request','商量取消已确认一方交付的心愿',{contract_id:c.id,side});this.notify(c,user,'专项心愿正在商量取消','已有交付确认，需要另一方也确认实物已退回，才会退首付和撤销欠款。');return {ok:true};}
   this.cancelDelivery(c,a,user);return {ok:true,cancelled:true};
  }
  requireThat(!a.learnerCancel&&!a.giverCancel,'有人申请取消，请先确认实物是否已退回',409);a[side+'Confirmed']=true;if(side==='giver')a.managerId=user.id;
  if(a.learnerConfirmed&&a.giverConfirmed){
   const today=this.c.today(),rows=this.c.schedule(c.principal,c.annual_bps,c.kind,0,a.periods,today,30);
   this.s.run('UPDATE credit_contracts SET started_on=?,maturity_on=? WHERE id=?',today,rows.at(-1).dueAt,c.id);
   for(const row of rows)this.s.run('UPDATE credit_installments SET starts_on=?,due_on=? WHERE contract_id=? AND number=?',row.startsOn,row.dueAt,c.id,row.number);
   const owner=this.s.get('SELECT * FROM users WHERE id=?',c.user_id),card=this.s.writeCard(owner,a.prize,'special-installment',{space_id:c.space_id,manager_id:a.managerId});
   this.s.run("UPDATE cards SET status='fulfilled',fulfilled=?,delivery_note=?,fulfilled_by=? WHERE id=?",now(),'专项心愿已由双方确认实际交付',a.managerId,card.id);this.s.run('UPDATE credit_contracts SET card_id=? WHERE id=?',card.id,c.id);a.delivery='received';a.deliveredOn=today;
  }
  this.saveAgreement(c.id,a);this.s.community.audit(user,c.space_id,'credit.delivery',a.delivery==='received'?'双方确认专项心愿交付':'确认专项心愿交付',{contract_id:c.id,side,delivery:a.delivery});this.notify(c,user,'专项心愿交付有了新进展',a.delivery==='received'?'双方已确认收到奖品，还款日期从今天开始计算。':'一方已确认实际交付，等待另一方确认；等待期间不计息。');return {ok:true,delivery:a.delivery};
 }
 cancelDelivery(c,a,user){
  this.s.run('UPDATE prizes SET stock=stock+1 WHERE id=?',c.prize_id);if(a.downPayment)this.s.post(c.space_id,a.downPayment,'credit_downpayment_refund','取消未交付专项心愿，退回首付',c.id);
  this.s.run("UPDATE credit_contracts SET status='waived',waived_principal=principal,waived_interest=0,future_interest_saved=max_interest,closed_on=?,closed=? WHERE id=?",this.c.today(),now(),c.id);a.delivery='cancelled';this.saveAgreement(c.id,a);this.s.community.audit(user,c.space_id,'credit.delivery.cancel','取消未交付专项心愿',{contract_id:c.id,refunded:a.downPayment/COIN});this.notify(c,user,'专项心愿已取消','未交付的心愿已取消，首付已退回、预留库存已释放，欠款撤销，没有利息。');
 }
 consequenceState(c,base){
  let event=this.s.get('SELECT * FROM credit_consequences WHERE contract_id=? ORDER BY rowid DESC LIMIT 1',c.id);
  if(event?.status==='active'){
   const cleared=c.status!=='active'||(event.release_condition==='interest'?base.dueInterest===0:base.dueAmount===0),expired=this.c.clock()>=event.expires;
   if(cleared||expired){this.s.db.exec('SAVEPOINT credit_release');try{this.s.run("UPDATE credit_consequences SET status='ended',ended_reason=? WHERE id=? AND status='active'",cleared?'cleared':'expired',event.id);const sender=this.s.get('SELECT id,name FROM users WHERE id=?',event.actor_id);this.s.community.audit(sender,c.space_id,'credit.consequence.end','逾期约定已结束',{contract_id:c.id,event_id:event.id,reason:cleared?'cleared':'expired'});this.notify(c,sender,'约定结束啦，记得归还物品',`${cleared?'已达到约定的恢复条件':'这次约定已到最长保管期限'}。请发奖人归还物品或恢复约定活动，并确认完成；尚未偿还的欠款继续保留。`);this.s.db.exec('RELEASE credit_release');}catch(e){this.s.db.exec('ROLLBACK TO credit_release; RELEASE credit_release');throw e;}event=this.s.get('SELECT * FROM credit_consequences WHERE id=?',event.id);}
  }
  return event||null;
 }
 consequence(user,b){
  const c=this.actor(user,b,{manager:true}),current=this.checkVersion(c,b,user),a=this.agreement(c.id);requireThat(a?.consequence&&a.delivery!=='waiting','这份合同没有事先约定的逾期处理，不能追加处罚',409);
  if(b.action==='return'){
   const e=this.s.get('SELECT * FROM credit_consequences WHERE id=? AND contract_id=?',b.event_id,c.id);requireThat(e&&!e.returned_at,'这次约定已确认结束',409);this.s.run("UPDATE credit_consequences SET status='ended',ended_reason=COALESCE(ended_reason,'manual'),returned_at=? WHERE id=?",now(),e.id);this.s.community.audit(user,c.space_id,'credit.consequence.return','已归还物品或恢复活动',{contract_id:c.id,event_id:e.id});this.notify(c,user,'物品已归还，继续慢慢来','发奖人已确认归还物品或恢复约定活动。欠款仍按账单偿还，没有新增罚息。');return {ok:true};
  }
  requireThat(b.action==='start'&&current.overdue,'账单逾期后才可执行事先约定',409);requireThat(!current.consequence||current.consequence.returned_at,'上一次约定还没确认归还，不能叠加',409);
  requireThat(a.releaseCondition==='interest'?current.dueInterest>0:current.dueAmount>0,'已满足恢复条件，不能执行这项约定',409);
  const bill=current.installments.filter(r=>r.overdue).at(-1),days=integer(b.days??7,1,7,'本次最长天数');requireThat(!this.s.get('SELECT id FROM credit_consequences WHERE contract_id=? AND bill_day=?',c.id,bill.dueAt),'这期账单已经执行过约定，不能反复处罚；可以商量补还计划',409);
  const eid=id();this.s.run('INSERT INTO credit_consequences(id,contract_id,bill_day,actor_id,kind,release_condition,expires,created) VALUES(?,?,?,?,?,?,?,?)',eid,c.id,bill.dueAt,user.id,a.consequence,a.releaseCondition,this.c.clock()+days*DAY,now());this.s.community.audit(user,c.space_id,'credit.consequence.start','执行已约定的逾期处理',{contract_id:c.id,event_id:eid,days,condition:a.releaseCondition});this.notify(c,user,'一起把还款节奏找回来',`${a.consequence==='hold_reward'?'本次奖品暂由发奖人保管':'按约定暂时暂停额外娱乐'}，最长 ${days} 天。${a.releaseCondition==='interest'?'补齐到期利息':'补齐到期本息'}可提前结束；本金仍要偿还，不加罚息。做任务、阅读和申请补还计划都能继续。`);return {ok:true};
 }
 debtVersion(current){return hash(JSON.stringify([current.id,current.status,current.principalRemaining,current.paidPrincipal,current.paidInterest,current.recovery?.id]));}
 recoveryState(cid){const offer=this.s.get("SELECT * FROM credit_recoveries WHERE contract_id=? AND status='pending'",cid);return offer?{...offer,data:JSON.parse(offer.value)}:null;}
 help(user,b){const c=this.actor(user,b);requireThat(user.id===c.user_id&&c.status==='active','由还款本人发出请求',403);const reason=string(b.reason,'想和伙伴说的话',300),a=this.agreement(c.id)||{};requireThat(a.delivery!=='waiting','还没交付，可以先商量取消心愿');requireThat(a.helpDay!==this.c.today(),'今天已经寄出请求，先等伙伴回复吧',409);a.helpDay=this.c.today();this.saveAgreement(c.id,a);this.notify(c,user,'想一起商量还款计划',`${user.name} 说：${reason}\n可以安排可完成的学习任务，或由发奖人提出免息补还、减免方案；不会自动增加奖励或再借一笔。`);this.s.community.audit(user,c.space_id,'credit.help','申请商量补还计划',{contract_id:c.id,reason});return {ok:true};}
 offer(user,b){
  const c=this.actor(user,b,{manager:true}),current=this.checkVersion(c,b,user);requireThat(c.status==='active'&&current.delivery!=='waiting','交付后才需要调整还款计划',409);
  const periods=integer(b.periods,3,36,'补还期数');requireThat(CREDIT_PERIODS.includes(periods),'选择 3、6、12、24 或 36 期');const waive=integer(b.waiveCoins??0,0,Math.floor(current.principalRemaining/COIN),'减免本金')*COIN;requireThat(typeof b.waiveInterest==='boolean','选择是否免除已发生利息');const principal=current.principalRemaining-waive,interest=b.waiveInterest?0:current.interestRemaining;requireThat(principal+interest>0,'全部免除请使用“减免剩余欠款”');
  const data={periods,principal,interest,waivePrincipal:waive,reason:string(b.reason,'方案说明',300),debtVersion:this.debtVersion(current),expires:this.c.clock()+7*DAY};
  this.s.run("UPDATE credit_recoveries SET status='cancelled',updated=? WHERE contract_id=? AND status='pending'",now(),c.id);const rid=id();this.s.run('INSERT INTO credit_recoveries VALUES(?,?,?,?,?,?,?)',rid,c.id,user.id,'pending',JSON.stringify(data),now(),now());this.s.community.audit(user,c.space_id,'credit.recovery.offer','提出免新增利息的补还方案',{contract_id:c.id,recovery_id:rid,...data});this.notify(c,user,'有一份更慢一点的还款方案',`剩余本金 ${principal/COIN} 币、固定已发生利息 ${interest/COIN} 币，分 ${periods} 期，每 30 天一期。没有新增利息，未来利息免除。${data.reason}。需要还款本人确认才会生效。`);return {ok:true};
 }
 respondRecovery(user,b){
  const c=this.actor(user,b);requireThat(c.user_id===user.id&&c.status==='active','只有还款本人可以确认',403);const r=this.recoveryState(c.id);requireThat(r&&r.id===b.recovery_id,'这份补还方案已经更新',409);requireThat(typeof b.accept==='boolean','请选择同意或暂不同意');
  if(!b.accept){this.s.run("UPDATE credit_recoveries SET status='declined',updated=? WHERE id=?",now(),r.id);this.s.community.audit(user,c.space_id,'credit.recovery.decline','暂不同意补还方案',{contract_id:c.id,recovery_id:r.id});this.notify(c,user,'补还方案有了回复','伙伴暂不同意这份补还安排，原账单保持不变，可以再商量。');return {ok:true};}
  const current=this.c.contract(c,user),d=r.data;requireThat(d.expires>this.c.clock()&&d.debtVersion===this.debtVersion(current),'账单已偿还或方案过期，请发奖人重新测算',409);requireThat(this.c.reviewers(c.space_id).includes(r.proposer_id),'提出方案的发奖人已不再管理这间小屋',409);
  const today=this.c.today(),principalPart=Math.floor(d.principal/d.periods),interestPart=Math.floor(d.interest/d.periods);d.rows=Array.from({length:d.periods},(_,i)=>({number:i+1,starts_on:addDays(today,i*30),due_on:addDays(today,(i+1)*30),basis:d.principal-principalPart*i,principal:i===d.periods-1?d.principal-principalPart*i:principalPart,interest:i===d.periods-1?d.interest-interestPart*i:interestPart,paid_principal:0,paid_interest:0}));d.paidPrincipalBefore=current.paidPrincipal;d.paidInterestBefore=current.paidInterest;d.acceptedOn=today;
  const waivedInterest=Math.max(0,current.interestRemaining-d.interest),saved=Math.max(c.future_interest_saved,c.max_interest-current.interestAccrued);d.waivedInterestBefore=c.waived_interest+waivedInterest;
  this.s.run('UPDATE credit_contracts SET waived_principal=waived_principal+?,waived_interest=waived_interest+?,future_interest_saved=?,maturity_on=? WHERE id=?',d.waivePrincipal,waivedInterest,saved,d.rows.at(-1).due_on,c.id);this.s.run("UPDATE credit_recoveries SET status='accepted',value=?,updated=? WHERE id=?",JSON.stringify(d),now(),r.id);this.s.community.audit(user,c.space_id,'credit.recovery.accept','双方确认新的补还计划',{contract_id:c.id,recovery_id:r.id,principal:d.principal/COIN,interest:d.interest/COIN,periods:d.periods});this.notify(c,user,'新的还款节奏，记好啦','补还方案已经生效，第一期在 30 天后。原已还记录保留，没有新借款、没有新增利息。暂时保管约定也已达到新的恢复条件，请发奖人确认归还。');this.c.contract(this.s.get('SELECT * FROM credit_contracts WHERE id=?',c.id),user);return {ok:true};
 }
 describe(c,base,user){const a=this.agreement(c.id),recovery=this.recovery(c.id),offer=this.recoveryState(c.id),consequence=this.consequenceState(c,base);return {agreement:a?.consequence?{consequence:a.consequence,releaseCondition:a.releaseCondition,maxDays:7}:null,delivery:a?.delivery||'received',downPayment:a?.downPayment||0,learnerConfirmed:!!a?.learnerConfirmed,giverConfirmed:!!a?.giverConfirmed,cancelRequested:!!(a?.learnerCancel||a?.giverCancel),special:!!a?.special,consequence,recovery:recovery?{id:recovery.id,periods:recovery.data.periods,principal:recovery.data.principal,interest:recovery.data.interest}:null,recoveryOffer:offer?{id:offer.id,...offer.data,expired:offer.data.expires<=this.c.clock(),stale:offer.data.debtVersion!==this.debtVersion({...base,recovery})}:null,canManageAgreement:!!user&&user.id!==c.user_id&&this.s.canManage(user,c.space_id,{closed:true})};}
}
