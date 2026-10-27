import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {migrate} from '../lib/migrate.mjs';
import {PET_LEVELS,petLevel} from '../lib/pets.mjs';
import {parseMarkdown,durationLabel} from '../public/plans.js';
import {createApp} from '../server.mjs';

function setup(t){
 const s=new Store(':memory:');t.after(()=>s.db.close());
 const a=s.newUser({username:'learner',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'晴天',password:''}),o=s.newUser({username:'other',name:'路过',password:''});
 const room=s.pair(a.id,g.id).space_id;a.space_id=room;
 const op=(u,route,body,fn,key=randomUUID())=>s.operation(u,key,route,{space_id:room,...body},()=>fn(u,{space_id:room,...body}));
 const prize=(effect,extra={})=>{const r=s.savePrize(g,{space_id:room,title:'测试小礼物',description:'测试用途',emoji:'🐾',category:'custom',face_cents:0,effect,channel:effect==='pet_companion'?'lottery':'shop',cost:10,stock:30,weight:100,wait_days:0,active:true,...extra});return s.get('SELECT * FROM prizes WHERE id=?',r.id);};
 const use=(card,key=randomUUID(),u=a)=>op(u,'/api/pets/use',{card_id:card.id},s.pets.use.bind(s.pets),key);
 const task=(extra={})=>op(a,'/api/tasks',{tasks:[{title:'认真学习',recurrence:'daily',...extra}]},s.createTasks.bind(s)).ids[0];
 const complete=(tid,extra={})=>op(a,'/api/complete',{task_id:tid,done:true,...extra},s.complete.bind(s));
 const hit=p=>{s.postTickets(room,1,'test','fixture','x');return op(a,'/api/draw',{mode:'ticket'},(u,b)=>s.draw(u,b,()=>{let n=0;for(const x of s.pool(room)){if(x.id===p.id)return n;n+=x.weight;}throw Error('missing');})).card;};
 return {s,a,g,o,room,op,prize,use,task,complete,hit};
}

test('预估时间兼容手动和 Markdown，编辑需本人且不能改分，含乐观并发和日志',t=>{
 const {s,a,g,room,op,task}=setup(t);const tid=task({estimated_minutes:20});
 assert.equal(s.state(a,room).tasks[0].estimated_minutes,20);
 const edit=(u,minutes,expected=20)=>op(u,'/api/tasks/estimate',{task_id:tid,estimated_minutes:minutes,expectedMinutes:expected},s.estimateTask.bind(s));
 assert.throws(()=>edit(g,30),/领奖人/);edit(a,45);assert.throws(()=>edit(a,60),/刚有变化/);assert.equal(s.balance(room),0);
 assert.equal(s.get('SELECT points FROM tasks WHERE id=?',tid).points,20*COIN);
 assert.equal(JSON.parse(s.get("SELECT detail FROM room_audit WHERE action='/api/tasks/estimate'").detail).estimatedMinutes,45);
 edit(a,0,45);assert.equal(s.state(a,room).tasks[0].estimated_minutes,0);
 for(const value of [-1,1441,2.5,'30'])assert.throws(()=>task({estimated_minutes:value}),/预估分钟/);
 const count=s.all('SELECT * FROM tasks').length;
 assert.throws(()=>op(a,'/api/tasks',{tasks:[{title:'正常',recurrence:'daily',estimated_minutes:10},{title:'无效',recurrence:'daily',estimated_minutes:-1}]},s.createTasks.bind(s)));
 assert.equal(s.all('SELECT * FROM tasks').length,count);
 const parsed=parseMarkdown('### 紧急 & 重要\n- [ ] 背单词（预估 20 分钟）\n[ ] 阅读 (预计 1.5 小时)\n- 运动 30 分钟\n- [x] 做作业 [用时: 45min]');
 assert.deepEqual(parsed.tasks.map(t=>t.estimated_minutes),[20,90,0,45]);assert.equal(parsed.tasks[0].title,'背单词');assert.equal(parsed.checked,1);assert.equal(parsed.tasks[0].quadrant,'urgent-important');
 assert.equal(durationLabel(90),'1 小时 30 分钟');assert.throws(()=>parseMarkdown('- 阅读（预估 25 小时）'),/1440/);
});

test('首次宠物只能抽奖，卡包使用一次，既有任务经验映射，重复卡加60经验',t=>{
 const {s,a,g,room,prize,hit,use,task,complete}=setup(t);const p=prize('pet_companion'),food=prize('pet_snack');
 assert.throws(()=>s.savePrize(g,{...p,id:undefined,cost:10,space_id:room,channel:'shop'}),/仅在抽奖/);
 assert.throws(()=>s.lottery.copy(g,{space_id:room,prize_id:p.id,stock:1}),/仅在抽奖/);
 s.post(room,200*COIN,'test','fixture','x');assert.throws(()=>s.buy(a,{prize_id:p.id}),/不能从商城/);assert.throws(()=>s.buy(a,{prize_id:food.id}),/先在抽奖/);
 complete(task());assert.equal(s.pets.state(room).owned,false);assert.equal(s.pets.state(room).xp,20);
 const card=hit(p),key=randomUUID();use(card,key);use(card,key);
 assert.equal(s.pets.state(room).owned,true);assert.equal(s.pets.state(room).xp,20);assert.throws(()=>use(card),/已经用过/);
 use(hit(p));assert.equal(s.pets.state(room).xp,80);assert.equal(s.get('SELECT COUNT(*) n FROM pets').n,1);
 assert.throws(()=>use(s.issue(a,p,'shop')),/需要从抽奖/);
});

test('消费不扣经验，完成撤销与改分不刷经验，经验只取实际发放含每日上限',t=>{
 const {s,a,g,room,task,complete,prize,hit,use,op}=setup(t);use(hit(prize('pet_companion')));
 const ids=Array.from({length:3},()=>task());ids.forEach(tid=>complete(tid,{difficulty:'challenge'}));
 assert.equal(s.pets.state(room).xp,100);complete(ids[0]);assert.equal(s.pets.state(room).xp,100);
 const balance=s.balance(room),snack=prize('pet_snack');const card=op(a,'/api/buy',{prize_id:snack.id},s.buy.bind(s)).card;
 assert.equal(s.balance(room),balance-10*COIN);assert.equal(s.pets.state(room).xp,100);
 use(card);assert.equal(s.pets.state(room).xp,105);
 complete(ids[0],{done:false});assert.equal(s.pets.state(room).xp,55);complete(ids[0]);assert.equal(s.pets.state(room).xp,105);
 const c=s.get('SELECT * FROM completions WHERE task_id=? AND day=?',ids[0],dayAt());
 complete(ids[0],{rescore:true,expectedUpdated:c.updated,expectedPoints:c.points,difficulty:'easy'});assert.equal(s.pets.state(room).xp,65);
 op(g,'/api/admin/settings',{...s.settings(room),dailyBonusKind:'coins',dailyBonusAmount:5},s.saveSettings.bind(s));
 const fresh=s.pair(a.id,s.newUser({username:'giver2',name:'新伙伴',password:''}).id).space_id;
 assert.equal(s.pets.state(fresh).xp,0);assert.equal(s.pets.state(fresh).owned,false);
});

test('食物和装扮计分原子幂等，装扮不重复购买或计经验，换装受等级约束',t=>{
 const {s,a,room,op,prize,hit,use}=setup(t);use(hit(prize('pet_companion')));s.post(room,100*COIN,'test','fixture','x');
 const bow=prize('pet_bow'),card=op(a,'/api/buy',{prize_id:bow.id},s.buy.bind(s)).card;
 assert.throws(()=>s.buy(a,{prize_id:bow.id}),/不用重复买/);
 const key=randomUUID();use(card,key);use(card,key);assert.equal(s.pets.state(room).xp,30);assert.equal(s.pets.state(room).outfit,'pet_bow');assert.throws(()=>s.buy(a,{prize_id:bow.id}),/不用重复买/);
 use(s.issue(a,bow,'draw'));assert.equal(s.pets.state(room).xp,30);
 assert.throws(()=>s.pets.dress(a,{form:'pocket-glider'}),/再积攒/);assert.throws(()=>s.pets.dress(a,{outfit:'pet_star'}),/还没有解锁/);
 s.pets.dress(a,{outfit:''});s.pets.dress(a,{outfit:'pet_bow'});assert.equal(s.pets.state(room).xp,30);
 const snack=s.issue(a,prize('pet_snack'),'draw'),old=s.community.audit;s.community.audit=()=>{throw Error('audit unavailable');};
 assert.throws(()=>use(snack),/audit unavailable/);s.community.audit=old;
 assert.equal(s.get('SELECT status FROM cards WHERE id=?',snack.id).status,'ready');assert.equal(s.pets.state(room).xp,30);
 use(snack);assert.equal(s.pets.state(room).xp,35);
 for(let i=0;i<PET_LEVELS.length;i++){assert.equal(petLevel(PET_LEVELS[i]),i+1);if(i)assert.equal(petLevel(PET_LEVELS[i]-1),i);}
});

test('家庭共用库存但宠物经验各自独立，发奖人及其他成员不能操作对方宠物',t=>{
 const {s,a,g,o,room,use,prize,hit}=setup(t),card=hit(prize('pet_companion'));
 assert.throws(()=>use(card,randomUUID(),g),/领奖人/);assert.throws(()=>use(card,randomUUID(),o),/没有向你开放/);
 const fa=s.community.createFamily(a,{name:'成长之家'}).space_id,invite=s.community.familyInvite(a,{space_id:fa}),fb=s.tx(()=>s.acceptInvite(g,invite.code)).space_id;
 const p=s.savePrize(a,{space_id:fa,title:'小伙伴',description:'测试',emoji:'🐾',category:'custom',effect:'pet_companion',channel:'lottery',cost:10,face_cents:0,stock:2,weight:100,wait_days:0,active:true});
 const row=s.get('SELECT * FROM prizes WHERE id=?',p.id),ca=s.issue(a,row,'draw');
 s.operation(a,randomUUID(),'/api/pets/use',{space_id:fa,card_id:ca.id},()=>s.pets.use(a,{space_id:fa,card_id:ca.id}));
 assert.equal(s.state(g,fb).pet.owned,false);assert.equal(s.state(g,fa).pet.owned,true);
 assert.throws(()=>s.pets.dress(g,{space_id:fa,form:'nuonuo-seal'}),/领奖人/);
 assert.ok(s.community.logs(g,{space_id:fb}).entries.some(e=>e.action==='/api/pets/use'));
 assert.equal(s.pets.state(room).owned,false);
});

test('全勤学习币映射经验；撤销跨过等级门槛时收回高等级形象访问权',t=>{
 const {s,a,g,room,op,prize,hit,use,task,complete}=setup(t);
 op(g,'/api/admin/settings',{...s.settings(room),dailyBonusKind:'coins',dailyBonusAmount:5},s.saveSettings.bind(s));
 const tid=task();complete(tid);assert.equal(s.pets.state(room).xp,25);complete(tid,{done:false});assert.equal(s.pets.state(room).xp,0);complete(tid);assert.equal(s.pets.state(room).xp,25);
 const p=prize('pet_companion');use(hit(p));for(let i=0;i<4;i++)use(hit(p));
 const second=task();complete(second,{difficulty:'hard'}); // 20 + 30 + 5 full-day + 240 = 295.
 const third=task();complete(third,{difficulty:'easy'});assert.equal(s.pets.state(room).xp,305);
 s.pets.dress(a,{form:'pocket-glider'});assert.equal(s.pets.state(room).form,'pocket-glider');
 complete(third,{done:false});assert.equal(s.pets.state(room).xp,290);assert.equal(s.pets.state(room).form,'nuonuo-seal');assert.throws(()=>s.pets.dress(a,{form:'pocket-glider'}),/再积攒/);
 complete(third);assert.equal(s.pets.state(room).form,'pocket-glider');
});

test('v10升级只替换未自定义大奖，保留旧卡与库存价格，旧任务用时未设，重复运行安全',t=>{
 const {s,a,room,prize,task}=setup(t);const make=extra=>prize('',{channel:'lottery',title:'快乐大礼包',description:'游戏或玩具的 ¥500 报销额度，把小期待变成大快乐。',category:'play',face_cents:50000,...extra});
 const standard=make({cost:7000,stock:2}),custom=make({title:'自己选的大奖'});s.run("UPDATE prizes SET template_id='lucky-6'");const card=s.issue(a,standard,'draw'),tid=task();
 s.db.exec('PRAGMA user_version=10');migrate(s.db);migrate(s.db);
 const updated=s.get('SELECT * FROM prizes WHERE id=?',standard.id);assert.equal(updated.title,'500 元自选心愿卡');assert.equal(updated.category,'universal');assert.equal(updated.cost,7000*COIN);assert.equal(updated.stock,1);assert.equal(updated.face_cents,50000);
 assert.equal(s.get('SELECT title FROM prizes WHERE id=?',custom.id).title,'自己选的大奖');assert.equal(s.get('SELECT category FROM cards WHERE id=?',card.id).category,'play');assert.equal(s.get('SELECT estimated_minutes FROM tasks WHERE id=?',tid).estimated_minutes,0);
 assert.equal(s.get('PRAGMA user_version').user_version,12);assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
});

test('HTTP宠物操作鉴权和幂等，预估时间可修改，所有宠物静态图片可以加载',async t=>{
 const {server,store:s}=await createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));
 const a=s.newUser({username:'learner',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'晴天',password:''}),room=s.pair(a.id,g.id).space_id;a.space_id=room;
 const as=s.session(a.id),gs=s.session(g.id),base='http://127.0.0.1:'+server.address().port;
 const call=(session,path,body,key=randomUUID())=>fetch(base+'/api/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:'starlight_session='+session.token,'X-CSRF-Token':session.csrf,'Idempotency-Key':key},body:JSON.stringify({space_id:room,...body})});
 assert.equal((await fetch(base+'/pets.js')).status,200);
 for(const f of s.pets.state(room).forms)for(const file of ['young.png','winged.png','young-idle-animated.png','winged-idle-animated.png']){const r=await fetch(base+'/pets/'+f.id+'/'+file);assert.equal(r.status,200);assert.match(r.headers.get('content-type'),/image\/png/);assert.ok((await r.arrayBuffer()).byteLength>1000);}
 assert.equal((await fetch(base+'/pets/ASSET-SOURCE.md')).status,404);
 const created=await (await call(as,'tasks',{tasks:[{title:'读书',recurrence:'daily',estimated_minutes:10}]})).json();
 assert.equal((await call(gs,'tasks/estimate',{task_id:created.ids[0],estimated_minutes:20,expectedMinutes:10})).status,403);
 assert.equal((await call(as,'tasks/estimate',{task_id:created.ids[0],estimated_minutes:20,expectedMinutes:10})).status,200);
 const prize=s.savePrize(g,{space_id:room,title:'小伙伴',description:'测试',emoji:'🐾',category:'custom',effect:'pet_companion',channel:'lottery',cost:10,face_cents:0,stock:1,weight:100,wait_days:0,active:true});const card=s.issue(a,s.get('SELECT * FROM prizes WHERE id=?',prize.id),'draw'),key=randomUUID();
 assert.equal((await call(gs,'pets/use',{card_id:card.id})).status,403);
 const rs=await Promise.all(Array.from({length:3},()=>call(as,'pets/use',{card_id:card.id},key)));assert.ok(rs.every(r=>r.status===200));assert.equal(s.get('SELECT COUNT(*) n FROM pets').n,1);
 assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='/api/pets/use'").n,1);
});
