import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN,dayAt} from '../lib/common.mjs';

const DAY=86400000,base='2026-10-30';
const stamp=day=>Date.parse(day+'T12:00:00+08:00');
const move=(day,n)=>dayAt(stamp(day)+n*DAY);
function fixture(t,{tracking='2026-10-01'}={}){
  const s=new Store(':memory:');t.after(()=>s.db.close());
  const user=s.newUser({username:'ready_learner',name:'学习伙伴',password:''}),giver=s.newUser({username:'ready_giver',name:'发奖伙伴',password:''});
  const room=s.pair(user.id,giver.id).space_id;user.space_id=room;let clock=stamp(base);s.credit.clock=()=>clock;
  s.run("UPDATE spaces SET created='2026-10-01T00:00:00.000Z' WHERE id=?",room);
  s.run("UPDATE settings SET value=? WHERE key='credit_readiness_start'",tracking);
  s.run("UPDATE settings SET value='2026-10-01' WHERE key='task_settlement_start'");
  s.run('INSERT OR REPLACE INTO room_settings(space_id,value) VALUES(?,?)',room,JSON.stringify({penaltyEnabled:false,dailyCap:100}));
  const setDay=day=>{clock=stamp(day);};
  const task=({kind='repeat',start='2026-10-01',repeat=1,deadline=''}={})=>{
    const id=randomUUID();s.run(`INSERT INTO tasks(id,user_id,title,category,points,recurrence,start_date,created,space_id,task_kind,repeat_days,deadline,once_since)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,id,user.id,'观察用计划','学习',20*COIN,kind==='repeat'?'daily':'once',start,new Date(Date.parse(start+'T00:00:00+08:00')).toISOString(),room,kind,repeat,deadline,start);return id;
  };
  const completion=(tid,day,coins=20,kind='repeat',done=1)=>s.run(`INSERT INTO completions(id,task_id,user_id,day,points,done,updated,space_id,task_kind)
    VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(task_id,day) DO UPDATE SET points=excluded.points,done=excluded.done,task_kind=excluded.task_kind`,randomUUID(),tid,user.id,day,coins*COIN,done,new Date(stamp(day)).toISOString(),room,kind);
  const seed=({days=28,active=28,required=10,completed=10,coins=100}={})=>{
    for(let i=1;i<=days;i++){const day=move(base,-i),isActive=i<=active?1:0,time=new Date(stamp(day)).toISOString();
      s.run(`INSERT OR REPLACE INTO credit_days(space_id,day,task_ids,earned,required_count,completed_count,active,finalized,cap_coins,created,updated)
        VALUES(?,?,'[]',?,?,?,?,1,100,?,?)`,room,day,isActive?coins*COIN:0,required,completed,isActive,time,time);
    }
  };
  const contract=({status='paid',started='2026-10-10',closed='2026-10-18',late=0}={})=>{
    const id=randomUUID();s.run(`INSERT INTO credit_contracts(id,space_id,user_id,quote_id,kind,principal,annual_bps,started_on,maturity_on,max_interest,status,closed_on,had_overdue,created)
      VALUES(?,?,?,?,'loan',?,600,?,?,100000,?,?,?,?)`,id,room,user.id,randomUUID(),100*COIN,started,move(started,14),status,closed,late,new Date(stamp(started)).toISOString());return id;
  };
  return {s,user,giver,room,setDay,task,completion,seed,contract,profile:()=>s.readiness.profile(room)};
}

test('14/28-day fixed denominators exclude today, loans, gifts and completion-time long awards',t=>{
  const f=fixture(t,{tracking:base}),tid=f.task();
  for(let i=1;i<=14;i++)f.completion(tid,move(base,-i),100);
  const long=f.task({kind:'long'});f.completion(long,move(base,-1),1000000,'long');
  f.completion(tid,base,100);f.s.post(f.room,50000*COIN,'credit_disbursement','借款不算收入','test');f.s.post(f.room,50000*COIN,'gift','赠币不算收入','test');
  // Editing today's definition must not rewrite the historical completion kind.
  f.s.run("UPDATE tasks SET task_kind='long' WHERE id=?",tid);
  const p=f.profile();assert.equal(p.avg14,100*COIN);assert.equal(p.avg28,50*COIN);assert.equal(p.stableDailyIncome,50*COIN);
  assert.equal(p.observedDays,0);assert.equal(p.activeDays,0);assert.equal(p.completionRate,null);assert.equal(p.trackingSince,base);
  assert.ok(f.s.all('SELECT cap_coins FROM credit_days WHERE space_id=? AND day<?',f.room,base).every(r=>r.cap_coins===null));
});

test('falling recent income wins over an older busy fortnight, including zero-income days',t=>{
  const f=fixture(t),tid=f.task();for(let i=15;i<=28;i++)f.completion(tid,move(base,-i),100);
  const p=f.profile();assert.equal(p.avg28,50*COIN);assert.equal(p.avg14,0);assert.equal(p.stableDailyIncome,0);
  const c=f.s.readiness.capacity(f.room,{annualBps:600,periods:6,periodDays:7,limitCoins:5000});assert.equal(c.maxPrincipalCoins,0);assert.equal(c.periodBudget,0);
});

test('observed due-task union survives same-day edits and archives, then freezes across the day boundary',t=>{
  const f=fixture(t),day='2026-10-10';f.setDay(day);
  const a=f.task({kind:'normal',start:day}),b=f.task({kind:'normal',start:day}),dueLong=f.task({kind:'long',start:day,deadline:day});
  f.task({kind:'long',start:day,deadline:'2026-11-10'});f.task({start:'2026-10-09',repeat:7});
  let snapshot=f.s.readiness.observe(f.room);assert.equal(snapshot.required_count,3);
  f.s.run("UPDATE tasks SET task_kind='long',deadline='2026-11-10' WHERE id=?",a);
  f.s.run('UPDATE tasks SET archived=1,archived_at=? WHERE id=?',new Date(stamp(day)).toISOString(),b);
  const added=f.task({kind:'normal',start:day});f.completion(a,day,20,'normal');f.completion(dueLong,day,1000000,'long');f.completion(added,day,20,'normal');
  snapshot=f.s.readiness.observe(f.room);assert.equal(snapshot.required_count,4);assert.equal(snapshot.completed_count,3);assert.equal(snapshot.earned,40*COIN);
  f.setDay('2026-10-11');f.s.plans.settle(f.room,f.s.credit.clock());
  const frozen=f.s.get('SELECT * FROM credit_days WHERE space_id=? AND day=?',f.room,day);assert.equal(frozen.finalized,1);
  f.s.run('DELETE FROM tasks WHERE id=?',b);f.s.run('UPDATE completions SET done=0,points=0 WHERE task_id=? AND day=?',a,day);
  f.s.readiness.observe(f.room,day,{finalize:true});assert.deepEqual(f.s.get('SELECT * FROM credit_days WHERE space_id=? AND day=?',f.room,day),frozen);
  const p=f.profile();assert.equal(p.observedDays,1);assert.equal(p.dueTasks,4);assert.equal(p.completedTasks,3);assert.equal(p.completionRate,.75);
});

test('ownSpace observes before archive; already-settled days still finalize their saved task set',t=>{
  const f=fixture(t),today=dayAt();f.setDay(today);const tid=f.task({kind:'normal',start:today});
  f.s.tx(()=>f.s.archive(f.user,{space_id:f.room,task_id:tid}));
  let row=f.s.get('SELECT * FROM credit_days WHERE space_id=? AND day=?',f.room,today);assert.ok(JSON.parse(row.task_ids).some(t=>t.id===tid));
  f.s.run('INSERT INTO task_settlements(space_id,day,gross,missed,percent,amount,detail,created) VALUES(?,?,0,1,0,0,?,?)',f.room,today,JSON.stringify([{id:tid,kind:'normal'}]),new Date(stamp(today)).toISOString());
  f.setDay(move(today,1));f.s.plans.settle(f.room,f.s.credit.clock());row=f.s.get('SELECT * FROM credit_days WHERE space_id=? AND day=?',f.room,today);
  assert.equal(row.finalized,1);assert.equal(row.required_count,1);assert.equal(row.completed_count,0);
});

test('newly created and newly due edited tasks are observed even without another same-day page visit',t=>{
  const f=fixture(t),today=dayAt();f.setDay(today);
  const added=f.s.tx(()=>f.s.createTasks(f.user,{space_id:f.room,tasks:[{title:'添加后直接离开',task_kind:'normal',start_date:today}]})).ids[0];
  const future=f.s.tx(()=>f.s.createTasks(f.user,{space_id:f.room,tasks:[{title:'原本明天开始',task_kind:'normal',start_date:move(today,1)}]})).ids[0];
  f.s.tx(()=>f.s.plans.edit(f.user,{space_id:f.room,task_id:future,expectedVersion:f.s.plans.editVersion({id:future,space_id:f.room}),title:'改成今天开始',task_kind:'normal',start_date:today,category:'学习',quadrant:'none',estimated_minutes:0}));
  const observed=f.s.get('SELECT * FROM credit_days WHERE space_id=? AND day=?',f.room,today);
  assert.deepEqual(new Set(JSON.parse(observed.task_ids).map(t=>t.id)),new Set([added,future]));
  f.setDay(move(today,1));f.s.plans.settle(f.room,f.s.credit.clock());
  const frozen=f.s.get('SELECT * FROM credit_days WHERE space_id=? AND day=?',f.room,today);assert.equal(frozen.finalized,1);assert.equal(frozen.required_count,2);assert.equal(frozen.completed_count,0);
});

test('a daily snapshot freezes its income cap and actual penalty, rather than later settings or refunds',t=>{
  const f=fixture(t),day='2026-10-10';f.setDay(day);const complete=f.task({start:day});f.task({start:day});
  f.s.run('UPDATE room_settings SET value=? WHERE space_id=?',JSON.stringify({penaltyEnabled:true,dailyCap:100}),f.room);
  f.s.readiness.observe(f.room);f.completion(complete,day,20);
  f.setDay(move(day,1));f.s.plans.settle(f.room,f.s.credit.clock());
  const snapshot=f.s.get('SELECT * FROM credit_days WHERE space_id=? AND day=?',f.room,day);
  assert.equal(snapshot.earned,19800000);assert.equal(snapshot.cap_coins,100);assert.equal(snapshot.completed_count,1);assert.equal(snapshot.required_count,2);
  f.s.run('UPDATE room_settings SET value=? WHERE space_id=?',JSON.stringify({penaltyEnabled:false,dailyCap:1000}),f.room);
  f.s.post(f.room,200000,'penalty_refund','后来退回不重写观察日','test');f.completion(complete,day,500);
  assert.deepEqual(f.s.readiness.observe(f.room,day,{finalize:true}),snapshot);
});

test('tier thresholds depend on observed active days and completion rate, with explicit next steps',t=>{
  const cases=[
    [{days:6,active:6,completed:10},300],
    [{days:7,active:4,completed:7},800],
    [{days:14,active:8,completed:8},1500],
    [{days:28,active:16,required:20,completed:17},3000],
    [{days:28,active:28,completed:6},300],
  ];
  for(const [sample,limit] of cases){const f=fixture(t);f.seed(sample);const p=f.profile();assert.equal(p.tierLimitCoins,limit);assert.equal(p.observedDays,sample.days);assert.ok(p.nextTier.requirements.length);assert.equal(p.assessmentDate,base);assert.equal(p.repaymentPercent,40);}
});

test('5000 requires a new observed seven-day paid contract; unknown old, instant and waived loans do not qualify',t=>{
  const f=fixture(t);f.seed();f.contract({started:'2026-09-01',closed:'2026-09-10'});f.contract({started:'2026-10-10',closed:'2026-10-10'});f.contract({status:'waived'});
  let p=f.profile();assert.equal(p.tierLimitCoins,3000);assert.equal(p.onTimeLoans,0);assert.ok(p.nextTier.requirements.some(r=>r.includes('7 天')));
  const good=f.contract();p=f.profile();assert.equal(p.tierLimitCoins,5000);assert.equal(p.onTimeLoans,1);assert.equal(p.nextTier,null);
  f.s.run('UPDATE credit_contracts SET had_overdue=1 WHERE id=?',good);p=f.profile();assert.equal(p.tierLimitCoins,800);assert.equal(p.onTimeLoans,0);assert.equal(p.lateLoans,1);
  assert.ok(p.nextTier.requirements.some(r=>r.includes('逾期')));
});

test('capacity uses all installments, fixed repayment proportion, manager cap and trailing income',t=>{
  const f=fixture(t);f.seed();let c=f.s.readiness.capacity(f.room,{annualBps:600,periods:6,periodDays:7,limitCoins:5000});
  assert.equal(c.stableDailyIncome,100*COIN);assert.equal(c.periodBudget,280*COIN);assert.equal(c.maxPrincipalCoins,1668);
  c=f.s.readiness.capacity(f.room,{annualBps:600,periods:6,periodDays:7,limitCoins:5000,repaymentPercent:30});assert.equal(c.periodBudget,210*COIN);assert.equal(c.maxPrincipalCoins,1251);
  assert.equal(f.s.readiness.capacity(f.room,{annualBps:600,periods:6,periodDays:7,limitCoins:500}).maxPrincipalCoins,500);
  // Zero-rate thirds: the first two bills fit 333333 micro-coins, but the
  // remainder makes the last bill 333334. Checking just the first is unsafe.
  f.s.readiness.profile=()=>({stableDailyIncome:833333,tierLimitCoins:300,tierName:'test',reasons:[]});
  c=f.s.readiness.capacity(f.room,{annualBps:0,periods:3,periodDays:1,limitCoins:300});assert.equal(c.periodBudget,333333);assert.equal(c.maxPrincipalCoins,0);
});

test('100% completion alone cannot unlock an unaffordable principal, and histories stay room-local',t=>{
  const f=fixture(t);f.seed({coins:1});const p=f.profile();assert.equal(p.completionRate,1);assert.equal(p.tierLimitCoins,3000);
  assert.equal(f.s.readiness.capacity(f.room,{annualBps:600,periods:3,periodDays:7,limitCoins:5000}).maxPrincipalCoins,8);
  const other=f.s.newUser({username:'ready_other',name:'另一位',password:''}),room=f.s.pair(other.id,f.giver.id).space_id;
  const stranger=f.s.readiness.profile(room);assert.equal(stranger.stableDailyIncome,0);assert.equal(stranger.onTimeLoans,0);assert.equal(stranger.completedTasks,0);
});
