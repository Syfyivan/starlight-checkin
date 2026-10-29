import {COIN,dayAt} from './common.mjs';
import {id,now,hash,integer,string,requireThat} from './store.mjs';

const DAY=86400000;
const APPROVAL_THRESHOLD=1000*COIN;
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
  liveRequest(space){
    this.s.run("UPDATE credit_requests SET status='expired',updated=? WHERE space_id=? AND status IN ('pending','approved') AND expires<=?",now(),space,this.clock());
    return this.s.get("SELECT * FROM credit_requests WHERE space_id=? AND status IN ('pending','approved')",space);
  }
  borrowingReason(space,requestId=null){
    const room=this.s.get('SELECT * FROM spaces WHERE id=?',space),rules=this.rules(space);
    if(!this.supported(space))return '借贷体验需要有发奖人的小屋或家庭';
    if(room.status!=='active')return '这间小屋已经收起来啦';
    if(!this.s.familyPlay.eligible(space))return '家长发奖家庭的管家不参与借款领奖';
    if(!rules.enabled)return '发奖人还没有开放借贷体验';
    if(this.active(space))return '先还清当前这一笔，再考虑新的心愿吧';
    if(this.s.community.pendingClose(space))return '小屋正在商量关闭，先等伙伴们决定吧';
    if(this.s.balance(space)<0)return '先补足待补余额，再来体验借贷吧';
    const request=this.liveRequest(space);if(request&&request.id!==requestId)return request.status==='approved'?'已有一份同意的申请，继续确认或取消后再申请吧':'正在等待发奖人看这份申请，先等一等或取消它吧';
    return '';
  }
  requireBorrower(user,b,requestId=null){const space=this.s.ownSpace(user,b),reason=this.borrowingReason(space,requestId);requireThat(!reason,reason,409);return space;}
  prize(space,prizeId){
    const p=this.s.get("SELECT * FROM prizes WHERE id=? AND room_id=? AND channel='shop' AND reward_scope='individual' AND removed=0 AND active=1 AND stock>0",prizeId,this.s.rewardSpaceId(space));
    requireThat(p&&!p.effect,'分期只支持当前小屋在售的个人报销卡或约定体验，功能卡与共同奖励暂不支持',404);return p;
  }
  prizeVersion(p){return p?hash(JSON.stringify([p.id,p.room_id,p.title,p.description,p.emoji,p.tone,p.category,p.face_cents,p.tier,p.cost,p.stock,p.active,p.removed,p.channel,p.reward_scope,p.effect,p.wait_days])):'';}
  schedule(principal,annualBps,kind,termDays,periods,start,periodDays=7){
    const count=periods||1,interval=count===1?termDays:periodDays,part=Math.floor(principal/count);
    return Array.from({length:count},(_,i)=>{const basis=principal-part*i;return {number:i+1,startsOn:addDays(start,i*interval),dueAt:addDays(start,(i+1)*interval),basis,principal:i===count-1?basis:part,interest:creditInterest(basis,annualBps,interval)};});
  }
  plan(b){
    requireThat(['loan','installment'].includes(b.kind),'选择借款或商城分期');
    if(b.kind==='loan'&&(b.periods===undefined||Number(b.periods)===1)){
      const termDays=integer(b.termDays,7,30,'借款天数');requireThat([7,14,30].includes(termDays),'借款可以选 7、14 或 30 天');
      return {kind:b.kind,termDays,periods:1,periodDays:termDays};
    }
    const periods=integer(b.periods,3,6,'分期期数'),periodDays=b.periodDays===undefined?(b.kind==='loan'?30:7):integer(b.periodDays,7,30,'每期天数');
    requireThat([3,6].includes(periods),'分期可以选 3 或 6 期');requireThat(b.kind==='loan'?periodDays===30:[7,30].includes(periodDays),b.kind==='loan'?'长期借款每 30 天一期':'商城分期可以每 7 天或每 30 天一期');
    return {kind:b.kind,termDays:0,periods,periodDays};
  }
  capacity(space,plan,rules=this.rules(space)){return this.s.readiness.capacity(space,{annualBps:plan.annualBps??rules.annualBps,periods:plan.periods,periodDays:plan.periodDays,limitCoins:rules.limitCoins,repaymentPercent:40});}
  requireCapacity(space,terms){const cap=this.capacity(space,terms);requireThat(terms.principal<=cap.maxPrincipalCoins*COIN,`按最近的任务收入，这个还款计划目前最多可用 ${cap.maxPrincipalCoins} 学习币；先积累一些稳定任务收入，或选择更长的周期吧`,409);return cap;}
  plans(space,rules){
    const plans=[...([7,14,30].map(d=>({key:`loan-${d}d`,label:`${d} 天到期`,kind:'loan',termDays:d,periods:1,periodDays:d}))),...([3,6].map(n=>({key:`loan-${n}x30d`,label:`${n} 期 · 每 30 天`,kind:'loan',termDays:0,periods:n,periodDays:30}))),...([7,30].flatMap(d=>[3,6].map(n=>({key:`installment-${n}x${d}d`,label:`${n} 期 · 每 ${d} 天`,kind:'installment',termDays:0,periods:n,periodDays:d}))))];
    return plans.map(plan=>{const cap=this.capacity(space,plan,rules);return {...plan,maxPrincipalCoins:cap.maxPrincipalCoins,periodBudget:cap.periodBudget};});
  }
  reviewers(space){
    const room=this.s.get('SELECT * FROM spaces WHERE id=?',space),ids=room.family_id?this.s.all('SELECT user_id FROM family_members WHERE family_id=? AND is_admin=1',room.family_id).map(r=>r.user_id):[room.giver_id];
    return ids.filter(uid=>uid&&uid!==room.learner_id&&this.s.get('SELECT id FROM users WHERE id=? AND enabled=1',uid));
  }
  requestVersion(r){return hash(JSON.stringify([r.id,r.status,r.reviewer_id,r.reason,r.updated,r.expires]));}
  requestMail(user,r,recipient,subject,text){this.s.community.mail(user,recipient,'notice',subject,{text,creditSpaceId:r.space_id,creditRequestId:r.id},'done');}
  validateRequest(r,{approved=false}={}){
    requireThat(r&&['pending','approved'].includes(r.status)&&r.expires>this.clock(),'这份申请已结束或过期，请重新申请',409);
    if(approved)requireThat(r.status==='approved','还需要等发奖人同意这份申请',409);
    requireThat(r.rules_version===this.rules(r.space_id).version,'借贷规则已变化，请取消这份申请后重新提交',409);
    const terms=JSON.parse(r.terms),p=terms.kind==='installment'?this.s.get('SELECT * FROM prizes WHERE id=?',terms.prizeId):null;
    requireThat(r.prize_version===this.prizeVersion(p),'奖品价格、库存或内容已变化，请取消这份申请后重新提交',409);
    if(terms.kind==='installment')this.prize(r.space_id,terms.prizeId);
    if(r.status==='approved')requireThat(this.reviewers(r.space_id).includes(r.reviewer_id),'原来同意申请的发奖人已不再管理这里，请取消后重新申请',409);
    const reason=this.borrowingReason(r.space_id,r.id);requireThat(!reason,reason,409);this.requireCapacity(r.space_id,terms);return {terms,p};
  }
  request(r,user){
    if(!r)return null;const terms=JSON.parse(r.terms),live=['pending','approved'].includes(r.status)&&r.expires>this.clock();let blockedReason='';
    if(live)try{this.validateRequest(r);}catch(e){blockedReason=e.message;}
    return {id:r.id,kind:r.kind,status:r.status,principal:terms.principal,annualBps:terms.annualBps,periods:terms.periods,periodDays:terms.periodDays,termDays:terms.termDays,prizeId:terms.prizeId,prizeTitle:terms.prizeTitle,expiresAt:r.expires,createdAt:r.created,reason:r.reason,blockedReason,reviewerId:r.reviewer_id,canReview:live&&r.status==='pending'&&this.reviewers(r.space_id).includes(user.id),canCancel:live&&r.user_id===user.id,canResume:live&&r.status==='approved'&&!blockedReason&&r.user_id===user.id,version:this.requestVersion(r),maxInterest:terms.maxInterest,totalMax:terms.totalMax,startedAt:terms.startedAt,maturityAt:terms.maturityAt,installments:terms.installments,snapshot:terms,scheduleIsEstimate:true};
  }
  preview(user,b){
    const requestId=b.request_id?string(b.request_id,'申请编号',100):null,space=this.requireBorrower(user,b,requestId),rules=this.rules(space);let p,terms,approvalId=null;
    if(requestId){
      const r=this.s.get('SELECT * FROM credit_requests WHERE id=? AND space_id=? AND user_id=?',requestId,space,user.id);requireThat(r,'找不到当前小屋里的这份申请',404);
      ({p,terms}=this.validateRequest(r,{approved:true}));approvalId=r.id;
    }else{
      const plan=this.plan(b);p=plan.kind==='installment'?this.prize(space,string(b.prize_id,'奖品编号',100)):null;
      const principal=p?p.cost:integer(b.amountCoins,1,rules.limitCoins,'借款学习币')*COIN;requireThat(principal>0,'免费的奖品直接兑换就好，不需要分期');requireThat(principal<=rules.limitCoins*COIN,'这份心愿超过了小屋开放的借贷额度');
      terms={...plan,principal,annualBps:rules.annualBps};this.requireCapacity(space,terms);
    }
    const today=this.today(),{kind,principal,annualBps,termDays,periods,periodDays}=terms,installments=this.schedule(principal,annualBps,kind,termDays,periods,today,periodDays),maxInterest=installments.reduce((n,r)=>n+r.interest,0);
    const quote={id:id(),expiresAt:this.clock()+5*60000,kind,principal,annualBps,termDays,periods,periodDays,maxInterest,totalMax:principal+maxInterest,startedAt:today,maturityAt:installments.at(-1).dueAt,installments,prizeId:p?.id||null,prizeTitle:p?.title||'',prizeSnapshot:p?{id:p.id,title:p.title,description:p.description,category:p.category,faceCents:p.face_cents,cost:p.cost,waitDays:p.wait_days}:null,requiresApproval:principal>APPROVAL_THRESHOLD,approvalId};
    this.s.run('DELETE FROM credit_quotes WHERE expires<?',this.clock()-DAY);
    this.s.run('INSERT INTO credit_quotes VALUES(?,?,?,?,?,?,?,?,?,?)',quote.id,space,user.id,JSON.stringify(quote),rules.version,this.prizeVersion(p),today,quote.expiresAt,null,now());
    return {ok:true,quote};
  }
  accept(user,b){
    const space=this.s.ownSpace(user,b),q=this.s.get('SELECT * FROM credit_quotes WHERE id=? AND space_id=? AND user_id=?',string(b.quote_id,'报价编号',100),space,user.id);
    const existingReason=this.borrowingReason(space,q&&!q.consumed?JSON.parse(q.terms).approvalId:null);requireThat(!existingReason,existingReason,409);
    requireThat(q&&!q.consumed&&q.expires>this.clock()&&q.quoted_day===this.today(),'这份报价已过期或用过啦，请重新预览',409);
    requireThat(q.rules_version===this.rules(space).version,'借贷规则刚有变化，请重新预览合同',409);const terms=JSON.parse(q.terms),p=terms.kind==='installment'?this.prize(space,terms.prizeId):null;
    requireThat(q.prize_version===this.prizeVersion(p),'奖品价格、库存或内容刚有变化，请重新预览',409);
    this.requireCapacity(space,terms);
    if(terms.principal>APPROVAL_THRESHOLD&&!terms.approvalId){
      const reviewers=this.reviewers(space);requireThat(reviewers.length>0,'超过 1000 学习币需要另一位发奖人逐笔同意，请先邀请一位奖品管家',409);
      const rid=id(),created=now();this.s.run("INSERT INTO credit_requests(id,space_id,user_id,kind,terms,rules_version,prize_version,status,expires,created,updated) VALUES(?,?,?,?,?,?,?,'pending',?,?,?)",rid,space,user.id,terms.kind,JSON.stringify(terms),q.rules_version,q.prize_version,this.clock()+7*DAY,created,created);
      this.s.run('UPDATE credit_quotes SET consumed=? WHERE id=?','request:'+rid,q.id);const request=this.s.get('SELECT * FROM credit_requests WHERE id=?',rid);
      for(const recipient of reviewers)this.requestMail(user,request,recipient,'有一份学习币申请等你看看',`${user.name} 想申请 ${terms.principal/COIN} 学习币${terms.kind==='installment'?'，用于分期兑换「'+terms.prizeTitle+'」':''}。本金、利率和每期安排已放在申请里，7 天内可以答复。`);
      this.s.community.audit(user,space,'credit.request','提交学习币申请',{request_id:rid,principal:terms.principal/COIN,kind:terms.kind,annualBps:terms.annualBps,periods:terms.periods,periodDays:terms.periodDays});return {ok:true,approvalPending:true,request:this.request(request,user)};
    }
    if(terms.approvalId){
      const request=this.s.get('SELECT * FROM credit_requests WHERE id=? AND space_id=? AND user_id=?',terms.approvalId,space,user.id);requireThat(request,'找不到当前小屋里的这份申请',404);
      const approved=this.validateRequest(request,{approved:true}).terms;
      requireThat(['kind','principal','annualBps','termDays','periods','periodDays','prizeId'].every(k=>approved[k]===terms[k]),'这份报价与已同意的申请不一致，请重新预览',409);
    }
    const cid=id();this.s.run('INSERT INTO credit_contracts(id,space_id,user_id,quote_id,kind,principal,annual_bps,started_on,maturity_on,max_interest,prize_id,prize_title,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)',cid,space,user.id,q.id,terms.kind,terms.principal,terms.annualBps,terms.startedAt,terms.maturityAt,terms.maxInterest,p?.id||null,p?.title||'',now());
    for(const r of terms.installments)this.s.run('INSERT INTO credit_installments(contract_id,number,starts_on,due_on,basis,principal,interest) VALUES(?,?,?,?,?,?,?)',cid,r.number,r.startsOn,r.dueAt,r.basis,r.principal,r.interest);
    this.s.post(space,terms.principal,'credit_disbursement',terms.kind==='loan'?'学习币借款到账':'商城分期本金',cid);
    let card=null;if(p){card=this.s.issue(user,p,'installment');this.s.post(space,-p.cost,'shop',`分期兑换 · ${p.title}`,card.id);this.s.run('UPDATE credit_contracts SET card_id=? WHERE id=?',card.id,cid);this.s.run('DELETE FROM wish_goals WHERE space_id=? AND prize_id=?',space,p.id);}
    this.s.run('UPDATE credit_quotes SET consumed=? WHERE id=?',cid,q.id);
    if(terms.approvalId)this.s.run("UPDATE credit_requests SET status='consumed',updated=? WHERE id=?",now(),terms.approvalId);
    this.s.community.audit(user,space,'credit.accept',terms.kind==='loan'?'确认学习币借款':'分期兑换 · '+p.title,{contract_id:cid,kind:terms.kind,principal:terms.principal/COIN,annualBps:terms.annualBps,maxInterest:terms.maxInterest/COIN,maturityAt:terms.maturityAt,card_id:card?.id||null});
    return {ok:true,contract:this.contract(this.active(space),user),card};
  }
  respond(user,b){
    const space=this.s.viewSpace(user,b.space_id);this.s.admin(user,space);this.liveRequest(space);
    const r=this.s.get('SELECT * FROM credit_requests WHERE id=? AND space_id=?',string(b.request_id,'申请编号',100),space);requireThat(r,'找不到当前小屋里的这份申请',404);requireThat(r.user_id!==user.id,'自己的申请需要另一位发奖人同意，不能给自己审批',403);
    requireThat(this.reviewers(space).includes(user.id),'只有当前小屋的发奖人可以答复这份申请',403);requireThat(r.status==='pending'&&r.expires>this.clock(),'这份申请已经答复或过期啦',409);requireThat(b.expectedVersion===this.requestVersion(r),'这份申请刚有变化，刷新后再答复吧',409);requireThat(typeof b.approve==='boolean','选择同意或暂不同意');
    if(b.approve)this.validateRequest(r);const reason=b.reason?.trim()?string(b.reason,'答复说明',300):'',status=b.approve?'approved':'declined';
    this.s.run('UPDATE credit_requests SET status=?,reviewer_id=?,reason=?,updated=? WHERE id=?',status,user.id,reason,now(),r.id);
    this.requestMail(user,r,r.user_id,b.approve?'学习币申请已同意':'学习币申请有了答复',b.approve?`${user.name} 同意啦！请在申请过期前重新查看日期和还款计划，再确认签约。${reason?' 说明：'+reason:''}`:`${user.name} 暂不同意这份申请。${reason?'说明：'+reason:'可以先聊聊学习安排，再决定下一份心愿。'}`);
    this.s.community.audit(user,space,'credit.respond',b.approve?'同意学习币申请':'暂不同意学习币申请',{request_id:r.id,approve:b.approve,reason});return {ok:true,request:this.request(this.s.get('SELECT * FROM credit_requests WHERE id=?',r.id),user)};
  }
  cancel(user,b){
    const space=this.s.ownSpace(user,b,{closed:true});this.liveRequest(space);const r=this.s.get('SELECT * FROM credit_requests WHERE id=? AND space_id=? AND user_id=?',string(b.request_id,'申请编号',100),space,user.id);requireThat(r,'找不到当前小屋里的这份申请',404);
    requireThat(['pending','approved'].includes(r.status)&&r.expires>this.clock(),'这份申请已经结束啦',409);requireThat(b.expectedVersion===this.requestVersion(r),'这份申请刚有变化，刷新后再取消吧',409);
    this.s.run("UPDATE credit_requests SET status='cancelled',updated=? WHERE id=?",now(),r.id);this.s.community.audit(user,space,'credit.cancel','取消学习币申请',{request_id:r.id});
    for(const recipient of this.reviewers(space))this.requestMail(user,r,recipient,'学习币申请已取消',`${user.name} 取消了这份学习币申请，没有发币或占用奖品。`);
    return {ok:true,request:this.request(this.s.get('SELECT * FROM credit_requests WHERE id=?',r.id),user)};
  }
  contract(c,user){
    if(!c)return null;const day=c.closed_on||this.today(),active=c.status==='active',rows=this.s.all('SELECT * FROM credit_installments WHERE contract_id=? ORDER BY number',c.id);
    const installments=rows.map(r=>{
      const accrued=creditInterest(r.basis,c.annual_bps,Math.max(0,Math.min(daysBetween(r.starts_on,day),daysBetween(r.starts_on,r.due_on))));
      const remaining=active?r.principal-r.paid_principal+r.interest-r.paid_interest:0;
      return {number:r.number,startsOn:r.starts_on,dueAt:r.due_on,principal:r.principal,interest:r.interest,accruedInterest:accrued,paidPrincipal:r.paid_principal,paidInterest:r.paid_interest,remaining,dueNow:active&&r.due_on<=day&&remaining>0,overdue:active&&r.due_on<day&&remaining>0,paid:remaining===0};
    });
    const paidPrincipal=rows.reduce((n,r)=>n+r.paid_principal,0),paidInterest=rows.reduce((n,r)=>n+r.paid_interest,0),accrued=installments.reduce((n,r)=>n+r.accruedInterest,0),principalRemaining=active?c.principal-paidPrincipal:0,interestRemaining=active?Math.max(0,accrued-paidInterest):0,overdue=installments.some(r=>r.overdue);
    // Record a late bill before it is repaid or waived so it cannot become an on-time history entry.
    if(overdue&&!c.had_overdue)this.s.run('UPDATE credit_contracts SET had_overdue=1 WHERE id=?',c.id);
    return {id:c.id,kind:c.kind,status:c.status,principal:c.principal,annualBps:c.annual_bps,startedAt:c.started_on,maturityAt:c.maturity_on,periods:rows.length,periodDays:rows.length?daysBetween(rows[0].starts_on,rows[0].due_on):daysBetween(c.started_on,c.maturity_on),maxInterest:c.max_interest,totalMax:c.principal+c.max_interest,principalRemaining,interestAccrued:accrued,interestRemaining,payoffAmount:principalRemaining+interestRemaining,dueAmount:installments.filter(r=>r.dueNow).reduce((n,r)=>n+r.remaining,0),overdue,hadOverdue:!!c.had_overdue||overdue,installments,paidPrincipal,paidInterest,waivedPrincipal:c.waived_principal,waivedInterest:c.waived_interest,futureInterestSaved:c.future_interest_saved,prizeId:c.prize_id,prizeTitle:c.prize_title,cardId:c.card_id,closedAt:c.closed_on,canWaive:!!user&&active&&user.id!==c.user_id&&this.s.canManage(user,c.space_id,{closed:true}),version:hash(JSON.stringify([c.id,c.status,day,rows.map(r=>[r.number,r.paid_principal,r.paid_interest]),this.s.balance(c.space_id)]))};
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
    const contract=this.contract(this.active(space),user),supported=this.supported(space),rules=this.rules(space),assessment=this.s.readiness.profile(space),plans=this.plans(space,rules),activeRequest=this.liveRequest(space),requestRows=this.s.all("SELECT * FROM credit_requests WHERE space_id=? AND status NOT IN ('pending','approved') ORDER BY created DESC,rowid DESC LIMIT 5",space);
    const reason=this.borrowingReason(space)||(!plans.some(p=>p.maxPrincipalCoins>0)?'先积累一些稳定任务收入，再来看看适合自己的额度吧':'');
    return {supported,canBorrow:owner===user.id&&!reason,reason,rules,assessment,plans,request:this.request(activeRequest,user),requestHistory:requestRows.map(r=>this.request(r,user)),canManage:canManage&&supported,contract,history:this.s.all("SELECT * FROM credit_contracts WHERE space_id=? AND status<>'active' ORDER BY created DESC,id LIMIT 10",space).map(c=>this.contract(c,user))};
  }
}
