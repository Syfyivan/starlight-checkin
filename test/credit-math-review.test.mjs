import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';

// Independent fixed-value review: expected amounts below are literal micro-coins,
// not calculated by creditInterest or the production schedule helper.
function fixture(t,{annualBps=600}={}){
  const s=new Store(':memory:');t.after(()=>s.db.close());
  const learner=s.newUser({username:'math_learner',name:'算例领奖人',password:''});
  const giver=s.newUser({username:'math_giver',name:'算例发奖人',password:''});
  const space=s.pair(learner.id,giver.id).space_id;learner.space_id=space;
  let timestamp=Date.parse('2026-10-30T12:00:00+08:00');s.credit.clock=()=>timestamp;
  const at=days=>{timestamp=Date.parse('2026-10-30T12:00:00+08:00')+days*86400000;};
  const call=(method,body={},user=learner)=>s.operation(user,randomUUID(),'/review/credit/'+method,{space_id:space,...body},()=>s.credit[method](user,{space_id:space,...body}));
  call('saveRules',{enabled:true,limitCoins:10000,annualBps,expectedVersion:s.credit.rules(space).version},giver);
  const current=()=>s.credit.state(learner,space).contract;
  const fund=units=>s.post(space,units,'review_funding','独立算例资金',randomUUID());
  const borrow=(coins=1000,termDays=14)=>{
    const quote=call('preview',{kind:'loan',amountCoins:coins,termDays}).quote;
    return {quote,...call('accept',{quote_id:quote.id})};
  };
  const finance=(cost=1200,periods=3)=>{
    const prize=s.savePrize(giver,{space_id:space,title:'独立算例体验',description:'数学验证用',emoji:'券',category:'experience',face_cents:0,cost,stock:3,wait_days:0,active:true}).id;
    const quote=call('preview',{kind:'installment',prize_id:prize,periods}).quote;
    return {quote,...call('accept',{quote_id:quote.id})};
  };
  const repay=(mode='due')=>{const c=current();return call('repay',{contract_id:c.id,expectedVersion:c.version,mode});};
  const ledgerBalance=()=>s.all('SELECT amount FROM ledger WHERE space_id=?',space).reduce((sum,r)=>sum+r.amount,0);
  return {s,learner,giver,space,at,call,current,fund,borrow,finance,repay,ledgerBalance,setTime:value=>{timestamp=Date.parse(value);}};
}

test('independent: 1000 coins at 6%, fourteen-day ceiling and day-five payoff',t=>{
  const f=fixture(t),{quote}=f.borrow();
  assert.equal(quote.maxInterest,2301369);assert.equal(quote.totalMax,1002301369);
  f.at(5);let c=f.current();assert.equal(c.interestAccrued,821917);assert.equal(c.payoffAmount,1000821917);
  f.fund(821917);const paid=f.repay('payoff');
  assert.equal(paid.paid,1000821917);assert.equal(paid.principal,1000000000);assert.equal(paid.interest,821917);
  assert.equal(paid.contract.futureInterestSaved,1479452);assert.equal(paid.contract.status,'paid');
  assert.equal(f.s.balance(f.space),0);assert.equal(f.ledgerBalance(),0);
  f.at(100);c=f.s.credit.state(f.learner,f.space).history[0];
  assert.equal(c.interestAccrued,821917);assert.equal(c.payoffAmount,0);assert.equal(c.paidInterest+c.futureInterestSaved,c.maxInterest);
});

test('independent: paying less than first-period interest, then a partial bill, never capitalizes interest',t=>{
  const f=fixture(t),{quote}=f.finance();
  assert.deepEqual(quote.installments.map(r=>r.interest),[1380821,920547,460273]);assert.equal(quote.maxInterest,2761641);
  f.at(7);f.fund(500000);let paid=f.repay();
  assert.equal(paid.interest,500000);assert.equal(paid.principal,0);assert.equal(paid.partial,true);assert.equal(f.s.balance(f.space),0);
  assert.equal(f.current().principalRemaining,1200000000);assert.equal(f.current().dueAmount,400880821);
  f.at(10);assert.equal(f.current().interestAccrued,1775341);assert.equal(f.current().interestRemaining,1275341);
  f.fund(100000000);paid=f.repay();
  assert.equal(paid.interest,880821);assert.equal(paid.principal,99119179);assert.equal(f.current().principalRemaining,1100880821);
  assert.equal(f.current().interestRemaining,394520);assert.equal(f.current().payoffAmount,1101275341);
  assert.equal(f.current().installments[1].paidPrincipal,0);assert.equal(f.current().installments[2].paidPrincipal,0);
  f.fund(1101275341);paid=f.repay('payoff');
  assert.equal(paid.contract.paidPrincipal,1200000000);assert.equal(paid.contract.paidInterest,1775341);
  assert.equal(paid.contract.futureInterestSaved,986300);assert.equal(f.s.balance(f.space),0);
  assert.equal(f.s.all('SELECT interest FROM credit_payments').reduce((n,r)=>n+r.interest,0),1775341);
  assert.equal(f.ledgerBalance(),0);
});

test('independent: overdue bills allocate oldest interest then principal and never exceed the quote',t=>{
  const f=fixture(t),{quote}=f.finance();f.at(15);f.fund(500000000);
  assert.equal(f.current().interestAccrued,2367121);assert.equal(f.current().dueAmount,802301368);
  let paid=f.repay();assert.equal(paid.interest,2301368);assert.equal(paid.principal,497698632);
  const payments=JSON.parse(f.s.get('SELECT allocation FROM credit_payments').allocation);
  assert.deepEqual(payments,[{number:1,principal:400000000,interest:1380821},{number:2,principal:97698632,interest:920547}]);
  assert.equal(f.current().installments[2].paidPrincipal,0);assert.equal(f.current().dueAmount,302301368);
  f.at(21);let c=f.current();assert.equal(c.interestAccrued,quote.maxInterest);assert.equal(c.dueAmount,702761641);
  f.at(300);assert.equal(f.current().payoffAmount,702761641);assert.equal(f.current().interestRemaining,460273);
  f.fund(702761641);paid=f.repay();assert.equal(paid.contract.status,'paid');
  assert.equal(paid.contract.paidPrincipal,1200000000);assert.equal(paid.contract.paidInterest,2761641);
  assert.equal(paid.contract.futureInterestSaved,0);assert.equal(f.s.balance(f.space),0);assert.equal(f.ledgerBalance(),0);
});

test('independent: six cumulative period floors form the disclosed exact ceiling',t=>{
  const f=fixture(t),{quote}=f.finance(600,6);
  assert.deepEqual(quote.installments.map(r=>r.principal),Array(6).fill(100000000));
  assert.deepEqual(quote.installments.map(r=>r.interest),[690410,575342,460273,345205,230136,115068]);
  assert.equal(quote.maxInterest,2416434);assert.equal(quote.totalMax,602416434);
  f.at(300);assert.equal(f.current().payoffAmount,602416434);f.fund(602416434);
  const result=f.repay();assert.equal(result.interest,2416434);assert.equal(result.principal,600000000);
  assert.equal(f.s.balance(f.space),0);assert.equal(f.ledgerBalance(),0);
});

test('independent: zero-rate micro-coin remainder is preserved and a tiny due payment cannot overspend',t=>{
  const f=fixture(t,{annualBps:0}),{quote}=f.finance(1,3);
  assert.deepEqual(quote.installments.map(r=>r.principal),[333333,333333,333334]);assert.equal(quote.maxInterest,0);
  f.at(21);f.fund(1);let result=f.repay();assert.equal(result.paid,1);assert.equal(result.principal,1);assert.equal(result.interest,0);
  assert.equal(f.current().payoffAmount,999999);assert.equal(f.s.balance(f.space),0);
  f.fund(999999);result=f.repay();assert.equal(result.contract.paidPrincipal,COIN);assert.equal(result.contract.status,'paid');
  assert.equal(f.s.balance(f.space),0);assert.equal(f.ledgerBalance(),0);
});

test('independent: Shanghai midnight advances one day and invalidates a prior payoff amount',t=>{
  const f=fixture(t);f.setTime('2026-10-30T23:59:59+08:00');f.borrow();const before=f.current();
  assert.equal(before.interestRemaining,0);f.setTime('2026-10-31T00:00:01+08:00');
  assert.equal(f.current().interestRemaining,164383);
  assert.throws(()=>f.call('repay',{contract_id:before.id,expectedVersion:before.version,mode:'payoff'}),/刷新/);
  assert.equal(f.s.balance(f.space),1000000000);assert.equal(f.s.all('SELECT * FROM credit_payments').length,0);
  f.at(14);assert.equal(f.current().interestRemaining,2301369);f.at(100);assert.equal(f.current().interestRemaining,2301369);
});

test('independent: waiver after partial interest repayment does not debit funds or double count paid interest',t=>{
  const f=fixture(t);f.borrow();f.fund(-1000000000);f.at(14);f.fund(1000000);f.repay();
  assert.equal(f.current().paidInterest,1000000);assert.equal(f.current().principalRemaining,1000000000);
  assert.equal(f.current().interestRemaining,1301369);f.at(90);const c=f.current(),balance=f.s.balance(f.space);
  assert.throws(()=>f.call('waive',{contract_id:c.id,expectedVersion:c.version,reason:'本人请求'},f.learner),/发奖人/);
  const result=f.call('waive',{contract_id:c.id,expectedVersion:c.version,reason:'结束独立数学算例'},f.giver).contract;
  assert.equal(result.waivedPrincipal,1000000000);assert.equal(result.waivedInterest,1301369);assert.equal(result.paidInterest,1000000);
  assert.equal(result.paidInterest+result.waivedInterest+result.futureInterestSaved,result.maxInterest);
  assert.equal(result.paidPrincipal+result.waivedPrincipal,result.principal);assert.equal(result.payoffAmount,0);
  assert.equal(f.s.balance(f.space),balance);assert.equal(f.ledgerBalance(),balance);assert.equal(f.current(),null);
});
