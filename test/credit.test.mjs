import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {creditInterest} from '../lib/credit.mjs';
import {createApp} from '../server.mjs';

const DAY=86400000;
// These legacy accounting tests isolate the agreed contract math from the new income assessment.
// Real assessment records and approval integration are exercised in credit-approval.test.mjs.
function stableReadiness(s){s.readiness.profile=()=>({tierName:'稳定样本',stableDailyIncome:1000*COIN});s.readiness.capacity=(_space,options)=>({maxPrincipalCoins:options.limitCoins,periodBudget:1000*COIN});}
function setup(t,{store=new Store(':memory:'),close=true}={}){
  const s=store;stableReadiness(s);if(close)t.after(()=>s.db.close());
  const a=s.newUser({username:'credit_a',name:'小芽',password:''}),g=s.newUser({username:'credit_g',name:'晴天',password:''}),other=s.newUser({username:'credit_o',name:'其他伙伴',password:''});
  const room=s.pair(a.id,g.id).space_id;a.space_id=room;let at=Date.parse('2026-10-30T10:00:00+08:00');s.credit.clock=()=>at;
  const setDay=(days,hour=10)=>{at=Date.parse('2026-10-30T00:00:00+08:00')+days*DAY+hour*3600000;};
  const op=(u,method,body={},key=randomUUID())=>{body={space_id:room,...body};return s.operation(u,key,'/api/credit/'+method,body,()=>s.credit[method](u,body));};
  const rules=(extra={},space=room,user=g)=>op(user,'saveRules',{space_id:space,enabled:true,limitCoins:300,annualBps:600,...extra,expectedVersion:s.credit.rules(space).version});
  const preview=(extra={},space=room,user=a)=>op(user,'preview',{space_id:space,kind:'loan',amountCoins:100,termDays:7,...extra}).quote;
  const accept=(quote,user=a,space=room,key=randomUUID())=>op(user,'accept',{space_id:space,quote_id:quote.id},key);
  const loan=(extra={})=>accept(preview(extra)).contract;
  const current=(space=room,user=a)=>s.credit.state(user,space).contract;
  const repay=(mode='due',extra={})=>op(a,'repay',{contract_id:current().id,expectedVersion:current().version,mode,...extra});
  const prize=(extra={},space=room,user=g)=>s.savePrize(user,{space_id:space,title:'旅行小基金',description:'出发前一起约好',emoji:'🧭',category:'travel',face_cents:1000,cost:100,stock:3,wait_days:0,active:true,...extra}).id;
  return {s,a,g,other,room,op,rules,preview,accept,loan,current,repay,prize,setDay,setTime:value=>{at=value;}};
}

test('默认关闭，只有对应发奖人可改规则；个人空间、超限和错误期限均不能借',t=>{
  const {s,a,g,other,room,op,rules,preview}=setup(t),initial=s.credit.state(a,room);
  assert.equal(initial.rules.enabled,false);assert.equal(initial.rules.limitCoins,300);assert.equal(initial.rules.annualBps,600);assert.equal(initial.canBorrow,false);
  assert.throws(()=>preview(),/没有开放/);assert.throws(()=>rules({},room,a),/发奖人/);assert.throws(()=>rules({},room,other),/开放/);
  assert.throws(()=>rules({},s.personalSpaceId(g.id),g),/个人空间/);assert.equal(s.credit.state(a,s.personalSpaceId(a.id)).supported,false);
  rules();assert.equal(s.credit.state(a,room).canBorrow,true);assert.throws(()=>preview({amountCoins:301}),/借款学习币/);assert.throws(()=>preview({amountCoins:1.5}),/整数/);
  assert.throws(()=>preview({termDays:8}),/7、14/);assert.throws(()=>rules({annualBps:1201}),/年化/);assert.throws(()=>rules({limitCoins:100001}),/额度/);
  assert.throws(()=>op(a,'preview',{space_id:s.personalSpaceId(a.id),kind:'loan',amountCoins:10,termDays:7}),/发奖人/);
});

test('Actual/365 以微币向下取整；3/6期等额本金余数只进最后一期',t=>{
  const {s,rules,prize,preview}=setup(t);rules();assert.equal(creditInterest(1,1200,7),0);assert.equal(creditInterest(100*COIN,600,7),115068);
  const pid=prize();for(const periods of [3,6]){const q=preview({kind:'installment',prize_id:pid,periods});
    assert.equal(q.installments.length,periods);assert.equal(q.installments.reduce((n,r)=>n+r.principal,0),100*COIN);
    assert.ok(q.installments.slice(0,-1).every(r=>r.principal===Math.floor(100*COIN/periods)));assert.equal(q.installments.at(-1).principal,100*COIN-Math.floor(100*COIN/periods)*(periods-1));
    q.installments.forEach((r,i)=>{assert.equal(r.interest,creditInterest(100*COIN-Math.floor(100*COIN/periods)*i,600,7));assert.equal(Date.parse(r.dueAt)-Date.parse(r.startsOn),7*DAY);});
    assert.equal(q.totalMax,100*COIN+q.installments.reduce((n,r)=>n+r.interest,0));
  }assert.equal(s.all('SELECT * FROM credit_contracts').length,0);assert.equal(s.all('SELECT * FROM ledger').length,0);
});

test('预览不发币不占库存；跨上海日历日、5分钟过期及规则变化均使报价失效',t=>{
  const {s,a,room,rules,preview,accept,setTime,setDay}=setup(t);rules();let q=preview();assert.equal(s.balance(room),0);assert.equal(s.credit.state(a,room).contract,null);
  setTime(Date.parse('2026-10-30T10:05:01+08:00'));assert.throws(()=>accept(q),/报价已过期/);
  setTime(Date.parse('2026-10-30T23:58:00+08:00'));q=preview();setTime(Date.parse('2026-10-31T00:00:01+08:00'));assert.throws(()=>accept(q),/报价已过期/);
  setDay(1);q=preview();rules({annualBps:500});assert.throws(()=>accept(q),/规则刚有变化/);assert.equal(s.balance(room),0);assert.equal(s.all('SELECT * FROM credit_contracts').length,0);
});

test('发币签约幂等且不能借新还旧，借款不增加 XP、earned 或未完成扣分基数',t=>{
  const {s,a,room,rules,preview,accept,loan}=setup(t);rules();const before=s.state(a,room),q=preview(),key=randomUUID();const first=accept(q,a,room,key);accept(q,a,room,key);
  assert.equal(s.balance(room),100*COIN);assert.equal(s.all('SELECT * FROM credit_contracts').length,1);assert.equal(s.all("SELECT * FROM ledger WHERE kind='credit_disbursement'").length,1);
  const after=s.state(a,room);assert.equal(after.pet.xp,before.pet.xp);assert.equal(after.earnedTotal,before.earnedTotal);assert.equal(after.earnedToday,before.earnedToday);assert.equal(after.taskSettlement.today.gross,before.taskSettlement.today.gross);
  assert.throws(()=>accept(q),/先还清/);assert.throws(()=>loan(),/先还清/);assert.equal(first.contract.payoffAmount,100*COIN);assert.equal(first.contract.interestAccrued,0);
});

test('同天结清只还本金；关闭借款功能不改旧合同，重复还款不重复扣币',t=>{
  const {s,a,room,op,rules,loan,current}=setup(t);rules();loan();rules({enabled:false,annualBps:1200,limitCoins:1});const c=current(),xp=s.pets.state(room).xp,key=randomUUID(),body={contract_id:c.id,mode:'payoff',expectedVersion:c.version};
  const result=op(a,'repay',body,key);op(a,'repay',body,key);assert.equal(result.paid,100*COIN);assert.equal(result.interest,0);assert.equal(result.contract.status,'paid');assert.equal(result.contract.futureInterestSaved,c.maxInterest);assert.equal(s.balance(room),0);assert.equal(s.pets.state(room).xp,xp);assert.equal(current(),null);assert.equal(s.all('SELECT * FROM credit_payments').length,1);
});

test('跨日版本失效；提前结清只计已过日历日，余额不足不能擅自部分提前还',t=>{
  const {s,room,rules,loan,current,repay,setDay}=setup(t);rules();const old=loan({termDays:30});setDay(2);
  assert.throws(()=>repay('payoff',{expectedVersion:old.version}),/刷新/);assert.equal(current().interestAccrued,creditInterest(100*COIN,600,2));
  assert.throws(()=>repay('payoff'),/不够一次结清/);assert.equal(s.balance(room),100*COIN);s.post(room,COIN,'test','测试补给','fixture');const c=current(),result=repay('payoff');
  assert.equal(result.paid,c.payoffAmount);assert.equal(result.contract.futureInterestSaved,creditInterest(100*COIN,600,30)-creditInterest(100*COIN,600,2));assert.equal(current(),null);
});

test('到期日可还不算逾期；次日未还才逾期，部分还款先计当期利息再还本金且不扣成负数',t=>{
  const {s,room,rules,loan,current,repay,setDay}=setup(t);rules();loan();s.post(room,-99*COIN,'test','模拟已消费','fixture');setDay(7);
  assert.equal(current().overdue,false);assert.equal(current().dueAmount,100*COIN+115068);const first=repay();assert.equal(first.paid,COIN);assert.equal(first.interest,115068);assert.equal(first.principal,884932);assert.equal(first.partial,true);assert.equal(s.balance(room),0);
  assert.throws(()=>repay(),/没有可用于还款/);setDay(8);assert.equal(current().overdue,true);const capped=current().payoffAmount;setDay(300);assert.equal(current().payoffAmount,capped);assert.equal(current().interestAccrued,115068);
});

test('分期购卡原子发卡和记债、不增加余额或 XP；首期到期前不要求还款',t=>{
  const {s,a,room,rules,prize,preview,accept,current,repay}=setup(t);rules();const pid=prize(),xp=s.pets.state(room).xp,q=preview({kind:'installment',prize_id:pid,periods:3});
  const result=accept(q);assert.equal(result.card.source,'installment');assert.equal(result.card.face_cents,1000);assert.equal(result.contract.cardId,result.card.id);assert.equal(s.balance(room),0);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',pid).stock,2);assert.equal(s.pets.state(room).xp,xp);assert.equal(s.state(a,room).earnedTotal,0);assert.equal(current().dueAmount,0);assert.throws(()=>repay(),/还没有到期/);
});

test('分期第一期付清后，第二期中提前结清只付该期已发生利息，不收第三期利息',t=>{
  const {s,room,rules,prize,preview,accept,current,repay,setDay}=setup(t);rules();accept(preview({kind:'installment',prize_id:prize(),periods:3}));setDay(7);
  const due=current().dueAmount;s.post(room,due,'test','首期补给','fixture');assert.equal(repay().paid,due);assert.equal(current().installments[0].paid,true);assert.equal(current().overdue,false);
  setDay(10);const c=current(),expected=creditInterest(100*COIN,600,7)+creditInterest(66666667,600,3);assert.equal(c.interestAccrued,expected);assert.equal(c.interestRemaining,creditInterest(66666667,600,3));
  s.post(room,c.payoffAmount,'test','结清补给','fixture');const closed=repay('payoff').contract;assert.equal(closed.status,'paid');assert.equal(closed.futureInterestSaved,c.maxInterest-expected);assert.ok(closed.installments.every(r=>r.remaining===0));
});

test('分期延迟归还不额外增加期息，最终期后利息严格封顶',t=>{
  const {rules,prize,preview,accept,current,setDay}=setup(t);rules();const q=preview({kind:'installment',prize_id:prize(),periods:6});accept(q);setDay(42);assert.equal(current().interestAccrued,q.maxInterest);assert.equal(current().dueAmount,q.totalMax);setDay(800);assert.equal(current().interestAccrued,q.maxInterest);assert.equal(current().dueAmount,q.totalMax);
});

test('有合同即暂停付费抽奖、免费票可用；逾期暂停商城但不拦任务、还款和旧卡核销',t=>{
  const {s,a,g,room,rules,loan,prize,setDay}=setup(t);rules();const pid=prize({cost:10});prize({channel:'lottery',cost:20,weight:10});loan();s.postTickets(room,2,'test','测试机会','fixture');
  assert.throws(()=>s.tx(()=>s.draw(a,{space_id:room,mode:'coins'})),/免费机会/);assert.equal(s.tx(()=>s.draw(a,{space_id:room,mode:'ticket'},()=>0)).mode,'ticket');
  const card=s.tx(()=>s.buy(a,{space_id:room,prize_id:pid})).card;setDay(7);assert.doesNotThrow(()=>s.tx(()=>s.buy(a,{space_id:room,prize_id:pid})));setDay(8);
  assert.throws(()=>s.tx(()=>s.buy(a,{space_id:room,prize_id:pid})),/逾期账单/);assert.doesNotThrow(()=>s.tx(()=>s.draw(a,{space_id:room,mode:'ticket'},()=>0)));
  const tid=s.tx(()=>s.createTasks(a,{space_id:room,tasks:[{title:'继续完成学习计划',recurrence:'daily'}]})).ids[0];assert.doesNotThrow(()=>s.tx(()=>s.complete(a,{space_id:room,task_id:tid,done:true})));
  const request=s.tx(()=>s.redeem(a,{space_id:room,card_id:card.id,receipt_note:'已完成约定购买',claim_cents:1000}));assert.doesNotThrow(()=>s.tx(()=>s.fulfill(g,{card_id:card.id,token:request.token,expectedVersion:1,paid_cents:1000,note:'确认报销'})));
});

test('发卡过程中失败，债务、本金、库存、卡片和报价消耗全部回滚；价格库存变化须重新报价',t=>{
  const {s,rules,prize,preview,accept}=setup(t);rules();const pid=prize(),q=preview({kind:'installment',prize_id:pid,periods:3});const issue=s.issue;
  s.issue=function(...args){issue.apply(this,args);throw new Error('模拟发卡失败');};assert.throws(()=>accept(q),/模拟发卡失败/);s.issue=issue;
  assert.equal(s.all('SELECT * FROM credit_contracts').length,0);assert.equal(s.all('SELECT * FROM ledger').length,0);assert.equal(s.all('SELECT * FROM cards').length,0);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',pid).stock,3);assert.equal(s.get('SELECT consumed FROM credit_quotes WHERE id=?',q.id).consumed,null);
  s.run('UPDATE prizes SET stock=2 WHERE id=?',pid);assert.throws(()=>accept(q),/库存或内容/);const q2=preview({kind:'installment',prize_id:pid,periods:3});s.run('UPDATE prizes SET cost=cost+? WHERE id=?',COIN,pid);assert.throws(()=>accept(q2),/价格/);assert.equal(s.all('SELECT * FROM credit_contracts').length,0);
});

test('房间、借款人、管家隔离；停用规则后仍能还旧合同；减免须理由、通知且不能自己减免',t=>{
  const {s,a,g,other,room,op,rules,loan,current,setDay}=setup(t);rules();loan();const foreign=s.pair(other.id,g.id).space_id;
  assert.equal(s.credit.state(g,room).contract.id,current().id);assert.throws(()=>s.credit.state(other,room),/没有向你开放/);assert.equal(s.credit.state(g,foreign).contract,null);
  assert.throws(()=>op(g,'repay',{contract_id:current().id,mode:'due',expectedVersion:current().version}),/领奖人/);assert.throws(()=>op(a,'repay',{space_id:s.personalSpaceId(a.id),contract_id:current().id,mode:'payoff',expectedVersion:current().version}),/不属于当前/);
  setDay(2);rules({enabled:false});let c=current();assert.throws(()=>op(g,'waive',{contract_id:c.id,expectedVersion:c.version,reason:' '}),/减免说明/);assert.throws(()=>op(other,'waive',{contract_id:c.id,expectedVersion:c.version,reason:'测试'}),/开放/);
  const balance=s.balance(room),result=op(g,'waive',{contract_id:c.id,expectedVersion:c.version,reason:'这次学习体验到这里，不需要继续偿还'});assert.equal(result.contract.status,'waived');assert.equal(result.contract.waivedPrincipal,100*COIN);assert.equal(result.contract.waivedInterest,creditInterest(100*COIN,600,2));assert.equal(s.balance(room),balance);assert.equal(current(),null);
  assert.equal(s.get("SELECT COUNT(*) n FROM mailbox WHERE subject='学习币账单已减免'").n,2);assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='credit.waive'").n,1);
});

test('关闭申请与最终关闭都要求结清；已开始商量关闭时不能再签新债',t=>{
  const {s,a,g,room,rules,loan,preview,accept}=setup(t);rules();const q=preview(),request=s.tx(()=>s.community.requestClose(a,{space_id:room,mode:'deleted'}));assert.throws(()=>accept(q),/商量关闭/);
  s.tx(()=>s.community.cancelClose(a,{request_id:request.request_id}));loan();assert.throws(()=>s.tx(()=>s.community.requestClose(a,{space_id:room,mode:'deleted'})),/未结清/);
  // A legacy/in-flight close still cannot bypass the final guard.
  s.run("UPDATE room_closures SET status='pending' WHERE id=?",request.request_id);s.run("UPDATE room_close_votes SET decision='accepted' WHERE request_id=?",request.request_id);
  assert.throws(()=>s.tx(()=>s.community.finishClose(g,request.request_id)),/未结清/);assert.equal(s.get('SELECT status FROM spaces WHERE id=?',room).status,'active');
});

test('朋友家庭共用规则但个人负债隔离，普通家人看不到别人的合同；转家长与自减免被拦截',t=>{
  const {s,a,g,other,op,rules,preview,accept}=setup(t),room=s.tx(()=>s.community.createFamily(a,{name:'一起学习',mode:'friends'})).space_id;
  const join=u=>{const invitation=s.tx(()=>s.community.familyInvite(a,{space_id:room}));return s.tx(()=>s.acceptInvite(u,invitation.code)).space_id;};const gRoom=join(g),oRoom=join(other);
  rules({},room,a);assert.equal(s.credit.rules(gRoom).enabled,true);const mine=accept(preview({},room,a),a,room).contract;accept(preview({},oRoom,other),other,oRoom);
  assert.notEqual(s.credit.state(other,oRoom).contract.id,mine.id);assert.equal(s.credit.state(g,room),null);assert.equal(s.credit.state(a,oRoom).contract.principal,100*COIN);
  assert.throws(()=>op(a,'waive',{space_id:room,contract_id:mine.id,expectedVersion:mine.version,reason:'自己免除'}),/不能给自己减免/);
  assert.throws(()=>s.tx(()=>s.familyPlay.mode(a,{space_id:room,mode:'guardian',expected_mode:'friends'})),/先结清/);
  s.tx(()=>s.community.setAdmins(a,{space_id:room,user_ids:[a.id,g.id],expected_admins:[a.id]}));assert.equal(s.credit.state(g,room).contract.canWaive,true);
  const c=s.credit.state(g,room).contract;op(g,'waive',{space_id:room,contract_id:c.id,expectedVersion:c.version,reason:'共同决定结束这次体验'});
  s.tx(()=>s.familyPlay.mode(a,{space_id:room,mode:'guardian',expected_mode:'friends'}));assert.equal(s.credit.state(a,room).canBorrow,false);
  assert.throws(()=>s.tx(()=>s.community.setAdmins(a,{space_id:room,user_ids:[a.id,other.id],expected_admins:[a.id,g.id]})),/先结清/);
});

test('v21升级不增发币和债务、不改旧数据，重启保存合同且迁移幂等',t=>{
  const dir=mkdtempSync(join(tmpdir(),'starlight-credit-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));const path=join(dir,'db.sqlite');let s=new Store(path);
  const a=s.newUser({username:'oldcredit',name:'原领奖人',password:''}),g=s.newUser({username:'oldgiver',name:'原发奖人',password:''}),room=s.pair(a.id,g.id).space_id;a.space_id=room;s.post(room,123*COIN,'test','原有余额','fixture');const users=s.all('SELECT * FROM users'),ledger=s.all('SELECT * FROM ledger');
  s.db.exec('DROP TABLE credit_requests;DROP TABLE credit_days;DROP TABLE credit_payments;DROP TABLE credit_installments;DROP TABLE credit_contracts;DROP TABLE credit_quotes;DROP TABLE credit_rules;PRAGMA user_version=21');s.db.close();s=new Store(path);stableReadiness(s);
  assert.equal(s.get('PRAGMA user_version').user_version,23);assert.deepEqual(s.all('SELECT * FROM users'),users);assert.deepEqual(s.all('SELECT * FROM ledger'),ledger);assert.equal(s.all('SELECT * FROM credit_contracts').length,0);assert.equal(s.credit.state(a,room).rules.enabled,false);
  s.tx(()=>s.credit.saveRules(g,{space_id:room,enabled:true,limitCoins:300,annualBps:600,expectedVersion:s.credit.rules(room).version}));const q=s.tx(()=>s.credit.preview(a,{space_id:room,kind:'loan',amountCoins:20,termDays:14})).quote;s.tx(()=>s.credit.accept(a,{space_id:room,quote_id:q.id}));s.db.close();s=new Store(path);
  try{assert.equal(s.balance(room),143*COIN);assert.equal(s.credit.state(a,room).contract.principal,20*COIN);assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);assert.equal(s.get('PRAGMA integrity_check').integrity_check,'ok');}finally{s.db.close();}
});

test('真实HTTP预览签约与还款幂等，CSRF和本人权限不因新增接口而放宽',async t=>{
  const {server,store:s}=await createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));
  const {a,g,room,rules}=setup(t,{store:s,close:false});rules();const session=s.session(a.id),giver=s.session(g.id),origin='http://127.0.0.1:'+server.address().port;
  const call=(action,body,key=randomUUID(),sess=session,csrf=sess.csrf)=>fetch(origin+'/api/credit/'+action,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:'starlight_session='+sess.token,'X-CSRF-Token':csrf,'Idempotency-Key':key},body:JSON.stringify({space_id:room,...body})});
  assert.equal((await call('preview',{kind:'loan',amountCoins:100,termDays:7},randomUUID(),session,'wrong')).status,403);assert.equal((await call('preview',{kind:'loan',amountCoins:100,termDays:7},randomUUID(),giver)).status,403);
  const quote=(await(await call('preview',{kind:'loan',amountCoins:100,termDays:7})).json()).quote,key=randomUUID();const replies=await Promise.all([call('accept',{quote_id:quote.id},key),call('accept',{quote_id:quote.id},key)]);assert.ok(replies.every(r=>r.status===200));assert.equal(s.balance(room),100*COIN);assert.equal(s.all('SELECT * FROM credit_contracts').length,1);
  const c=s.credit.state(a,room).contract,repayKey=randomUUID(),body={contract_id:c.id,mode:'payoff',expectedVersion:c.version};const repaid=await Promise.all([call('repay',body,repayKey),call('repay',body,repayKey)]);assert.ok(repaid.every(r=>r.status===200));assert.equal(s.balance(room),0);assert.equal(s.all('SELECT * FROM credit_payments').length,1);
});
