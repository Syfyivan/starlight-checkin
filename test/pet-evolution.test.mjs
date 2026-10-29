import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {migrate} from '../lib/migrate.mjs';
import {petPortrait} from '../public/pets.js';
import {travelPanel} from '../public/travel-view.js';

function setup(t,path=':memory:'){
 const s=new Store(path);t.after(()=>s.db.close());
 const u=s.newUser({username:'evolution_user',name:'成长体验者',password:''}),g=s.newUser({username:'evolution_giver',name:'发奖伙伴',password:''}),room=s.pair(u.id,g.id).space_id;
 u.space_id=room;s.post(room,10000*COIN,'test_grant','测试币不计经验','fixture');
 const op=(route,body,fn,key=randomUUID())=>s.operation(u,key,route,{space_id:room,...body},()=>fn({space_id:room,...body}));
 const create=(effect)=>{const p=s.savePrize(g,{space_id:room,title:'测试用品',description:'test',emoji:'🐾',category:'custom',face_cents:0,effect,channel:effect==='pet_companion'?'lottery':'shop',cost:10,stock:10,weight:100,wait_days:0,active:true});return s.get('SELECT * FROM prizes WHERE id=?',p.id);};
 const use=card=>op('/api/pets/use',{card_id:card.id},b=>s.pets.use(u,b));
 const evolve=(from,key)=>op('/api/pets/evolve',{from},b=>s.pets.evolve(u,b),key);
 const earn=points=>{const task=s.createTasks(u,{tasks:[{title:'长期成长',task_kind:'long',points}]}).ids[0];s.complete(u,{task_id:task,done:true});return task;};
 const first=s.issue(u,create('pet_companion'),'draw');use(first);
 return {s,u,g,room,op,create,use,evolve,earn};
}

test('抽到首宠得到蛋，孵化不花币或经验，重复及过期操作不能跳阶段',t=>{
 const {s,u,room,create,use,evolve}=setup(t),before=s.balance(room);
 assert.equal(s.pets.state(room).growth.stage,0);assert.match(petPortrait(s.pets.state(room)),/云朵蛋/);
 const panel=travelPanel({pet:s.pets.state(room)},()=>true,x=>x);assert.match(panel,/破壳以后/);assert.ok(!panel.includes('travel-pack'));
 const food=s.issue(u,create('pet_snack'),'shop');use(food);assert.equal(s.pets.state(room).xp,5);
 const outfit=s.issue(u,create('pet_bow'),'shop');assert.throws(()=>use(outfit),/孵化/);assert.equal(s.get('SELECT status FROM cards WHERE id=?',outfit.id).status,'ready');
 assert.throws(()=>s.pets.dress(u,{form:'nuonuo-seal'}),/孵化/);
 const gear=s.issue(u,create('pet_pack'),'shop');assert.throws(()=>s.travel.depart(u,{card_ids:[gear.id]}),/孵化/);assert.equal(s.get('SELECT status FROM cards WHERE id=?',gear.id).status,'ready');
 const key=randomUUID();evolve(0,key);evolve(0,key);assert.equal(s.pets.state(room).growth.stage,1);
 assert.throws(()=>evolve(0),/已经变化/);assert.throws(()=>evolve(1),/再积攒/);
 assert.equal(s.balance(room),before);assert.equal(s.pets.state(room).xp,5);use(outfit);assert.equal(s.pets.state(room).outfit,'pet_bow');
});

test('高额经验依次主动成长，进阶蛋保留衣橱，回退经验不会重新变蛋或重复领奖',t=>{
 const {s,u,room,create,use,evolve,earn}=setup(t),task=earn(6000);
 assert.equal(s.pets.state(room).growth.stage,0);evolve(0);use(s.issue(u,create('pet_bow'),'shop'));
 const before={balance:s.balance(room),xp:s.pets.state(room).xp,ledger:s.all('SELECT * FROM ledger').length};
 evolve(1);assert.equal(s.pets.state(room).growth.visual,'winged');evolve(2);assert.equal(s.pets.state(room).growth.isEgg,true);
 assert.ok(s.pets.state(room).outfits.includes('pet_bow'));assert.ok(!petPortrait(s.pets.state(room)).includes('fitted-outfit'));
 evolve(3);assert.match(petPortrait(s.pets.state(room)),/moon.png/);assert.match(petPortrait(s.pets.state(room)),/fitted-outfit/);
 evolve(4);assert.match(petPortrait(s.pets.state(room)),/star.png/);assert.throws(()=>evolve(5),/已经是/);
 assert.equal(s.balance(room),before.balance);assert.equal(s.pets.state(room).xp,before.xp);assert.equal(s.all('SELECT * FROM ledger').length,before.ledger);
 s.complete(u,{task_id:task,done:false});assert.equal(s.pets.state(room).growth.stage,5);assert.equal(s.pets.state(room).level,1);assert.match(petPortrait(s.pets.state(room)),/star.png/);
});

test('每个经验门槛生效，旅行冻结成长，出发快照在以后进阶后仍保留',t=>{
 const {s,u,room,op,create,evolve,earn}=setup(t);evolve(0);earn(599);assert.throws(()=>evolve(1),/再积攒 1/);earn(1);evolve(1);
 const gear=s.issue(u,create('pet_pack'),'shop'),at=Date.now(),rolls=[0,0,0];
 const trip=op('/api/pets/travel',{card_ids:[gear.id]},b=>s.travel.depart(u,b,()=>rolls.shift(),at)).trip;
 earn(1800);assert.throws(()=>evolve(2),/旅行/);s.travel.maintain(trip.returnAt);evolve(2);
 assert.equal(s.pets.state(room).xp,2415);assert.throws(()=>evolve(3),/985/);earn(985);evolve(3);assert.throws(()=>evolve(4),/2600/);earn(2600);evolve(4);
 assert.equal(JSON.parse(s.get('SELECT story FROM pet_trips WHERE id=?',trip.id).story).pet.growth.stage,2);
});

test('进化权限属于领奖人，不能替另一个小屋操作，其他物种暂不冒充海豹进化',t=>{
 const {s,u,g,room,evolve,earn}=setup(t);
 assert.throws(()=>s.pets.evolve(g,{space_id:room,from:0}),/领奖人/);
 const other=s.newUser({username:'another_evolution',name:'旁观者',password:''});assert.throws(()=>s.pets.evolve(other,{space_id:room,from:0}),/没有向你开放/);
 evolve(0);earn(6000);s.pets.dress(u,{form:'pocket-glider'});assert.throws(()=>evolve(1),/换回糯糯海豹/);
 assert.match(petPortrait(s.pets.state(room)),/pocket-glider\/winged.png/);
 assert.ok(!petPortrait(s.pets.state(room),{locked:true}).includes('.png'));
});

test('schema 14 升级保留旧宠物姿态、财产和旅行，重启保持已选进化阶段',t=>{
 const dir=mkdtempSync(join(tmpdir(),'starlight-evolution-'));
 const {s,u,room,evolve,earn,create}=setup(t,join(dir,'test.sqlite'));t.after(()=>rmSync(dir,{recursive:true,force:true}));evolve(0);earn(6000);
 const low=s.personalSpaceId(u.id);s.run('INSERT INTO pets(space_id,form,outfit,created) VALUES(?,?,?,?)',low,'nuonuo-seal','',new Date().toISOString());
 const gear=s.issue(u,create('pet_pack'),'shop'),rolls=[0,0,0],trip=s.travel.depart(u,{card_ids:[gear.id]},()=>rolls.shift()).trip;
 const before={pets:s.all('SELECT * FROM pets'),ledger:s.all('SELECT * FROM ledger'),cards:s.all('SELECT * FROM cards'),trips:s.all('SELECT * FROM pet_trips')};
 s.db.exec('DROP TABLE pet_growth; PRAGMA user_version=14');migrate(s.db);migrate(s.db);
 assert.equal(s.get('PRAGMA user_version').user_version,20);assert.equal(s.pets.state(room).growth.stage,2);
 assert.equal(s.pets.state(low).growth.stage,1);assert.deepEqual(s.all('SELECT * FROM pets'),before.pets);assert.deepEqual(s.all('SELECT * FROM cards'),before.cards);assert.deepEqual(s.all('SELECT * FROM ledger'),before.ledger);assert.deepEqual(s.all('SELECT * FROM pet_trips'),before.trips);
 s.travel.maintain(trip.returnAt);
 evolve(2);const reopened=new Store(join(dir,'test.sqlite'));assert.equal(reopened.pets.state(room).growth.stage,3);assert.deepEqual(reopened.all('PRAGMA foreign_key_check'),[]);reopened.db.close();
 assert.equal(s.balance(room),16000*COIN);assert.equal(s.pets.state(room).xp,6015);
});
