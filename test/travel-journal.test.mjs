import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN,dayAt} from '../lib/common.mjs';
import {TRAVEL_STORIES} from '../lib/travel.mjs';
import {TRAVEL_NOTES,routeFor} from '../public/travel-notes.js';
import {postcardScene} from '../public/travel-art.js';
import {passport} from '../public/travel-journal.js';
import {createApp} from '../server.mjs';

function setup(t){const s=new Store(':memory:');t.after(()=>s.db.close());const a=s.newUser({username:'journal_a',name:'小树',password:''}),b=s.newUser({username:'journal_b',name:'小芽',password:''}),g=s.newUser({username:'journal_g',name:'伙伴',password:''});
 const room=s.pair(a.id,g.id).space_id;a.space_id=room;s.run('INSERT INTO pets VALUES(?,?,?,?)',room,'nuonuo-seal','',new Date().toISOString());s.tx(()=>s.post(room,2000*COIN,'test','测试补给','fixture'));s.addTemplates(g,{space_id:room,templates:['pet_snack','pet_feast','pet_tent','pet_pack']});
 const op=(route,body,fn,key=randomUUID())=>s.operation(a,key,route,{space_id:room,...body},()=>fn({space_id:room,...body}));
 const buy=(effect='pet_snack')=>op('/api/buy',{prize_id:s.get('SELECT id FROM prizes WHERE room_id=? AND effect=?',room,effect).id},b=>s.buy(a,b)).card;
 const depart=(extra={},effect='pet_snack',rolls=[0,0,7500])=>{const card=buy(effect),at=Date.now();return op('/api/pets/travel',{card_ids:[card.id],...extra},b=>s.travel.depart(a,b,max=>{const value=rolls.shift();assert.ok(value<max);return value;},at)).trip;};
 const back=trip=>{s.travel.maintain(trip.returnAt);return s.travel.readPostcard(a,{space_id:room,trip_id:trip.id});};
 return {s,a,b,g,room,op,buy,depart,back};}

test('路线和行囊影响去向，所选路线优先新地点，礼物与时长规则独立',t=>{
 const {s,room,depart,back}=setup(t);const one=depart({route:'auto'},'pet_tent');assert.equal(one.route,'nature');assert.equal(TRAVEL_NOTES[one.placeId].theme,'nature');back(one);
 const two=depart({route:'nature'});assert.notEqual(two.placeId,one.placeId);back(two);const three=depart({route:'nature'});assert.equal(three.placeId,one.placeId);back(three);
 const city=depart({route:'culture'});assert.equal(TRAVEL_NOTES[city.placeId].theme,'culture');assert.equal(city.durationHours,12);assert.equal(JSON.parse(s.get('SELECT gift FROM pet_trips WHERE id=?',city.id).gift).kind,'ticket');
 assert.equal(routeFor('auto',['pet_map']),'culture');assert.equal(routeFor('auto',['pet_lantern']),'culture');assert.equal(routeFor('auto',['pet_pack']),'surprise');assert.equal(s.travel.state(room).trip.gift,undefined);
});
test('半程来信只寄一次，不加经验或礼物；归来快照仍只结算一次',t=>{
 const {s,room,depart,back}=setup(t),trip=depart(),mid=(trip.departure+trip.returnAt)/2,before=s.pets.state(room).xp;
 s.travel.maintain(mid-1);assert.equal(s.travel.state(room).roadLetter,null);s.travel.maintain(mid);s.travel.maintain(mid+1);
 assert.match(s.travel.state(room).roadLetter.text,/小画/);assert.equal(s.get("SELECT COUNT(*) n FROM progress_events WHERE event_key LIKE 'travel-road:%'").n,1);assert.equal(s.pets.state(room).xp,before);assert.equal(s.get('SELECT COUNT(*) n FROM mail_gifts').n,0);
 back(trip);s.travel.maintain(trip.returnAt+1);assert.equal(s.pets.state(room).xp,before+5);assert.equal(s.get("SELECT COUNT(*) n FROM progress_events WHERE event_key LIKE 'travel-return:%'").n,1);
 assert.equal(s.travel.state(room).roadLetter,null);assert.ok(s.community.logs({id:s.get('SELECT learner_id FROM spaces WHERE id=?',room).learner_id},{space_id:room}).entries.some(e=>e.action==='pet.travel.letter'));
});
test('服务离线跨过整个旅程只补归来信，旧快照保持原目的地和奖励',t=>{
 const {s,room,depart,back}=setup(t),trip=depart(),row=s.get('SELECT * FROM pet_trips WHERE id=?',trip.id),story=JSON.parse(row.story);delete story.journeyVersion;delete story.knowledge;delete story.route;s.run('UPDATE pet_trips SET story=? WHERE id=?',JSON.stringify(story),trip.id);
 s.travel.maintain((trip.departure+trip.returnAt)/2);assert.equal(s.travel.state(room).roadLetter,null);const card=back(trip);assert.equal(card.story,story.story);assert.equal(card.knowledge.fact,TRAVEL_NOTES[story.id].fact);assert.equal(s.get('SELECT gift FROM pet_trips WHERE id=?',trip.id).gift,row.gift);
 const next=depart();s.travel.maintain(next.returnAt+86400000);assert.equal(s.get("SELECT COUNT(*) n FROM progress_events WHERE event_key LIKE 'travel-road:%'").n,0);
});
test('护照收集全部地点，最近六封之外仍可读信；未到访只显示轮廓',t=>{
 const {s,a,room,depart,back}=setup(t);const before=s.travel.state(room),html=passport(before,String);assert.ok(!html.includes('中国'));assert.ok(!html.includes('长城'));assert.equal((html.match(/passport-place locked/g)||[]).length,8);
 const ids=[];for(let i=0;i<8;i++){const trip=depart({route:'surprise'});ids.push(trip.id);back(trip);}
 const state=s.travel.state(room);assert.equal(state.history.length,6);assert.equal(state.album.filter(a=>a.visits).length,8);assert.ok(state.album.every(a=>a.visits===1));assert.ok(s.travel.readPostcard(a,{space_id:room,trip_id:ids[0]}).knowledge);
 assert.equal(new Set(TRAVEL_STORIES.map(s=>postcardScene(s.id))).size,8);assert.ok(TRAVEL_STORIES.every(s=>TRAVEL_NOTES[s.id]?.choices[TRAVEL_NOTES[s.id].answer]));
});
test('小发现只能本人写，保存不加币，冲突不覆盖；发奖人可以看',t=>{
 const {s,a,b,g,room,op,depart,back}=setup(t),trip=depart();back(trip);const before=s.balance(room),xp=s.pets.state(room).xp;
 op('/api/pets/travel/memory',{trip_id:trip.id,memory:'原来长城不是一天修好的。',expectedMemory:''},b=>s.travel.remember(a,b));assert.equal(s.travel.readPostcard(g,{space_id:room,trip_id:trip.id}).memory,'原来长城不是一天修好的。');assert.equal(s.balance(room),before);assert.equal(s.pets.state(room).xp,xp);
 assert.throws(()=>s.travel.remember(a,{space_id:room,trip_id:trip.id,memory:'覆盖',expectedMemory:''}),/更新/);assert.throws(()=>s.travel.remember(g,{space_id:room,trip_id:trip.id,memory:'代写',expectedMemory:''}),e=>e.status===403);assert.throws(()=>s.travel.readPostcard(b,{space_id:room,trip_id:trip.id}),/开放/);
 assert.throws(()=>s.travel.remember(a,{space_id:room,trip_id:trip.id,memory:'太'.repeat(241),expectedMemory:''}),/240/);
});
test('见闻生成小计划需要完成后才发币，每趟至多一份并沿用小屋规则',t=>{
 const {s,a,room,op,depart,back}=setup(t),trip=depart();back(trip);const coins=s.balance(room),xp=s.pets.state(room).xp;
 const add=()=>op('/api/pets/travel/practice',{trip_id:trip.id,start_date:dayAt()},b=>s.travel.practice(a,b));const one=add(),two=add();assert.equal(two.already,true);assert.equal(two.task_id,one.task_id);assert.equal(s.get('SELECT COUNT(*) n FROM tasks').n,1);assert.equal(s.balance(room),coins);assert.equal(s.pets.state(room).xp,xp);
 const task=s.get('SELECT * FROM tasks WHERE id=?',one.task_id);assert.equal(task.estimated_minutes,15);assert.equal(task.difficulty,s.settings(room).defaultDifficulty);assert.equal(task.family_plan_id,null);
 op('/api/complete',{task_id:one.task_id,done:true},b=>s.complete(a,b));assert.equal(s.balance(room),coins+20*COIN);assert.equal(s.pets.state(room).xp,xp+20);assert.equal(add().already,true);
});
test('失败时学习计划与旅行关联一起回滚，正在旅行不能提前领见闻任务',t=>{
 const {s,a,room,op,depart,back}=setup(t),trip=depart();assert.throws(()=>s.travel.practice(a,{space_id:room,trip_id:trip.id}),/送到/);back(trip);
 s.db.exec("CREATE TRIGGER fail_trip_update BEFORE UPDATE ON pet_trips BEGIN SELECT RAISE(ABORT,'test note unavailable');END;");assert.throws(()=>op('/api/pets/travel/practice',{trip_id:trip.id},b=>s.travel.practice(a,b)),/unavailable/);assert.equal(s.get('SELECT COUNT(*) n FROM tasks').n,0);assert.equal(JSON.parse(s.get('SELECT story FROM pet_trips').story).practiceTaskId,undefined);
});
test('返程礼物可从旧明信片领取，两次领取只得到一次，其他人不能收',t=>{
 const {s,a,b,room,op,depart,back}=setup(t),trip=depart(),card=back(trip);assert.equal(card.hasGift,true);assert.equal(s.travel.state(room).pendingGifts.length,1);
 assert.throws(()=>s.progress.claim(b,{mail_id:card.mailId}),/信箱/);const claim=()=>op('/api/mail/claim',{mail_id:card.mailId},b=>s.progress.claim(a,b));claim();claim();assert.equal(s.ticketBalance(room),1);assert.equal(s.travel.state(room).pendingGifts.length,0);assert.equal(s.travel.readPostcard(a,{space_id:room,trip_id:trip.id}).claimed,true);
});
test('新接口与插画模块可达，明信片需要登录和房间权限',async t=>{
 const app=await createApp({dbPath:':memory:',demo:false}),s=app.store;await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(async()=>{await new Promise(r=>app.server.close(r));s.db.close();});const base='http://127.0.0.1:'+app.server.address().port;
 for(const file of ['travel-notes.js','travel-art.js','travel-journal.js'])assert.equal((await fetch(base+'/'+file)).status,200);
 assert.equal((await fetch(base+'/api/pets/postcard?trip_id=x')).status,401);
 const a=s.newUser({username:'journal_http',name:'测试',password:''}),session=s.session(a.id),headers={Cookie:'starlight_session='+session.token,Origin:base,'Content-Type':'application/json'};
 assert.equal((await fetch(base+'/api/pets/postcard?trip_id=x',{headers})).status,404);
 for(const endpoint of ['memory','practice'])assert.equal((await fetch(base+'/api/pets/travel/'+endpoint,{method:'POST',headers,body:'{}'})).status,403);
});
