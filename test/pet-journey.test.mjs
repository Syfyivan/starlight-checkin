import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {PET_FORMS,PET_ITEMS,PET_LEVELS} from '../lib/pets.mjs';
import {petItemLock} from '../public/pet-catalog.js';
import {petUI} from '../public/pets.js';

function fixture(t){
 const s=new Store(':memory:');t.after(()=>s.db.close());
 const learner=s.newUser({username:'pet_journey',name:'体验者',password:''}),giver=s.newUser({username:'pet_partner',name:'伙伴',password:''});
 const room=s.pair(learner.id,giver.id).space_id;learner.space_id=room;
 const op=(route,body,fn,key=randomUUID())=>s.operation(learner,key,route,{space_id:room,...body},()=>fn({space_id:room,...body}));
 s.tx(()=>s.post(room,20000*COIN,'test_grant','测试币不计经验','fixture'));
 s.addTemplates(giver,{space_id:room,templates:Object.entries(PET_ITEMS).filter(([,i])=>i.ready!==false).map(([id])=>id)});
 const p=s.savePrize(giver,{space_id:room,title:'小伙伴敲敲门',description:'抽到后迎接入住',emoji:'🐾',category:'custom',face_cents:0,effect:'pet_companion',channel:'lottery',cost:100,stock:1,weight:100,wait_days:0,active:true});
 s.postTickets(room,1,'test_grant','测试抽奖机会','fixture');
 const hit=op('/api/draw',{mode:'ticket'},b=>s.draw(learner,b,()=>{let roll=0;for(const entry of s.pool(room)){if(entry.id===p.id)return roll;roll+=entry.weight;}throw Error('Missing pet prize');})).card;
 const use=(card,key)=>{const r=op('/api/pets/use',{card_id:card.id},b=>s.pets.use(learner,b),key);if(s.pets.state(room).growth?.stage===0)op('/api/pets/evolve',{from:0},b=>s.pets.evolve(learner,b));return r;};
 const buy=effect=>op('/api/buy',{prize_id:s.get("SELECT id FROM prizes WHERE room_id=? AND effect=? AND channel='shop' AND removed=0",room,effect).id},b=>s.buy(learner,b)).card;
 const dress=(form,outfit='')=>op('/api/pets/dress',{form,outfit},b=>s.pets.dress(learner,b));
 const earn=points=>{const id=op('/api/tasks',{tasks:[{title:'体验成长',task_kind:'long',points}]},b=>s.createTasks(learner,b)).ids[0];op('/api/complete',{task_id:id,done:true},b=>s.complete(learner,b));return id;};
 return {s,learner,giver,room,op,hit,use,buy,dress,earn};
}

test('从抽到第一只宠物开始，逐个跨过 Lv.1–10 边界，花币不降低经验',t=>{
 const {s,room,hit,use,earn,buy}=fixture(t);
 assert.equal(s.pets.state(room).owned,false);assert.equal(s.pets.state(room).xp,0);
 use(hit);assert.equal(s.pets.state(room).owned,true);assert.equal(s.pets.state(room).level,1);
 for(let index=1;index<PET_LEVELS.length;index++){
  const boundary=PET_LEVELS[index],before=s.pets.state(room).xp;
  earn(boundary-before-1);assert.equal(s.pets.state(room).level,index,'threshold - 1: '+boundary);
  earn(1);const pet=s.pets.state(room);assert.equal(pet.xp,boundary);assert.equal(pet.level,index+1);
  assert.equal(pet.stage,index+1>=4?'winged':'young');
  const balance=s.balance(room);buy('pet_snack');assert.equal(s.balance(room),balance-PET_ITEMS.pet_snack.cost*COIN);assert.equal(s.pets.state(room).xp,boundary);
 }
 assert.equal(s.pets.state(room).nextXp,null);assert.equal(s.pets.state(room).level,10);
});

test('一级衣橱的后两种形象只有轮廓；升级后分别开放，喂食可以跨过升级线',async t=>{
 const {s,learner,room,hit,use,buy,earn,dress}=fixture(t);use(hit);
 let html='';const ui=petUI({getState:()=>s.state(learner,room),esc:String,canAct:()=>true,openDialog:(_title,body)=>{html=body;},actions:()=>'',mutation:()=>{throw Error('Unexpected mutation');}});
 await ui.click('pet-dress',{});
 assert.match(html,/pets\/nuonuo-seal\/young.png/);
 for(const form of PET_FORMS.slice(1)){assert.ok(!html.includes('pets/'+form.id+'/'));assert.ok(!html.includes(form.name));assert.throws(()=>dress(form.id),/解锁/);}
 assert.equal((html.match(/pet-form-option locked/g)||[]).length,2);
 assert.equal(petItemLock(s.pets.state(room),'pet_scarf'),'未解锁 · Lv.2');
 earn(95);const food=buy('pet_snack');use(food);assert.equal(s.pets.state(room).xp,100);assert.equal(s.pets.state(room).level,2);
 assert.equal(petItemLock(s.pets.state(room),'pet_scarf'),'');
 earn(200);dress('pocket-glider');await ui.click('pet-dress',{});assert.match(html,/pets\/pocket-glider\/young.png/);assert.ok(!html.includes('pets/cottonpod-hermit/'));
 earn(700);dress('cottonpod-hermit');await ui.click('pet-dress',{});assert.match(html,/pets\/cottonpod-hermit\/winged.png/);assert.equal((html.match(/pet-form-option locked/g)||[]).length,0);
});

test('8款装扮逐件购买、使用并在3种形象切换，重复请求和重复穿戴不加经验',t=>{
 const {s,room,hit,use,buy,earn,dress}=fixture(t);use(hit);earn(6000);
 const outfits=Object.entries(PET_ITEMS).filter(([,i])=>i.kind==='outfit'&&i.ready!==false);assert.equal(outfits.length,8);
 let expected=6000;
 for(const [effect,item] of outfits){
  const balance=s.balance(room),card=buy(effect),key=randomUUID();
  assert.equal(s.balance(room),balance-item.cost*COIN);assert.equal(s.pets.state(room).xp,expected);
  use(card,key);expected+=item.xp;assert.equal(s.pets.state(room).xp,expected);assert.equal(s.pets.state(room).outfit,effect);
  use(card,key);assert.equal(s.pets.state(room).xp,expected);assert.throws(()=>use(card),/用过/);assert.throws(()=>buy(effect),/已经在/);
  for(const form of PET_FORMS){dress(form.id,effect);const state=s.pets.state(room);assert.equal(state.form,form.id);assert.equal(state.outfit,effect);assert.equal(state.xp,expected);}
  dress('nuonuo-seal');assert.equal(s.pets.state(room).outfit,'');assert.equal(s.pets.state(room).xp,expected);
 }
 assert.equal(s.pets.state(room).outfits.length,8);assert.equal(s.all('SELECT * FROM pet_experience').length,8);
 for(const effect of ['pet_raincoat','pet_space']){assert.match(petItemLock(s.pets.state(room),effect),/正在准备/);assert.throws(()=>dress('nuonuo-seal',effect),/准备/);}
});

test('行囊消费、旅途锁定、归来升级、明信片及礼物领取形成完整且不重复的流程',t=>{
 const {s,learner,room,op,hit,use,buy,earn,dress}=fixture(t);use(hit);earn(80);
 const food=buy('pet_feast'),gear=buy('pet_pack'),later=buy('pet_snack'),start=Date.now(),key=randomUUID();let values=[0,0,7500];
 const body={card_ids:[food.id,gear.id]},depart=b=>s.travel.depart(learner,b,()=>values.shift(),start);
 const trip=op('/api/pets/travel',body,depart,key).trip;
 assert.equal(trip.durationHours,12);assert.equal(trip.xp,35);assert.equal(trip.gift,undefined);assert.equal(s.pets.state(room).xp,80);
 assert.equal(op('/api/pets/travel',body,depart,key).trip.id,trip.id);assert.equal(values.length,0);
 assert.throws(()=>use(later),/旅行/);assert.throws(()=>dress('nuonuo-seal'),/旅行/);assert.equal(s.get('SELECT status FROM cards WHERE id=?',later.id).status,'ready');
 assert.equal(s.travel.maintain(trip.returnAt-1).returned,0);assert.equal(s.travel.maintain(trip.returnAt).returned,1);
 const pet=s.pets.state(room),history=s.travel.state(room).history;assert.equal(pet.xp,115);assert.equal(pet.level,2);assert.equal(history.length,1);assert.ok(history[0].story.length>50);assert.equal(history[0].hasGift,true);assert.equal(history[0].claimed,false);
 assert.equal(s.ticketBalance(room),0);const claim=()=>op('/api/mail/claim',{mail_id:history[0].mailId},b=>s.progress.claim(learner,b));claim();claim();assert.equal(s.ticketBalance(room),1);
 s.travel.maintain(trip.returnAt);assert.equal(s.pets.state(room).xp,115);assert.equal(s.travel.state(room).history.length,1);assert.equal(s.travel.state(room).history[0].claimed,true);
 use(later);assert.equal(s.pets.state(room).xp,120);assert.equal(s.travel.state(room).away,false);
});
