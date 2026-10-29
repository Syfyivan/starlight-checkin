import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Store} from '../lib/store.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {dayStart} from '../lib/progress.mjs';
import {PET_ITEMS,PET_TEMPLATES} from '../lib/pets.mjs';
import {petItemLock} from '../public/pet-catalog.js';
import {petPortrait} from '../public/pets.js';
import {LONG_POINTS_MAX} from '../public/task-types.js';
import {migrate} from '../lib/migrate.mjs';
import {travelPanel} from '../public/travel-view.js';

function fixture(t){const s=new Store(':memory:');t.after(()=>s.db.close());const a=s.newUser({username:'studio_learner',name:'小芽',password:''}),g=s.newUser({username:'studio_giver',name:'伙伴',password:''}),room=s.pair(a.id,g.id).space_id;s.run('INSERT INTO pets VALUES(?,?,?,?)',room,'nuonuo-seal','',new Date().toISOString());s.post(room,2000*COIN,'test','fixture','x');
 const goal=(points)=>s.createTasks(a,{space_id:room,tasks:[{title:'长期成长',task_kind:'long',points}]}).ids[0];
 const complete=(task_id,done=true)=>s.complete(a,{space_id:room,task_id,done});
 const prize=(effect)=>{const p=PET_ITEMS[effect];const r=s.savePrize(g,{space_id:room,title:p.name,description:'一份用品',category:'custom',face_cents:0,effect,channel:'shop',emoji:p.emoji,cost:p.cost,stock:10,wait_days:0,active:true});return s.get('SELECT * FROM prizes WHERE id=?',r.id);};
 const card=(effect)=>s.issue(a,prize(effect),'shop');return {s,a,g,room,goal,complete,prize,card};}

test('17款可用用品和2个预留款，预留款不可发布，既有六款维持原使用等级',t=>{
 const {s,g,room}=fixture(t);assert.equal(PET_TEMPLATES.length,17);assert.equal(Object.values(PET_ITEMS).filter(i=>i.ready===false).length,2);
 assert.ok(['pet_pack','pet_tent','pet_snack','pet_feast','pet_bow','pet_star'].every(id=>PET_ITEMS[id].level===1));
 assert.throws(()=>s.savePrize(g,{space_id:room,title:'未完成',description:'x',category:'custom',face_cents:0,effect:'pet_space',channel:'shop',emoji:'x',cost:10,stock:1,wait_days:0,active:true}),/准备中/);
 assert.ok(!PET_TEMPLATES.some(p=>p.effect==='pet_space'));
});
test('等级锁同时保护购买、使用和旅行，失败不扣币也不消耗卡',t=>{
 const {s,a,room,prize,card,goal,complete}=fixture(t),p=prize('pet_berry'),c=card('pet_berry'),balance=s.balance(room);
 assert.throws(()=>s.buy(a,{space_id:room,prize_id:p.id}),/未解锁/);assert.throws(()=>s.pets.use(a,{space_id:room,card_id:c.id}),/未解锁/);assert.throws(()=>s.travel.depart(a,{space_id:room,card_ids:[c.id]}),/未解锁/);
 assert.equal(s.balance(room),balance);assert.equal(s.get('SELECT status FROM cards WHERE id=?',c.id).status,'ready');
 complete(goal(100));assert.equal(petItemLock(s.pets.state(room),'pet_berry'),'');s.pets.use(a,{space_id:room,card_id:c.id});assert.equal(s.pets.state(room).xp,112);
});
test('旅途中暂停喂食和换装，冻结出发形象，归来后恢复并且不提前泄露礼物',t=>{
 const {s,a,room,card}=fixture(t),food=card('pet_snack'),later=card('pet_snack'),bow=card('pet_bow');s.pets.use(a,{space_id:room,card_id:bow.id});
 const trip=s.travel.depart(a,{space_id:room,card_ids:[food.id]},()=>0).trip;assert.equal(trip.pet.outfit,'pet_bow');assert.equal(trip.gift,undefined);assert.equal(s.travel.state(room).history.length,0);
 assert.throws(()=>s.pets.dress(a,{space_id:room,outfit:''}),/旅行/);assert.throws(()=>s.pets.use(a,{space_id:room,card_id:later.id}),/旅行/);assert.equal(s.get('SELECT status FROM cards WHERE id=?',later.id).status,'ready');
 s.travel.maintain(trip.returnAt);const history=s.travel.state(room).history;assert.equal(history.length,1);assert.ok(history[0].story.length>50);assert.equal(history[0].hasGift,false);s.pets.use(a,{space_id:room,card_id:later.id});assert.equal(s.pets.state(room).xp,40);
});
test('降级暂时隐藏高等级配饰，不删除所有权，升级后可重新佩戴',t=>{
 const {s,a,room,goal,complete,card}=fixture(t),id=goal(100);complete(id);const c=card('pet_scarf');s.pets.use(a,{space_id:room,card_id:c.id});assert.equal(s.pets.state(room).outfit,'pet_scarf');
 complete(id,false);assert.equal(s.pets.state(room).outfit,'');assert.ok(s.pets.state(room).outfits.includes('pet_scarf'));assert.throws(()=>s.pets.dress(a,{space_id:room,outfit:'pet_scarf'}),/未解锁/);complete(id);s.pets.dress(a,{space_id:room,outfit:'pet_scarf'});assert.equal(s.pets.state(room).itemXp,35);
});
test('未解锁形象只输出轮廓，不生成真实图像地址；配饰按六个形象姿态定位',()=>{
 assert.ok(!petPortrait({owned:true,form:'pocket-glider',stage:'young'},{locked:true}).includes('<img'));
 for(const form of ['nuonuo-seal','pocket-glider','cottonpod-hermit'])for(const stage of ['young','winged'])for(const [outfit,i] of Object.entries(PET_ITEMS).filter(([,i])=>i.kind==='outfit'&&i.ready!==false)){
  const html=petPortrait({owned:true,form,stage,outfit});assert.match(html,/fitted-outfit/);assert.match(html,/transform="translate/);assert.ok(!html.includes(i.emoji));assert.ok(!html.includes('NaN'));
 }
});

test('旅行页面可在领奖和只读视角渲染，只有本人能准备行囊',()=>{
 const state={pet:{owned:true},travel:{away:false,history:[]},growthRules:{enabled:false}};
 const own=travelPanel(state,()=>true,String),preview=travelPanel(state,()=>false,String);
 assert.match(own,/data-action="travel-pack" >准备行囊/);
 assert.match(preview,/data-action="travel-pack" disabled/);
 assert.ok(!own.includes('undefined'));
});
test('长期任务支持100万币和发奖人高额调整，扣款按整数微币精确计算',t=>{
 const {s,a,g,room,goal,complete}=fixture(t),id=goal(LONG_POINTS_MAX);complete(id);goal(2); // Long tasks with no deadline do not count as missed.
 s.createTasks(a,{space_id:room,tasks:[{title:'当日待办',task_kind:'normal'}]});
 assert.equal(s.plans.preview(room,dayAt()).amount,10000*COIN);s.progress.taskScore(g,{space_id:room,task_id:id,points:500000,expectedRevision:0});assert.equal(s.plans.preview(room,dayAt()).amount,5000*COIN);assert.throws(()=>goal(LONG_POINTS_MAX+1));
 s.plans.settle(room,dayStart(dayAt())+86400000);assert.equal(s.pets.state(room).xp,500000);
});
test('大额经验分批寄信，使用触发时规则；撤销后暂停，恢复不漏发、不重发',t=>{
 const {s,g,room,goal,complete}=fixture(t);s.progress.saveRules(g,{space_id:room,version:s.progress.rules(room).version,enabled:true,step:50,ticket:100,card2:0,card5:0});
 const id=goal(5000);complete(id);s.progress.sync(room,()=>99);assert.equal(s.get('SELECT COUNT(*) n FROM mail_gifts').n,25);assert.equal(s.get('SELECT next_threshold FROM growth_deliveries').next_threshold,1300);
 s.progress.saveRules(g,{space_id:room,version:s.progress.rules(room).version,enabled:true,step:100,ticket:0,card2:100,card5:0});complete(id,false);s.progress.sync(room,()=>99);assert.equal(s.get('SELECT COUNT(*) n FROM mail_gifts').n,25);
 complete(id);for(let i=0;i<4;i++)s.progress.sync(room,()=>99);assert.equal(s.get('SELECT COUNT(*) n FROM mail_gifts').n,100);assert.equal(s.get('SELECT COUNT(*) n FROM growth_deliveries').n,0);assert.ok(s.all('SELECT gift FROM mail_gifts').every(g=>JSON.parse(g.gift).kind==='ticket'));
});
test('经验投递失败完整回滚游标与邮件，重试后仍只发一批',t=>{
 const {s,room,goal,complete}=fixture(t);complete(goal(10000));s.db.exec("CREATE TRIGGER fail_growth BEFORE INSERT ON mailbox BEGIN SELECT RAISE(ABORT,'test'); END");
 assert.throws(()=>s.progress.sync(room));assert.equal(s.get('SELECT COUNT(*) n FROM growth_deliveries').n,0);assert.equal(s.get('SELECT COUNT(*) n FROM mail_gifts').n,0);assert.equal(s.get('SELECT high_xp FROM growth_progress WHERE space_id=?',room)?.high_xp||0,0);
 s.db.exec('DROP TRIGGER fail_growth');s.progress.sync(room);assert.equal(s.get('SELECT COUNT(*) n FROM mail_gifts').n,25);
});
test('v13迁移保留已有宠物、卡片和余额，不替换自定义奖品',t=>{
 const {s,room,card}=fixture(t);card('pet_bow');const before={pets:s.all('SELECT * FROM pets'),cards:s.all('SELECT * FROM cards'),prizes:s.all('SELECT * FROM prizes'),balance:s.balance(room)};
 s.db.exec('DROP TABLE growth_deliveries; PRAGMA user_version=13;');migrate(s.db);migrate(s.db);assert.equal(s.get('PRAGMA user_version').user_version,20);assert.deepEqual(s.all('SELECT * FROM pets'),before.pets);assert.deepEqual(s.all('SELECT * FROM cards'),before.cards);assert.deepEqual(s.all('SELECT * FROM prizes'),before.prizes);assert.equal(s.balance(room),before.balance);assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
});
