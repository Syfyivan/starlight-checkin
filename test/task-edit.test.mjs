import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {migrate} from '../lib/migrate.mjs';
import {createApp} from '../server.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {dayStart} from '../lib/progress.mjs';
const plus=(day,n)=>dayAt(dayStart(day)+n*86400000);
function setup(t){
 const s=new Store(':memory:');t.after(()=>s.db.close());const a=s.newUser({username:'learner',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'伙伴',password:''}),o=s.newUser({username:'other',name:'另一位',password:''}),room=s.pair(a.id,g.id).space_id,day=dayAt();
 const task=(body={})=>s.createTasks(a,{space_id:room,tasks:[{title:'背十个单词',task_kind:'normal',...body}]}).ids[0];
 const row=id=>s.get('SELECT * FROM tasks WHERE id=?',id);
 const input=(id,changes={})=>{const r=row(id);return {...r,points:r.points/COIN,task_id:id,space_id:room,expectedVersion:s.plans.editVersion(r),...changes};};
 const edit=(id,changes={},user=a)=>{const body=input(id,changes);return s.operation(user,randomUUID(),'/api/tasks/edit',body,()=>s.plans.edit(user,body));};
 const complete=(id,changes={})=>s.complete(a,{space_id:room,task_id:id,done:true,...changes});
 return {s,a,g,o,room,day,task,row,input,edit,complete};
}

test('一次性可直接改每日，沿用任务ID和计时，每日各完成一次，日志保留前后配置',t=>{
 const {s,a,room,day,task,row,edit,complete}=setup(t),id=task();s.progress.timer(a,{space_id:room,task_id:id,action:'start'});
 edit(id,{task_kind:'repeat',repeat_days:1,estimated_minutes:15,title:'每天背十个单词'});
 assert.equal(s.get('SELECT COUNT(*) n FROM tasks').n,1);assert.equal(row(id).archived,0);assert.equal(row(id).recurrence,'daily');assert.equal(s.balance(room),0);
 assert.ok(s.get('SELECT ended_ms FROM task_timers WHERE task_id=?',id).ended_ms);
 const log=s.community.logs(a,{space_id:room}).entries.find(x=>x.action==='/api/tasks/edit');assert.ok(log);assert.equal(log.detail.before.task_kind,'normal');assert.equal(log.detail.after.task_kind,'repeat');
 complete(id);assert.equal(s.balance(room),20*COIN);assert.equal(s.todayTasks(room,plus(day,1)).find(x=>x.id===id).done,null);
 t.mock.method(Date,'now',()=>dayStart(plus(day,1))+3600000);complete(id);assert.equal(s.balance(room),40*COIN);
});

test('修改周期从新开始日计算，未来计划仍可编辑；非法或过去日期不落库',t=>{
 const {s,room,day,task,row,edit}=setup(t),id=task();edit(id,{task_kind:'repeat',repeat_days:7,start_date:plus(day,1),category:'运动',quadrant:'not-urgent-important'});
 assert.ok(!s.todayTasks(room,day).some(x=>x.id===id));assert.ok(s.plans.future(room,day).some(x=>x.id===id));assert.ok(s.todayTasks(room,plus(day,8)).some(x=>x.id===id));assert.ok(!s.todayTasks(room,plus(day,2)).some(x=>x.id===id));
 edit(id,{repeat_days:2,start_date:day});assert.ok(s.todayTasks(room,plus(day,2)).some(x=>x.id===id));
 const before=row(id);for(const bad of [{repeat_days:3},{start_date:'2027-02-30'},{start_date:plus(day,-1)},{category:'未知'},{quadrant:'fake'},{estimated_minutes:1441},{title:''},{task_kind:'long',deadline:plus(day,-1)}])assert.throws(()=>edit(id,bad));assert.deepEqual(row(id),before);
});

test('当天已完成的一次性可直接改每日，跨长期计分先撤销；过期编辑窗口被拒',t=>{
 const {s,a,g,room,task,row,input,edit,complete}=setup(t),id=task(),old=input(id);complete(id);const c=s.all('SELECT * FROM completions'),ledger=s.all('SELECT * FROM ledger');
 assert.throws(()=>s.plans.edit(a,old),/刚有变化/);assert.throws(()=>edit(id,{task_kind:'long',points:1000}),/先取消/);
 edit(id,{task_kind:'repeat',title:'十个单词已记住',estimated_minutes:12});assert.deepEqual(s.all('SELECT * FROM completions'),c);assert.deepEqual(s.all('SELECT * FROM ledger'),ledger);assert.equal(s.todayTasks(room).find(x=>x.id===id).done,1);
 const stale=input(id);s.progress.taskScore(g,{space_id:room,task_id:id,points:40,expectedRevision:row(id).score_revision});
 assert.throws(()=>s.plans.edit(s.get('SELECT id,name FROM users WHERE id=(SELECT learner_id FROM spaces WHERE id=?)',room),stale),/刚有变化/);
 complete(id,{done:false});edit(id,{task_kind:'repeat'});complete(id);assert.equal(s.balance(room),40*COIN);assert.equal(s.get('SELECT COUNT(*) n FROM completions').n,1);
});

test('有历史打卡的重复计划可改为长期新目标，旧计分口径与过去结算不变',t=>{
 const {s,room,day,task,edit,complete}=setup(t),id=task({task_kind:'repeat'});complete(id);
 let at=dayStart(plus(day,1))+3600000;t.mock.method(Date,'now',()=>at);
 edit(id,{task_kind:'long',points:5000,start_date:plus(day,1)});
 assert.equal(s.plans.dailyEarned(room,day),20*COIN);assert.equal(s.todayTasks(room,plus(day,1)).find(x=>x.id===id).done,null);
 complete(id,{points:5000});assert.equal(s.balance(room),5020*COIN);assert.equal(s.plans.dailyEarned(room,plus(day,1)),0);
 assert.equal(s.todayTasks(room,plus(day,2)).find(x=>x.id===id).done,1);assert.equal(s.get('SELECT COUNT(*) n FROM completions').n,2);
 at=dayStart(plus(day,2))+3600000;assert.throws(()=>complete(id),/已经完成/);
});

test('修改重新计算今日全勤与漏项，过往已结算金额保留；改分默认不追溯已完成得分',t=>{
 const {s,room,task,edit,complete}=setup(t),done=task(),pending=task();complete(done);assert.equal(s.dailyBonus(room).eligible,false);
 edit(pending,{task_kind:'long',points:1000});assert.equal(s.dailyBonus(room).eligible,true);assert.equal(s.ticketBalance(room),1);assert.equal(s.plans.preview(room,dayAt()).missed.length,0);
 edit(pending,{task_kind:'normal',points:20});assert.equal(s.dailyBonus(room).eligible,false);assert.equal(s.ticketBalance(room),0);assert.equal(s.plans.preview(room,dayAt()).missed.length,1);assert.equal(s.balance(room),20*COIN);
});

test('发奖人定分不能被编辑覆盖，超普通上限不能转换；所有跨小屋或家庭成员越权被拒',t=>{
 const {s,a,g,o,room,task,row,edit}=setup(t),id=task();s.progress.taskScore(g,{space_id:room,task_id:id,points:30,expectedRevision:0});
 edit(id,{task_kind:'long',points:5000});assert.equal(row(id).score_override,30*COIN);assert.equal(row(id).points,30*COIN);
 s.progress.taskScore(g,{space_id:room,task_id:id,points:5000,expectedRevision:row(id).score_revision});assert.throws(()=>edit(id,{task_kind:'normal'}),/发奖人调整/);
 for(const user of [g,o])assert.throws(()=>edit(id,{title:'越权'},user));
 const ra=s.community.createFamily(a,{name:'小家'}).space_id,invite=s.community.familyInvite(a,{space_id:ra}),rb=s.acceptInvite(o,invite.code).space_id;
 const fid=s.createTasks(o,{space_id:rb,tasks:[{title:'成员计划',task_kind:'normal'}]}).ids[0],f=s.get('SELECT * FROM tasks WHERE id=?',fid);
 assert.throws(()=>s.plans.edit(a,{...f,task_id:fid,space_id:rb,expectedVersion:s.plans.editVersion(f)}),/领奖人/);
});

test('编辑幂等和并发冲突，审计失败回滚任务/全勤/计时',t=>{
 const {s,a,room,task,row,input}=setup(t),id=task(),body=input(id,{task_kind:'repeat'}),key=randomUUID();
 const op=()=>s.operation(a,key,'/api/tasks/edit',body,()=>s.plans.edit(a,body));op();op();assert.equal(row(id).score_revision,1);assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='/api/tasks/edit'").n,1);
 assert.throws(()=>s.operation(a,randomUUID(),'/api/tasks/edit',body,()=>s.plans.edit(a,body)),/刚有变化/);
 s.progress.timer(a,{space_id:room,task_id:id,action:'start'});const fresh=input(id,{repeat_days:7}),prior=row(id);s.db.exec("CREATE TRIGGER fail_edit_audit BEFORE INSERT ON room_audit BEGIN SELECT RAISE(ABORT,'audit failure'); END");
 assert.throws(()=>s.operation(a,randomUUID(),'/api/tasks/edit',fresh,()=>s.plans.edit(a,fresh)),/audit failure/);assert.deepEqual(row(id),prior);assert.equal(s.get('SELECT ended_ms FROM task_timers WHERE task_id=?',id).ended_ms,null);
});

test('v15升级保留旧奖励、卡与任务，给历史完成补齐任务类型，重复迁移安全',t=>{
 const {s,g,room,task,complete}=setup(t),id=task({task_kind:'long',points:5000});s.progress.taskScore(g,{space_id:room,task_id:id,points:4000,expectedRevision:0});complete(id);
 s.db.exec('ALTER TABLE tasks DROP COLUMN once_since; ALTER TABLE completions DROP COLUMN task_kind; PRAGMA user_version=15');
 const oldTasks=s.all('SELECT * FROM tasks').map(r=>({...r})),oldCompleted=s.all('SELECT * FROM completions').map(r=>({...r})),ledger=s.all('SELECT * FROM ledger');migrate(s.db);migrate(s.db);
 assert.equal(s.get('PRAGMA user_version').user_version,21);assert.deepEqual(s.all('SELECT * FROM tasks').map(({once_since,...r})=>r),oldTasks);assert.deepEqual(s.all('SELECT * FROM completions').map(({task_kind,...r})=>r),oldCompleted);assert.deepEqual(s.all('SELECT * FROM ledger'),ledger);assert.equal(s.get('SELECT task_kind FROM completions').task_kind,'long');assert.equal(s.plans.dailyEarned(room,dayAt()),0);assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
});

test('HTTP编辑须登录和CSRF，状态返回版本，重复请求只生效一次且不新增任务',async t=>{
 const {server,store:s}=await createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));
 const a=s.newUser({username:'learner',name:'本人',password:''}),space=s.personalSpaceId(a.id),session=s.session(a.id),base='http://127.0.0.1:'+server.address().port;
 const id=s.createTasks(a,{tasks:[{title:'每日单词',task_kind:'normal'}]}).ids[0],state=await (await fetch(base+'/api/state',{headers:{Cookie:'starlight_session='+session.token}})).json(),task=state.tasks.find(x=>x.id===id);
 assert.ok(task.editVersion);const body={...task,space_id:space,task_id:id,task_kind:'repeat',points:20,expectedVersion:task.editVersion},key=randomUUID();
 const send=(csrf=session.csrf,cookie='starlight_session='+session.token)=>fetch(base+'/api/tasks/edit',{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie,'X-CSRF-Token':csrf,'Idempotency-Key':key},body:JSON.stringify(body)});
 assert.equal((await send('bad')).status,403);assert.equal((await send('','')).status,401);assert.equal((await send()).status,200);assert.equal((await send()).status,200);assert.equal(s.get('SELECT COUNT(*) n FROM tasks').n,1);assert.equal(s.get('SELECT task_kind FROM tasks').task_kind,'repeat');
});
