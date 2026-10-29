import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {createApp} from '../server.mjs';

const DAY=86400000,START=Date.parse('2026-10-30T10:00:00+08:00');
function setup(t,{store=new Store(':memory:'),close=true,seed=true}={}){
  const s=store;if(close)t.after(()=>s.db.close());let timestamp=START;s.credit.clock=()=>timestamp;
  const a=s.newUser({username:'approve_a',name:'小芽',password:''}),g=s.newUser({username:'approve_g',name:'晴天',password:''}),other=s.newUser({username:'approve_o',name:'其他伙伴',password:''});
  const room=s.pair(a.id,g.id).space_id;a.space_id=room;
  const seedDays=(space=room,earned=100)=>{
    const beginning=dayAt(START-28*DAY);s.run("UPDATE settings SET value=? WHERE key='credit_readiness_start'",beginning);s.run('UPDATE spaces SET created=? WHERE id=?',new Date(START-29*DAY).toISOString(),space);
    for(let i=28;i>0;i--){const day=dayAt(START-i*DAY),time=day+'T01:00:00.000Z';s.run("INSERT OR REPLACE INTO credit_days(space_id,day,task_ids,earned,required_count,completed_count,active,finalized,cap_coins,created,updated) VALUES(?,?,'[]',?,5,5,1,1,100,?,?)",space,day,earned*COIN,time,time);}
  };
  if(seed)seedDays();
  const call=(method,body={},user=a,key=randomUUID())=>{body={space_id:room,...body};return s.operation(user,key,'/api/credit/'+method,body,()=>s.credit[method](user,body));};
  const rules=(extra={},user=g,space=room)=>call('saveRules',{space_id:space,enabled:true,limitCoins:5000,annualBps:600,...extra,expectedVersion:s.credit.rules(space).version},user);
  const preview=(extra={},user=a)=>call('preview',{kind:'loan',amountCoins:1200,periods:3,periodDays:30,...extra},user).quote;
  const apply=(extra={},user=a)=>call('accept',{quote_id:preview(extra,user).id,...(extra.space_id?{space_id:extra.space_id}:{})},user).request;
  const request=(user=a,space=room)=>{const state=s.credit.state(user,space);return state.request||state.requestHistory[0];};
  const respond=(r,extra={},user=g)=>call('respond',{request_id:r.id,approve:true,expectedVersion:r.version,...extra},user);
  const resume=(r,extra={})=>call('preview',{request_id:r.id,...extra}).quote;
  const accept=q=>call('accept',{quote_id:q.id});
  const prize=(cost=1200)=>s.savePrize(g,{space_id:room,title:'远方的小旅行',description:'一起约好再出发',emoji:'旅',category:'experience',face_cents:0,cost,stock:3,wait_days:0,active:true}).id;
  return {s,a,g,other,room,seedDays,call,rules,preview,apply,request,respond,resume,accept,prize,at:days=>{timestamp=START+days*DAY;},time:ms=>{timestamp=ms;}};
}

test('真实观察记录决定动态额度；新账号无收入为零，短期与长期计划分别限额',t=>{
  const f=setup(t,{seed:false});f.rules();let state=f.s.credit.state(f.a,f.room);
  assert.equal(state.assessment.tierLimitCoins,300);assert.equal(state.canBorrow,false);assert.match(state.reason,/稳定任务收入/);assert.ok(state.plans.every(p=>p.maxPrincipalCoins===0));
  assert.throws(()=>f.preview({amountCoins:1}),/目前最多可用 0/);f.seedDays();state=f.s.credit.state(f.a,f.room);
  assert.equal(state.assessment.observedDays,28);assert.equal(state.assessment.stableDailyIncome,100*COIN);assert.equal(state.assessment.tierLimitCoins,3000);
  assert.equal(state.plans.length,9);assert.equal(state.plans.find(p=>p.key==='loan-7d').periodBudget,280*COIN);assert.equal(state.plans.find(p=>p.key==='loan-7d').maxPrincipalCoins,279);
  assert.equal(state.plans.find(p=>p.key==='loan-3x30d').maxPrincipalCoins,3000);assert.equal(state.canBorrow,true);
  assert.throws(()=>f.preview({periods:1,termDays:7,amountCoins:280}),/279 学习币/);assert.throws(()=>f.preview({amountCoins:3001}),/3000 学习币/);
  assert.throws(()=>f.preview({periods:3,periodDays:7}),/长期借款每 30 天/);
});

test('严格超过 1000 才审批；1000 可直接签约，多期现金的本金与日期正确',t=>{
  const f=setup(t);f.rules();const q=f.preview({amountCoins:1000,periods:6});assert.equal(q.requiresApproval,false);assert.equal(q.periodDays,30);assert.equal(q.installments.length,6);
  assert.equal(q.installments.reduce((n,r)=>n+r.principal,0),1000*COIN);assert.ok(q.installments.slice(0,-1).every(r=>r.principal===166666666));assert.equal(q.installments.at(-1).principal,166666670);
  assert.equal(q.maturityAt,dayAt(START+180*DAY));const result=f.accept(q);assert.equal(result.contract.periods,6);assert.equal(result.contract.periodDays,30);assert.equal(result.contract.principal,1000*COIN);assert.equal(f.s.balance(f.room),1000*COIN);
  assert.equal(f.s.get('SELECT COUNT(*) n FROM credit_requests').n,0);assert.equal(f.s.state(f.a,f.room).earnedTotal,0);
});

test('大额申请无资金或库存副作用、幂等、最多一份待处理；审批完整快照只给本人和管家',t=>{
  const f=setup(t);f.rules();const pid=f.prize(),q=f.preview({kind:'installment',prize_id:pid}),key=randomUUID(),body={quote_id:q.id};assert.equal(q.requiresApproval,true);
  const result=f.call('accept',body,f.a,key);assert.deepEqual(f.call('accept',body,f.a,key),result);assert.equal(result.approvalPending,true);assert.equal(result.request.status,'pending');
  assert.equal(f.s.balance(f.room),0);assert.equal(f.s.get('SELECT stock FROM prizes WHERE id=?',pid).stock,3);assert.equal(f.s.get('SELECT COUNT(*) n FROM cards').n,0);assert.equal(f.s.get('SELECT COUNT(*) n FROM credit_contracts').n,0);
  assert.equal(f.s.get('SELECT COUNT(*) n FROM credit_requests').n,1);assert.equal(f.s.get("SELECT COUNT(*) n FROM mailbox WHERE subject='有一份学习币申请等你看看'").n,1);
  const manager=f.request(f.g);assert.equal(manager.canReview,true);assert.equal(manager.installments.length,3);assert.equal(manager.snapshot.prizeSnapshot.title,'远方的小旅行');assert.equal(manager.snapshot.prizeSnapshot.cost,1200*COIN);assert.equal(manager.totalMax,manager.principal+manager.maxInterest);assert.equal(manager.scheduleIsEstimate,true);
  const mail=JSON.parse(f.s.get("SELECT payload FROM mailbox WHERE subject='有一份学习币申请等你看看'").payload);assert.equal(mail.creditSpaceId,f.room);assert.equal(mail.creditRequestId,result.request.id);
  assert.equal(f.s.credit.state(f.a,f.room).canBorrow,false);assert.throws(()=>f.preview(),/正在等待/);assert.throws(()=>f.accept(q),/正在等待/);assert.throws(()=>f.s.credit.state(f.other,f.room),/没有向你开放/);
  assert.throws(()=>f.respond(result.request,{},f.a),/发奖人/);assert.throws(()=>f.call('cancel',{request_id:result.request.id,expectedVersion:result.request.version},f.g),/领奖人/);
});

test('批准不直接发款；次日重新报价仍保持约定本金利率周期，最终签约幂等且消耗批准',t=>{
  const f=setup(t);f.rules();const r=f.apply();f.at(1);const approveKey=randomUUID(),body={request_id:r.id,approve:true,expectedVersion:r.version};
  const reply=f.call('respond',body,f.g,approveKey);assert.deepEqual(f.call('respond',body,f.g,approveKey),reply);assert.equal(f.s.balance(f.room),0);assert.equal(reply.request.canReview,false);
  const learner=f.request();assert.equal(learner.canResume,true);assert.equal(learner.canCancel,true);assert.equal(learner.principal,1200*COIN);assert.throws(()=>f.preview(),/已有一份同意/);
  const q=f.resume(r,{amountCoins:2900,annualBps:0,periods:6,periodDays:7});assert.equal(q.approvalId,r.id);assert.equal(q.principal,r.principal);assert.equal(q.annualBps,r.annualBps);assert.equal(q.periods,r.periods);assert.equal(q.periodDays,r.periodDays);assert.equal(q.startedAt,'2026-10-31');assert.notEqual(q.startedAt,r.startedAt);
  const key=randomUUID(),signed=f.call('accept',{quote_id:q.id},f.a,key);assert.deepEqual(f.call('accept',{quote_id:q.id},f.a,key),signed);assert.equal(signed.contract.principal,1200*COIN);assert.equal(f.s.balance(f.room),1200*COIN);assert.equal(f.request().status,'consumed');assert.equal(f.s.get('SELECT COUNT(*) n FROM credit_contracts').n,1);
  assert.throws(()=>f.respond(r),/已经答复/);assert.equal(f.s.get("SELECT COUNT(*) n FROM room_audit WHERE action='credit.respond'").n,1);
});

test('规则与商品变化使申请不可继续，取消可重提；未批准不能跳过审批',t=>{
  const f=setup(t);f.rules();let r=f.apply();assert.throws(()=>f.resume(r),/等发奖人同意/);f.rules({annualBps:500});assert.match(f.request().blockedReason,/规则已变化/);assert.throws(()=>f.respond(r),/规则已变化/);
  f.call('cancel',{request_id:r.id,expectedVersion:f.request().version});assert.equal(f.request().status,'cancelled');assert.equal(f.s.credit.state(f.a,f.room).canBorrow,true);
  const pid=f.prize();r=f.apply({kind:'installment',prize_id:pid});f.respond(r);f.s.run('UPDATE prizes SET cost=cost+? WHERE id=?',COIN,pid);
  assert.equal(f.request().canResume,false);assert.match(f.request().blockedReason,/价格、库存或内容/);assert.throws(()=>f.resume(r),/价格、库存或内容/);assert.equal(f.request().principal,1200*COIN);
  f.call('cancel',{request_id:r.id,expectedVersion:f.request().version});r=f.apply({kind:'installment',prize_id:pid});assert.equal(r.principal,1201*COIN);assert.equal(f.request().status,'pending');
});

test('动态额度必须在报价、审批、签约时再次满足；改善评估不会篡改或作废批准',t=>{
  const f=setup(t);f.rules();let r=f.apply();f.s.run('UPDATE credit_days SET earned=? WHERE space_id=?',10*COIN,f.room);assert.throws(()=>f.respond(r),/目前最多可用/);assert.equal(f.request().canReview,false);
  f.seedDays(f.room,100);f.respond(r);const q=f.resume(r);f.s.run('UPDATE credit_days SET earned=? WHERE space_id=?',10*COIN,f.room);assert.throws(()=>f.accept(q),/目前最多可用/);assert.equal(f.s.balance(f.room),0);
  f.seedDays(f.room,200);const fresh=f.resume(r);assert.equal(fresh.principal,r.principal);assert.equal(f.accept(fresh).contract.principal,r.principal);
});

test('额度下降阻止批准但管家仍可拒绝待审申请，保留原因并释放申请名额',t=>{
  const f=setup(t);f.rules();const original=f.apply();f.s.run('UPDATE credit_days SET earned=? WHERE space_id=?',10*COIN,f.room);
  const review=f.request(f.g);assert.equal(review.status,'pending');assert.equal(review.canReview,true);assert.match(review.blockedReason,/目前最多可用/);
  assert.throws(()=>f.respond(review),/目前最多可用/);assert.equal(f.request(f.g).status,'pending');
  const reason='最近的任务收入变少了，先调整计划再申请吧',declined=f.respond(review,{approve:false,reason}).request;
  assert.equal(declined.status,'declined');assert.equal(declined.reason,reason);assert.equal(declined.reviewerId,f.g.id);
  const state=f.s.credit.state(f.a,f.room);assert.equal(state.request,null);assert.equal(state.requestHistory[0].reason,reason);assert.equal(state.canBorrow,true);assert.equal(f.s.balance(f.room),0);
  f.seedDays(f.room,100);const next=f.apply();assert.notEqual(next.id,original.id);assert.equal(next.status,'pending');assert.equal(f.s.get("SELECT COUNT(*) n FROM credit_requests WHERE status IN ('pending','approved')").n,1);
});

test('7 天申请过期释放名额，拒绝与取消均保留历史，跨小屋请求和报价不能串用',t=>{
  const f=setup(t);f.rules();let r=f.apply(),key=randomUUID(),body={request_id:r.id,approve:false,expectedVersion:r.version,reason:'先把最近的计划稳定下来'};
  const declined=f.call('respond',body,f.g,key);assert.deepEqual(f.call('respond',body,f.g,key),declined);assert.equal(declined.request.status,'declined');assert.equal(declined.request.reason,body.reason);
  r=f.apply();const foreign=f.s.pair(f.a.id,f.other.id).space_id;f.seedDays(foreign);f.rules({},f.other,foreign);assert.throws(()=>f.call('respond',{space_id:foreign,request_id:r.id,approve:true,expectedVersion:r.version},f.other),/找不到当前小屋/);assert.throws(()=>f.call('preview',{space_id:foreign,request_id:r.id}),/找不到当前小屋/);
  const q=f.preview({space_id:foreign,amountCoins:1000});assert.throws(()=>f.accept(q),/正在等待/);assert.equal(f.s.balance(foreign),0);
  f.at(7);assert.equal(f.request().status,'expired');assert.equal(f.request().canResume,false);assert.throws(()=>f.respond(r),/已经答复或过期/);assert.equal(f.s.get("SELECT COUNT(*) n FROM credit_requests WHERE status IN ('pending','approved')").n,0);
  r=f.apply();const cancelled=f.call('cancel',{request_id:r.id,expectedVersion:r.version});assert.equal(cancelled.request.status,'cancelled');assert.equal(f.s.credit.state(f.a,f.room).requestHistory.length,3);
});

test('签约时审批者仍须在职且启用；批准申请的商品发卡失败全部回滚，可安全重试',t=>{
  const f=setup(t);f.rules();const pid=f.prize(),r=f.apply({kind:'installment',prize_id:pid});f.respond(r);const q=f.resume(r);
  f.s.run('UPDATE users SET enabled=0 WHERE id=?',f.g.id);assert.throws(()=>f.accept(q),/不再管理这里/);f.s.run('UPDATE users SET enabled=1 WHERE id=?',f.g.id);
  const issue=f.s.issue;f.s.issue=function(...args){issue.apply(this,args);throw new Error('审批发卡失败');};assert.throws(()=>f.accept(q),/审批发卡失败/);f.s.issue=issue;
  assert.equal(f.request().status,'approved');assert.equal(f.s.balance(f.room),0);assert.equal(f.s.get('SELECT COUNT(*) n FROM credit_contracts').n,0);assert.equal(f.s.get('SELECT COUNT(*) n FROM cards').n,0);assert.equal(f.s.get('SELECT stock FROM prizes WHERE id=?',pid).stock,3);assert.equal(f.s.get('SELECT consumed FROM credit_quotes WHERE id=?',q.id).consumed,null);
  const signed=f.accept(q);assert.equal(signed.contract.kind,'installment');assert.equal(signed.contract.periodDays,30);assert.equal(signed.card.source,'installment');assert.equal(f.s.balance(f.room),0);assert.equal(f.request().status,'consumed');assert.equal(f.s.get('SELECT stock FROM prizes WHERE id=?',pid).stock,2);
});

test('旧合同不受评估和规则变动影响；直接还款或减免前必须保存逾期事实',t=>{
  const f=setup(t);f.rules();let c=f.accept(f.preview({amountCoins:100,periods:1,termDays:7})).contract;f.at(8);f.rules({enabled:false,annualBps:1200,limitCoins:1});f.s.run('UPDATE credit_days SET earned=0 WHERE space_id=?',f.room);
  // Do not request state before repayment: repay itself must persist overdue history.
  const current=f.s.credit.contract(f.s.credit.active(f.room));f.s.post(f.room,current.interestRemaining,'test','测试利息',randomUUID());
  const latest=f.s.credit.contract(f.s.credit.active(f.room));f.s.run('UPDATE credit_contracts SET had_overdue=0 WHERE id=?',c.id);const paid=f.call('repay',{contract_id:c.id,mode:'payoff',expectedVersion:latest.version}).contract;
  assert.equal(paid.annualBps,600);assert.equal(paid.principal,100*COIN);assert.equal(paid.startedAt,c.startedAt);assert.equal(paid.hadOverdue,true);assert.equal(f.s.get('SELECT had_overdue FROM credit_contracts WHERE id=?',c.id).had_overdue,1);assert.equal(f.s.readiness.profile(f.room).onTimeLoans,0);
  f.at(0);f.seedDays();f.rules();c=f.accept(f.preview({amountCoins:100,periods:1,termDays:7})).contract;f.at(8);const stale=f.s.get('SELECT * FROM credit_contracts WHERE id=?',c.id);assert.equal(stale.had_overdue,0);
  const version=f.s.credit.contract(stale).version;f.s.run('UPDATE credit_contracts SET had_overdue=0 WHERE id=?',c.id);const waived=f.call('waive',{contract_id:c.id,expectedVersion:version,reason:'一起结束这次体验'},f.g).contract;assert.equal(waived.hadOverdue,true);assert.equal(waived.status,'waived');
});

test('家庭借款按个人隔离；不能自批，只通知其他管家，撤销管家权限使批准失效',t=>{
  const f=setup(t),familyRoom=f.s.tx(()=>f.s.community.createFamily(f.a,{name:'一起进步',mode:'friends'})).space_id;
  const join=u=>{const invite=f.s.tx(()=>f.s.community.familyInvite(f.a,{space_id:familyRoom}));return f.s.tx(()=>f.s.acceptInvite(u,invite.code)).space_id;};const gRoom=join(f.g),oRoom=join(f.other);f.seedDays(familyRoom);f.rules({},f.a,familyRoom);
  const q=f.preview({space_id:familyRoom});assert.throws(()=>f.call('accept',{space_id:familyRoom,quote_id:q.id}),/邀请一位奖品管家/);
  f.s.tx(()=>f.s.community.setAdmins(f.a,{space_id:familyRoom,user_ids:[f.a.id,f.g.id],expected_admins:[f.a.id]}));const r=f.apply({space_id:familyRoom});
  assert.equal(f.s.credit.state(f.other,familyRoom),null);assert.equal(f.s.credit.state(f.a,gRoom).request,null);assert.equal(f.s.credit.state(f.other,oRoom).request,null);assert.equal(f.s.credit.state(f.a,familyRoom).request.canReview,false);assert.equal(f.s.credit.state(f.g,familyRoom).request.canReview,true);
  assert.throws(()=>f.call('respond',{space_id:familyRoom,request_id:r.id,approve:true,expectedVersion:r.version}),/不能给自己审批/);
  const mail=f.s.all("SELECT recipient_id FROM mailbox WHERE subject='有一份学习币申请等你看看'");assert.deepEqual(mail.map(m=>m.recipient_id),[f.g.id]);
  f.call('respond',{space_id:familyRoom,request_id:r.id,approve:true,expectedVersion:r.version},f.g);const approved=f.call('preview',{space_id:familyRoom,request_id:r.id}).quote;
  f.s.tx(()=>f.s.community.setAdmins(f.a,{space_id:familyRoom,user_ids:[f.a.id],expected_admins:[f.a.id,f.g.id]}));assert.throws(()=>f.call('accept',{space_id:familyRoom,quote_id:approved.id}),/不再管理这里/);assert.equal(f.s.balance(familyRoom),0);
});

test('真实 HTTP 审批与签约并发保持一次，CSRF、跨房间与过期版本不能绕过',async t=>{
  const {server,store:s}=await createApp({dbPath:':memory:'});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(()=>{s.db.close();resolve();})));
  const f=setup(t,{store:s,close:false});f.rules();const applicant=s.session(f.a.id),manager=s.session(f.g.id),origin='http://127.0.0.1:'+server.address().port;
  const http=(action,body,session=applicant,key=randomUUID(),csrf=session.csrf)=>fetch(origin+'/api/credit/'+action,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'starlight_session='+session.token,'X-CSRF-Token':csrf,'Idempotency-Key':key},body:JSON.stringify({space_id:f.room,...body})});
  const q=(await(await http('preview',{kind:'loan',amountCoins:1200,periods:3,periodDays:30})).json()).quote,key=randomUUID();
  const results=await Promise.all([http('accept',{quote_id:q.id},applicant,key),http('accept',{quote_id:q.id},applicant,key)]);assert.ok(results.every(r=>r.status===200));const request=(await results[0].json()).request;assert.equal(s.get('SELECT COUNT(*) n FROM credit_requests').n,1);assert.equal(s.balance(f.room),0);
  const body={request_id:request.id,approve:true,expectedVersion:request.version};assert.equal((await http('respond',body,manager,randomUUID(),'wrong')).status,403);assert.equal((await http('respond',body,applicant)).status,403);
  const reviews=await Promise.all([http('respond',body,manager),http('respond',body,manager)]);assert.deepEqual(reviews.map(r=>r.status).sort(),[200,409]);
  const signedQuote=(await(await http('preview',{request_id:request.id})).json()).quote;const signs=await Promise.all([http('accept',{quote_id:signedQuote.id}),http('accept',{quote_id:signedQuote.id})]);assert.deepEqual(signs.map(r=>r.status).sort(),[200,409]);assert.equal(s.balance(f.room),1200*COIN);assert.equal(s.get('SELECT COUNT(*) n FROM credit_contracts').n,1);assert.equal(s.get("SELECT COUNT(*) n FROM credit_requests WHERE status='consumed'").n,1);
});
