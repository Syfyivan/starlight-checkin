import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {dayAt,COIN} from '../lib/common.mjs';
import {createApp} from '../server.mjs';
import {importPlans,exportPlans} from '../lib/plan-transfer.mjs';
import {readPlanJSON,planDocument,plansMarkdown} from '../public/plan-transfer.js';
import {parseMarkdown} from '../public/plans.js';

function setup(t){const s=new Store(':memory:');t.after(()=>s.db.close());const a=s.newUser({username:'transfer_a',name:'甲',password:''}),b=s.newUser({username:'transfer_b',name:'乙',password:''});return {s,a,b};}
const task=(extra={})=>({title:'认真阅读',task_kind:'normal',points:20,category:'学习',quadrant:'none',start_date:dayAt(),estimated_minutes:25,...extra});
const transfer=(s,u,b,key=randomUUID())=>s.operation(u,key,'/api/tasks/import',b,()=>importPlans(s,u,b));
const read=(s,u,doc,scope='personal',extra={})=>readPlanJSON(JSON.stringify(doc),{scope,start_date:dayAt(),defaults:{points:20,task_kind:'normal'},settings:s.settings(u.id),...extra});

test('JSON preserves every task definition across rooms, never copies completion or account data',t=>{
 const {s,a,b}=setup(t);const ids=s.tx(()=>s.createTasks(a,{tasks:[task(),task({title:'每天单词',task_kind:'repeat',repeat_days:1,category:'运动',quadrant:'urgent-important'}),task({title:'隔日阅读',task_kind:'repeat',repeat_days:2}),task({title:'周日整理',task_kind:'repeat',repeat_days:7}),task({title:'学会一门语言',task_kind:'long',points:123456,deadline:dayAt()})]})).ids;
 s.tx(()=>s.complete(a,{task_id:ids[0],done:true,note:'不应导出的私密记录'}));
 const doc=exportPlans(s,a,{space:a.id});assert.equal(doc.tasks.length,5);assert.ok(!JSON.stringify(doc).includes('不应导出'));assert.ok(!JSON.stringify(doc).includes(a.id));
 const result=transfer(s,b,{tasks:read(s,b,doc)});assert.equal(result.added,5);assert.deepEqual(exportPlans(s,b).tasks,doc.tasks);assert.equal(s.balance(b.id),0);assert.equal(s.get('SELECT COUNT(*) n FROM completions WHERE user_id=?',b.id).n,0);
 const once=transfer(s,b,{tasks:read(s,b,doc)});assert.equal(once.added,0);assert.equal(once.skipped,5);
});
test('repeat phase and future offsets survive a later import, overdue long deadlines are explicit',t=>{
 const {s,a}=setup(t),doc=planDocument([task({task_kind:'repeat',repeat_days:7,start_date:'2026-10-01'}),task({title:'未来',start_date:'2026-10-15'}),task({title:'长期',task_kind:'long',start_date:'2026-10-01',deadline:'2026-10-12'})],'personal','2026-10-10');
 const rows=read(s,a,doc,'personal',{start_date:'2026-11-01'});assert.equal(rows[0].start_date,'2026-11-06');assert.equal(rows[1].start_date,'2026-11-06');assert.equal(rows[2].deadline,'2026-11-03');
 doc.tasks[2].deadline='2026-10-09';assert.equal(read(s,a,doc,'personal',{start_date:'2026-11-01'})[2].deadline,'2026-11-01');
});
test('reimport of ongoing old tasks skips equivalent schedules, including a future next repeat day',t=>{
 const {s,a}=setup(t);s.tx(()=>s.createTasks(a,{tasks:[task(),task({title:'隔天运动',task_kind:'repeat',repeat_days:2})]}));const old=new Date(Date.parse(dayAt())-86400000).toISOString().slice(0,10);s.run('UPDATE tasks SET start_date=?',old);
 const tasks=read(s,a,exportPlans(s,a));const r=transfer(s,a,{tasks});assert.equal(r.added,0);assert.equal(r.skipped,2);
});
test('import is atomic and idempotent, rejects forbidden spaces and cannot mint rewards with injected fields',t=>{
 const {s,a,b}=setup(t),body={tasks:[{...task(),done:true,awarded:999999,score_override:999999,id:'injected',space_id:b.id,user_id:b.id}]},key=randomUUID();
 const first=transfer(s,a,body,key);assert.deepEqual(transfer(s,a,body,key),first);assert.equal(s.balance(a.id),0);assert.equal(s.get('SELECT score_override FROM tasks').score_override,null);
 assert.throws(()=>transfer(s,b,{space_id:a.id,tasks:[task()]}),/本人|权限|小屋/);
 const count=s.get('SELECT COUNT(*) n FROM tasks').n;assert.throws(()=>transfer(s,a,{tasks:[task({title:'先有效'}),task({title:'后错误',estimated_minutes:2000})]}),/1440/);assert.equal(s.get('SELECT COUNT(*) n FROM tasks').n,count);
 assert.ok(s.community.logs(a,{}).entries.some(e=>e.action==='tasks.import'));
});
test('a full 150-task backup imports and can be safely reimported; overflow rolls back',t=>{
 const {s,a}=setup(t),tasks=Array.from({length:150},(_,i)=>task({title:'任务 '+i}));assert.equal(transfer(s,a,{tasks}).added,150);assert.equal(transfer(s,a,{tasks}).skipped,150);assert.throws(()=>transfer(s,a,{tasks:[task({title:'多出一个'})]}),/150/);assert.equal(s.get('SELECT COUNT(*) n FROM tasks').n,150);
});
test('JSON validates schema, dates and scope, keeps legacy arrays, and follows destination scoring rules',t=>{
 const {s,a}=setup(t),doc=planDocument([task({difficulty:'hard'})],'personal',dayAt()),settings={taskScoreMode:'difficulty',defaultDifficulty:'standard',difficultyPoints:{standard:20,hard:37}};
 assert.equal(read(s,a,doc,'personal',{settings})[0].points,37);
 assert.throws(()=>read(s,a,{...doc,version:99}),/版本/);assert.throws(()=>read(s,a,{...doc,scope:'shared'}),/共同/);assert.throws(()=>read(s,a,{...doc,exported_on:'2026-02-30'}),/日期/);
 assert.throws(()=>read(s,a,{...doc,tasks:[task({estimated_minutes:1441})]}),/1440/);assert.throws(()=>read(s,a,{...doc,tasks:[task({deadline:'2026-02-30'})]}),/日期/);
 assert.equal(read(s,a,[{title:'旧版',recurrence:'daily',points:20}])[0].task_kind,'repeat');assert.throws(()=>read(s,a,[null]),/格式/);
});
test('Markdown export remains a clean check-list with quadrant and estimate import compatibility',()=>{
 const doc=planDocument([task({quadrant:'urgent-important'}),task({title:'看新闻',estimated_minutes:0,quadrant:'none'})],'personal','2026-10-29'),text=plansMarkdown(doc),parsed=parseMarkdown(text);
 assert.equal(parsed.tasks.length,2);assert.equal(parsed.tasks.find(t=>t.title==='认真阅读').estimated_minutes,25);assert.equal(parsed.tasks.find(t=>t.title==='认真阅读').quadrant,'urgent-important');assert.equal(parsed.checked,0);
});
test('shared plans export once per participating plan and import with newly selected members, without shared money',t=>{
 const {s,a,b}=setup(t),room=s.tx(()=>s.community.createFamily(a,{name:'共进',mode:'friends'})).space_id,invite=s.tx(()=>s.community.familyInvite(a,{space_id:room})),rb=s.tx(()=>s.acceptInvite(b,invite.code)).space_id;
 const body={space_id:room,scope:'shared',user_ids:[a.id,b.id],tasks:[task({mode:'together',task_kind:'repeat',repeat_days:2}),task({title:'一起读书',mode:'each'})]};assert.equal(transfer(s,a,body).added,2);
 const doc=exportPlans(s,a,{space:room,scope:'shared'});assert.equal(doc.tasks.length,2);assert.equal(exportPlans(s,a,{space:room}).tasks.length,0);assert.equal(exportPlans(s,b,{space:rb,scope:'shared'}).tasks.length,2);
 assert.equal(transfer(s,a,body).skipped,2);assert.equal(s.familyPlay.balance(s.community.family(a,room).id),0);assert.equal(s.balance(rb),0);
 const second=s.tx(()=>s.community.createFamily(a,{name:'新的共进',mode:'friends'})).space_id,inv=s.tx(()=>s.community.familyInvite(a,{space_id:second}));s.tx(()=>s.acceptInvite(b,inv.code));
 const rows=readPlanJSON(JSON.stringify(doc),{scope:'shared',start_date:dayAt(),settings:s.settings(second)});assert.equal(transfer(s,a,{...body,space_id:second,tasks:rows}).added,2);assert.equal(s.get('SELECT COUNT(*) n FROM tasks WHERE space_id=?',second).n,2);
 assert.throws(()=>transfer(s,a,{...body,user_ids:[a.id,'outsider']}),/参与者/);assert.throws(()=>exportPlans(s,b,{space:a.id}),/开放/);
});
test('shared import rolls back every participant if a partner reaches capacity; guardian managers cannot import own tasks',t=>{
 const {s,a,b}=setup(t),room=s.tx(()=>s.community.createFamily(a,{name:'共进',mode:'friends'})).space_id,inv=s.tx(()=>s.community.familyInvite(a,{space_id:room})),rb=s.tx(()=>s.acceptInvite(b,inv.code)).space_id;
 transfer(s,b,{space_id:rb,tasks:Array.from({length:149},(_,i)=>task({title:'已有 '+i}))});
 assert.throws(()=>transfer(s,a,{space_id:room,scope:'shared',user_ids:[a.id,b.id],tasks:[task({title:'一起一'}),task({title:'一起二'})]}),/150/);
 assert.equal(s.get('SELECT COUNT(*) n FROM family_plans').n,0);assert.equal(s.get('SELECT COUNT(*) n FROM tasks WHERE space_id=?',room).n,0);assert.equal(s.get('SELECT COUNT(*) n FROM tasks WHERE space_id=?',rb).n,149);
 s.tx(()=>s.familyPlay.mode(a,{space_id:room,mode:'guardian',expected_mode:'friends'}));assert.throws(()=>transfer(s,a,{space_id:room,tasks:[task()]}),/家长发奖/);assert.equal(transfer(s,b,{space_id:rb,tasks:[task()]}).added,1);
});
test('HTTP export requires room access, emits attachments, serves new module; mutation requires CSRF',async t=>{
 const app=await createApp({dbPath:':memory:',demo:false}),s=app.store,a=s.newUser({username:'http_transfer',name:'测试',password:''}),b=s.newUser({username:'http_other',name:'其他',password:''});s.createTasks(a,{tasks:[task()]});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));s.db.close();});const base='http://127.0.0.1:'+app.server.address().port,session=s.session(a.id),headers={Cookie:'starlight_session='+session.token};
 assert.equal((await fetch(base+'/api/tasks/export')).status,401);assert.equal((await fetch(base+'/api/tasks/export?space='+b.id,{headers})).status,403);
 const r=await fetch(base+'/api/tasks/export',{headers});assert.equal(r.status,200);assert.match(r.headers.get('content-disposition'),/attachment.*json/);assert.equal((await r.json()).tasks.length,1);
 assert.match(await (await fetch(base+'/api/tasks/export?format=md',{headers})).text(),/- \[ \] 认真阅读/);assert.equal((await fetch(base+'/plan-transfer.js')).status,200);
 const body={tasks:[task({title:'HTTP 导入'})]};assert.equal((await fetch(base+'/api/tasks/import',{method:'POST',headers:{...headers,Origin:base,'Content-Type':'application/json'},body:JSON.stringify(body)})).status,403);
 const write=await fetch(base+'/api/tasks/import',{method:'POST',headers:{...headers,Origin:base,'Content-Type':'application/json','X-CSRF-Token':session.csrf,'Idempotency-Key':randomUUID()},body:JSON.stringify(body)});assert.equal(write.status,200);assert.equal((await write.json()).added,1);
});
