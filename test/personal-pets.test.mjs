import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {PET_ITEMS} from '../lib/pets.mjs';

function fixture(t){
 const s=new Store(':memory:');t.after(()=>s.db.close());
 const u=s.newUser({username:'personal_pet',name:'个人体验者',password:''}),other=s.newUser({username:'other_pet',name:'另一位',password:''}),space=s.personalSpaceId(u.id);
 s.run('INSERT INTO pets(space_id,form,outfit,created) VALUES(?,?,?,?)',space,'nuonuo-seal','',new Date().toISOString());
 s.post(space,10000*COIN,'test_grant','体验补给，不计经验','test');
 const op=(route,body,fn,key=randomUUID())=>s.operation(u,key,route,{space_id:space,...body},()=>fn({space_id:space,...body}));
 const buy=(effect,key)=>op('/api/buy',{prize_id:'personal-pet:'+effect,expectedCost:PET_ITEMS[effect]?.cost*COIN},b=>s.buy(u,b),key).card;
 const use=card=>op('/api/pets/use',{card_id:card.id},b=>s.pets.use(u,b));
 return {s,u,other,space,op,buy,use};
}

test('个人空间可独立购粮、喂食跨级、买装扮和旅行，全程不需要发奖人权限',t=>{
 const {s,u,space,op,buy,use}=fixture(t);
 let state=s.state(u,space);assert.equal(state.personalPetShop,true);assert.ok(!state.admin);assert.equal(state.prizes.length,17);assert.equal(state.pet.xp,0);
 for(let i=0;i<5;i++)use(buy('pet_feast'));
 assert.equal(s.pets.state(space).level,2);assert.equal(s.pets.state(space).xp,100);
 use(buy('pet_scarf'));assert.equal(s.pets.state(space).outfit,'pet_scarf');assert.equal(s.pets.state(space).xp,135);
 const food=buy('pet_snack'),gear=buy('pet_pack'),at=Date.now(),rolls=[0,0,7500];
 const trip=op('/api/pets/travel',{card_ids:[food.id,gear.id]},b=>s.travel.depart(u,b,()=>rolls.shift(),at)).trip;
 assert.equal(trip.durationHours,12);assert.throws(()=>use(buy('pet_feast')),/旅行/);
 s.travel.maintain(trip.returnAt);assert.equal(s.pets.state(space).xp,155);
 const mail=s.travel.state(space).history[0].mailId;
 op('/api/mail/claim',{mail_id:mail},b=>s.progress.claim(u,b));assert.equal(s.ticketBalance(space),1);
 const hit=op('/api/draw',{mode:'ticket'},b=>s.draw(u,b,()=>4000));assert.equal(hit.card.effect,'pet_snack');assert.equal(hit.card.face_cents,0);assert.equal(s.ticketBalance(space),0);
 use(hit.card);assert.equal(s.pets.state(space).xp,160);
 assert.equal(s.canManage(u,space),false);assert.equal(s.managerId(space),null);
 assert.ok(s.all('SELECT face_cents FROM cards WHERE space_id=?',space).every(c=>c.face_cents===0));
});

test('个人奖池的每种结果可领取，无报销负担，续杯不自动连抽',t=>{
 const {s,u,space,op,use}=fixture(t),pool=s.pool(space);
 assert.equal(pool.reduce((n,p)=>n+p.weight,0),10000);assert.equal(s.lottery.report(space).maximum_cents,0);
 let roll=0;
 for(const entry of pool){
  s.postTickets(space,1,'test','test',randomUUID());
  const key=randomUUID(),body={mode:'ticket'};
  const draw=()=>op('/api/draw',body,b=>s.draw(u,b,()=>roll),key);
  const before=s.ticketBalance(space),result=draw();assert.equal(JSON.stringify(draw()),JSON.stringify(result));
  assert.equal(s.ticketBalance(space),before-1+(entry.effect==='extra_draw'?1:0));
  if(result.card&&entry.effect!=='extra_draw')use(result.card);
  roll+=entry.weight;
 }
 assert.equal(s.all('SELECT * FROM draws WHERE space_id=?',space).length,pool.length);
 assert.ok(s.all('SELECT face_cents FROM cards WHERE space_id=?',space).every(c=>c.face_cents===0));
});

test('个人用品重试不重复扣币，不能越级、买未完成物品、伪造价钱或购买报销奖品',t=>{
 const {s,u,space,buy}=fixture(t),key=randomUUID(),first=buy('pet_snack',key);
 assert.equal(buy('pet_snack',key).id,first.id);assert.equal(s.balance(space),9990*COIN);
 for(const effect of ['pet_scarf','pet_raincoat','pet_companion','shop_drop','study'])assert.throws(()=>buy(effect));
 assert.throws(()=>s.operation(u,randomUUID(),'/api/buy',{},()=>s.buy(u,{space_id:space,prize_id:'personal-pet:pet_snack',expectedCost:1})),/价格/);
 assert.equal(s.balance(space),9990*COIN);assert.equal(s.pets.state(space).xp,0);
 assert.throws(()=>s.savePrize(u,{space_id:space}),/发奖人/);
 assert.throws(()=>s.saveSettings(u,{space_id:space}),/发奖人/);
});

test('个人小铺不能跨账号、绕过配对小屋的库存与定价，没宠物或已关闭也不能购买',t=>{
 const {s,u,other,space,buy}=fixture(t);
 assert.throws(()=>s.buy(other,{space_id:space,prize_id:'personal-pet:pet_snack'}),/没有向你开放/);
 const paired=s.pair(u.id,other.id).space_id;
 assert.throws(()=>s.buy(u,{space_id:paired,prize_id:'personal-pet:pet_snack'}),/个人空间/);
 assert.equal(s.pets.personalShop(paired),null);assert.equal(s.pets.personalShop(s.personalSpaceId(other.id)),null);
 s.run("UPDATE spaces SET status='deleted' WHERE id=?",space);
 assert.throws(()=>buy('pet_snack'),/收起来/);assert.equal(s.pets.personalShop(space),null);
});
