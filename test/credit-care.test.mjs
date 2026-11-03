import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {migrate} from '../lib/migrate.mjs';
const DAY=86400000,START=Date.parse('2026-11-03T12:00:00+08:00');
function fixture(t){
 let clock=START;t.mock.method(Date,'now',()=>clock);const s=new Store(':memory:');t.after(()=>s.db.close());s.credit.clock=()=>clock;
 const a=s.newUser({username:'care_a',name:'小芽',password:''}),g=s.newUser({username:'care_g',name:'晴天',password:''}),o=s.newUser({username:'care_o',name:'另一位',password:''}),room=s.pair(a.id,g.id).space_id;a.space_id=room;
 s.run('UPDATE spaces SET created=? WHERE id=?',new Date(START-29*DAY).toISOString(),room);s.run("UPDATE settings SET value=? WHERE key='credit_readiness_start'",dayAt(START-28*DAY));s.run("UPDATE settings SET value='2099-01-01' WHERE key IN ('task_settlement_start','daily_penalty_start')");
 for(let n=28;n>0;n--){const day=dayAt(START-n*DAY);s.run("INSERT INTO credit_days VALUES(?,?,'[]',?,5,5,1,1,100,?,?)",room,day,100*COIN,day,day);}
 const call=(method,b={},u=a,key=randomUUID())=>{const body={space_id:room,...b};return s.operation(u,key,'/api/credit/'+method,body,()=>typeof s.credit[method]==='function'?s.credit[method](u,body):s.credit.support[method](u,body));};
 call('saveRules',{enabled:true,limitCoins:5000,specialLimitCoins:10000,annualBps:600,expectedVersion:s.credit.rules(room).version},g);
 const current=(u=a)=>s.credit.contract(s.credit.active(room),u),state=(u=a)=>s.credit.state(u,room),at=n=>{clock=START+n*DAY;},cash=n=>s.post(room,n*COIN,'test','测试余额',randomUUID());
 const preview=b=>call('preview',b).quote,accept=q=>call('accept',{quote_id:q.id});
 const start=(b={})=>{let q=preview({kind:'loan',amountCoins:100,termDays:7,...b}),r=accept(q);if(r.approvalPending){call('respond',{request_id:r.request.id,approve:true,expectedVersion:r.request.version},g);q=preview({request_id:r.request.id});r=accept(q);}return r;};
 const act=(method,b={},u=a)=>call(method,{contract_id:current(u).id,expectedVersion:current(u).version,...b},u);
 const prize=(cost=10000)=>s.savePrize(g,{space_id:room,title:'一部学习手机',description:'双方约定型号后实际交付',emoji:'📱',category:'custom',face_cents:200000,cost,stock:2,wait_days:0,active:true}).id;
 const special=(periods=24)=>{cash(3000);return start({kind:'installment',prize_id:prize(),periods,periodDays:30,downPaymentCoins:3000});};
 const deliver=()=>{act('delivery',{action:'confirm'},g);act('delivery',{action:'confirm'});};
 return {s,a,g,o,room,call,current,state,at,cash,preview,accept,start,act,prize,special,deliver};
}

test('24/36期专项可超过现金信用档位；首付和用途锁定，双人交付前不计息、不发卡',t=>{
 const f=fixture(t);for(const n of [12,24,36])assert.equal(f.preview({kind:'installment',prize_id:f.prize(),periods:n,periodDays:30}).principal,10000*COIN);
 assert.throws(()=>f.preview({kind:'loan',amountCoins:10000,periods:36,periodDays:30}));assert.throws(()=>f.preview({kind:'installment',prize_id:f.prize(),periods:24,periodDays:7}));
 const r=f.special();assert.equal(r.contract.delivery,'waiting');assert.equal(r.contract.principal,7000*COIN);assert.equal(r.contract.downPayment,3000*COIN);assert.equal(f.s.balance(f.room),0);assert.equal(f.s.all('SELECT * FROM cards').length,0);assert.equal(f.s.pets.state(f.room).xp,0);
 f.at(90);assert.equal(f.current().dueAmount,0);assert.equal(f.current().interestAccrued,0);assert.throws(()=>f.act('repay',{mode:'payoff'}),/尚未交付/);f.deliver();const c=f.current();assert.equal(c.delivery,'received');assert.equal(c.startedAt,dayAt(START+90*DAY));assert.equal(c.installments[0].dueAt,dayAt(START+120*DAY));assert.equal(f.s.get('SELECT status FROM cards WHERE id=?',c.cardId).status,'fulfilled');assert.equal(f.s.get('SELECT stock FROM prizes WHERE id=?',c.prizeId).stock,1);
});

test('专项取消原子退款与释放库存；一方确认后必须双方同意取消，不可顺便拿到免费奖品',t=>{
 const f=fixture(t);f.special();const cid=f.current().id,pid=f.current().prizeId;f.act('delivery',{action:'confirm'},f.g);f.act('delivery',{action:'cancel'});assert.equal(f.s.balance(f.room),0);assert.equal(f.current().delivery,'waiting');f.act('delivery',{action:'cancel'},f.g);assert.equal(f.s.balance(f.room),3000*COIN);assert.equal(f.current(),null);assert.equal(f.s.get('SELECT stock FROM prizes WHERE id=?',pid).stock,2);assert.equal(f.s.all('SELECT * FROM cards').length,0);assert.throws(()=>f.call('delivery',{contract_id:cid,action:'cancel',expectedVersion:''}),/变化|等待/);assert.equal(f.s.balance(f.room),3000*COIN);
});

test('保管仅在逾期执行；补齐利息可结束但本金保留，同一期不能重复执行，跨屋无权限',t=>{
 const f=fixture(t);f.special();f.deliver();assert.throws(()=>f.act('consequence',{action:'start',days:7},f.g),/逾期/);f.at(31);assert.throws(()=>f.act('consequence',{action:'start',days:8},f.g));assert.throws(()=>f.act('consequence',{action:'start',days:7},f.o));
 f.act('consequence',{action:'start',days:7},f.g);let c=f.current();assert.equal(c.consequence.status,'active');assert.throws(()=>f.act('consequence',{action:'start',days:7},f.g),/叠加/);const due=c.dueInterest;f.cash(100);f.act('repay',{mode:'interest',amountCoins:due/COIN});c=f.current();assert.equal(c.consequence.status,'ended');assert.equal(c.principalRemaining,7000*COIN);assert.equal(c.dueInterest,0);assert.ok(c.dueAmount>0);
 f.act('consequence',{action:'return',event_id:c.consequence.id},f.g);assert.throws(()=>f.act('consequence',{action:'start',days:7},f.g));assert.equal(f.s.all('SELECT * FROM credit_consequences').length,1);
});

test('最长七天自动结束，旧合同不能追加惩罚；无罚息、未还本金仍逐期累积',t=>{
 const f=fixture(t);f.start({kind:'loan',amountCoins:1000,periods:12,periodDays:30,releaseCondition:'arrears'});f.at(31);f.act('consequence',{action:'start',days:7},f.g);const first=f.current().dueAmount;f.at(38);assert.equal(f.current().consequence.ended_reason,'expired');assert.ok(f.current().dueAmount>=first);f.at(61);assert.ok(f.current().dueAmount>first);assert.ok(f.current().interestAccrued<=f.current().maxInterest);
 const cid=f.current().id;f.s.run('DELETE FROM credit_agreements WHERE contract_id=?',cid);assert.throws(()=>f.act('consequence',{action:'start',days:7},f.g),/事先约定/);
});

test('部分偿还到期利息不碰本金，偿还到期款可自己留币，重复请求不重复扣款',t=>{
 const f=fixture(t);f.start();f.at(8);let c=f.current();const body={contract_id:c.id,expectedVersion:c.version,mode:'interest',amountCoins:.01},key=randomUUID();f.call('repay',body,f.a,key);f.call('repay',body,f.a,key);assert.equal(f.s.balance(f.room),99.99*COIN);assert.equal(f.current().principalRemaining,100*COIN);assert.equal(f.current().paidInterest,.01*COIN);f.act('repay',{mode:'due',amountCoins:10});assert.equal(f.s.balance(f.room),89.99*COIN);assert.ok(f.current().principalRemaining<100*COIN);
});

test('双方确认免新增利息的补还方案；减免和已还记录保留，不能套出新币或重复免息',t=>{
 const f=fixture(t);f.start({kind:'loan',amountCoins:1000,periods:3,periodDays:30});f.at(31);f.act('repay',{mode:'due',amountCoins:100});const before=f.current(),balance=f.s.balance(f.room),xp=f.s.pets.state(f.room).xp;
 f.act('offer',{periods:24,waiveCoins:100,waiveInterest:false,reason:'把每期安排放慢一点'},f.g);const offer=f.current().recoveryOffer;assert.equal(f.current().dueAmount,before.dueAmount);f.call('respondRecovery',{contract_id:before.id,recovery_id:offer.id,accept:true});let c=f.current();assert.equal(c.principalRemaining,before.principalRemaining-100*COIN);assert.equal(c.interestRemaining,before.interestRemaining);assert.equal(c.periods,24);assert.equal(c.dueAmount,0);assert.equal(c.paidPrincipal,before.paidPrincipal);assert.equal(c.paidInterest,before.paidInterest);assert.equal(f.s.balance(f.room),balance);assert.equal(f.s.pets.state(f.room).xp,xp);assert.equal(c.waivedPrincipal,100*COIN);
 f.at(62);c=f.current();assert.equal(c.interestRemaining,before.interestRemaining);f.act('repay',{mode:'due',amountCoins:20});const after=f.current();assert.ok(after.principalRemaining<c.principalRemaining);assert.ok(after.paidPrincipal>before.paidPrincipal);f.cash(1000);f.act('repay',{mode:'payoff'});assert.equal(f.current(),null);const closed=f.s.credit.contract(f.s.get('SELECT * FROM credit_contracts WHERE id=?',before.id));assert.equal(closed.status,'paid');assert.equal(closed.paidPrincipal+closed.waivedPrincipal,1000*COIN);
});

test('还款会使旧补还报价失效，拒绝方案不改账，减免剩余欠款可结束已重排合同',t=>{
 const f=fixture(t);f.start();f.at(8);f.act('offer',{periods:3,waiveCoins:0,waiveInterest:true,reason:'先缓一缓'},f.g);const offered=f.current().recoveryOffer;f.act('repay',{mode:'due',amountCoins:1});assert.throws(()=>f.call('respondRecovery',{contract_id:f.current().id,recovery_id:offered.id,accept:true}),/重新测算/);
 f.act('offer',{periods:3,waiveCoins:0,waiveInterest:true,reason:'重新核对'},f.g);let o=f.current().recoveryOffer;f.call('respondRecovery',{contract_id:f.current().id,recovery_id:o.id,accept:false});assert.ok(f.current().dueAmount>0);
 f.act('offer',{periods:3,waiveCoins:1,waiveInterest:true,reason:'再慢一点'},f.g);o=f.current().recoveryOffer;const cid=f.current().id;f.call('respondRecovery',{contract_id:cid,recovery_id:o.id,accept:true});f.act('waive',{reason:'这次作为阶段奖励'},f.g);assert.equal(f.current(),null);const c=f.s.credit.contract(f.s.get('SELECT * FROM credit_contracts WHERE id=?',cid));assert.equal(c.paidPrincipal+c.waivedPrincipal,100*COIN);assert.ok(c.interestAccrued<=c.maxInterest);
});

test('减免方案失败整笔回滚；迁移保留已有合同与账本，可重复运行',t=>{
 const f=fixture(t);f.start();f.at(8);f.act('offer',{periods:12,waiveCoins:0,waiveInterest:true,reason:'恢复节奏'},f.g);const o=f.current().recoveryOffer,old=f.s.all('SELECT * FROM credit_contracts'),ledger=f.s.all('SELECT * FROM ledger');
 f.s.db.exec("CREATE TRIGGER fail_recovery BEFORE INSERT ON room_audit WHEN NEW.action='credit.recovery.accept' BEGIN SELECT RAISE(ABORT,'audit failed'); END");assert.throws(()=>f.call('respondRecovery',{contract_id:f.current().id,recovery_id:o.id,accept:true}),/audit failed/);assert.deepEqual(f.s.all('SELECT * FROM credit_contracts'),old);assert.deepEqual(f.s.all('SELECT * FROM ledger'),ledger);f.s.db.exec('DROP TRIGGER fail_recovery; PRAGMA user_version=24');migrate(f.s.db);migrate(f.s.db);assert.equal(f.s.get('PRAGMA user_version').user_version,25);assert.deepEqual(f.s.all('SELECT * FROM credit_contracts'),old);
});

test('到期结束后同一账单不可再罚，后一期也需先归还；结清后仍可确认归还',t=>{
 const f=fixture(t);f.start({kind:'loan',amountCoins:1000,periods:12,periodDays:30,releaseCondition:'arrears'});f.at(31);f.act('consequence',{action:'start',days:7},f.g);f.at(39);let c=f.current();f.act('consequence',{action:'return',event_id:c.consequence.id},f.g);assert.throws(()=>f.act('consequence',{action:'start',days:7},f.g),/这期账单/);
 f.at(61);f.act('consequence',{action:'start',days:7},f.g);f.cash(1000);const cid=f.current().id;f.act('repay',{mode:'payoff'});assert.equal(f.current(),null);c=f.state(f.g).pendingReturns[0];assert.equal(c.id,cid);assert.equal(c.consequence.status,'ended');f.call('consequence',{contract_id:cid,expectedVersion:c.version,action:'return',event_id:c.consequence.id},f.g);assert.equal(f.state(f.g).pendingReturns.length,0);
});

test('连续两次重排不重复减免利息，累计实付与免除严格等于原债务',t=>{
 const f=fixture(t);f.start({kind:'loan',amountCoins:1000,periods:3,periodDays:30});f.at(31);f.act('repay',{mode:'due',amountCoins:30});const original=f.current();
 for(const [n,day] of [[1,31],[2,62]]){f.at(day);f.act('offer',{periods:12,waiveCoins:10,waiveInterest:true,reason:'分段恢复'},f.g);let c=f.current();f.call('respondRecovery',{contract_id:c.id,recovery_id:c.recoveryOffer.id,accept:true});c=f.current();assert.equal(c.interestRemaining,0);assert.equal(c.interestAccrued,original.interestAccrued);assert.equal(c.waivedPrincipal,n*10*COIN);if(n===1){f.at(61);f.act('repay',{mode:'due',amountCoins:20});}}
 const cid=f.current().id;f.act('waive',{reason:'奖励这个阶段的坚持'},f.g);const c=f.s.credit.contract(f.s.get('SELECT * FROM credit_contracts WHERE id=?',cid));assert.equal(c.paidPrincipal+c.waivedPrincipal,1000*COIN);assert.equal(c.paidInterest+c.waivedInterest+c.futureInterestSaved,c.maxInterest);
});

test('零息默认恢复条件为本息；旧合同求助不会补出惩罚约定；过期方案不生效',t=>{
 const f=fixture(t);f.call('saveRules',{enabled:true,limitCoins:5000,annualBps:0,expectedVersion:f.s.credit.rules(f.room).version},f.g);f.start();assert.equal(f.current().agreement.releaseCondition,'arrears');const cid=f.current().id;f.s.run('DELETE FROM credit_agreements WHERE contract_id=?',cid);f.act('help',{reason:'希望慢一点'});assert.equal(f.current().agreement,null);assert.throws(()=>f.act('help',{reason:'再寄一次'}),/今天已经/);f.act('offer',{periods:3,waiveCoins:0,waiveInterest:true,reason:'慢慢来'},f.g);const rid=f.current().recoveryOffer.id;f.at(8);assert.throws(()=>f.call('respondRecovery',{contract_id:cid,recovery_id:rid,accept:true}),/过期/);assert.throws(()=>f.act('consequence',{action:'start'},f.g),/事先约定/);
});

test('交付或保管审计失败时回滚卡片、账本和约定状态',t=>{
 const f=fixture(t);f.special();f.act('delivery',{action:'confirm'},f.g);const before=f.current();f.s.db.exec("CREATE TRIGGER fail_delivery BEFORE INSERT ON room_audit WHEN NEW.action='credit.delivery' BEGIN SELECT RAISE(ABORT,'audit failed'); END");assert.throws(()=>f.act('delivery',{action:'confirm'}),/audit failed/);assert.equal(f.current().delivery,'waiting');assert.equal(f.s.all('SELECT * FROM cards').length,0);assert.equal(f.current().version,before.version);f.s.db.exec('DROP TRIGGER fail_delivery');f.act('delivery',{action:'confirm'});f.at(31);f.s.db.exec("CREATE TRIGGER fail_penalty BEFORE INSERT ON room_audit WHEN NEW.action='credit.consequence.start' BEGIN SELECT RAISE(ABORT,'audit failed'); END");assert.throws(()=>f.act('consequence',{action:'start'},f.g),/audit failed/);assert.equal(f.current().consequence,null);
});
