import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {TRAVEL_STORIES} from '../lib/travel.mjs';
import {KEEPSAKES,THEMED_ROUTES,composeReturnLetter,composeMidwayLetter} from '../public/travel-notes.js';
import {postcardScene,keepsakeIcon} from '../public/travel-art.js';
import {petPortrait} from '../public/pets.js';
import {bestHand,analyzeHand} from '../lib/poker.mjs';
import {pokerTable,pokerHouseEntry} from '../public/poker-table.js';

function makeRoom(t){
  const s=new Store(':memory:');
  t.after(()=>s.db.close());
  const learner=s.newUser({username:'upgrade_learner',name:'小树',password:''});
  const giver=s.newUser({username:'upgrade_giver',name:'晴天',password:''});
  const room=s.pair(learner.id,giver.id).space_id;
  learner.space_id=room;
  s.post(room,5000*COIN,'test_grant','测试补给','fixture');
  const op=(route,body,fn,key=randomUUID())=>s.operation(learner,key,route,{space_id:room,...body},()=>fn({space_id:room,...body}));
  return {s,learner,giver,room,op};
}

test('旅行2.0：64站全部采用纯矢量绘本风景与纪念物，支持6种信件体裁与6种伙伴专属口吻',()=>{
  assert.equal(TRAVEL_STORIES.length,64);
  assert.equal(THEMED_ROUTES.length,10);
  for(const stop of TRAVEL_STORIES){
    const scene=postcardScene(stop.id,{mood:'dusk',cameo:'fox'});
    const icon=keepsakeIcon(stop.id);
    const bare=keepsakeIcon(stop.id,{bare:true});
    assert.ok(scene.includes('<svg')&&!scene.includes('<text'),'no emoji text placeholder in postcardScene: '+stop.id);
    assert.ok(icon.includes('<svg')&&!icon.includes('<text'),'no emoji text placeholder in keepsakeIcon: '+stop.id);
    assert.ok(!bare.includes('r="29"'),'bare tabletop souvenir omits sticker circle: '+stop.id);
    const clue=KEEPSAKES[stop.id];
    assert.ok(clue&&clue.clue.length>=10,'clue exists for '+stop.id);
    assert.ok(!stop.story.startsWith(clue.clue.slice(0,18)),'riddle is custom non-verbatim for '+stop.id);
  }
  const letters=new Set();
  for(let seed=0;seed<6;seed++){
    const res=composeReturnLetter({placeId:'vatnajokull',baseStory:'测试正文',form:['nuonuo-seal','cloud-fox','pocket-glider','moon-bunny','cottonpod-hermit','moss-dragon'][seed],mood:'night',cameo:'fox',effects:['pet_lantern'],seed});
    letters.add(res.text);
    assert.ok(res.letterBadge.length>2);
    assert.match(composeMidwayLetter({midway:'半路信',routeName:'山野自然',form:'cloud-fox',seed}),/小画/);
  }
  assert.equal(letters.size,6,'distinct species voices and genres produce distinct letters');
});

test('旅行2.0：途中分岔回信加经验与彩蛋，明信片抄送伙伴信箱，纪念物可摆上窗台',t=>{
  const {s,learner,giver,room,op}=makeRoom(t);
  s.run('INSERT INTO pets VALUES(?,?,?,?)',room,'cloud-fox','',new Date().toISOString());
  s.run('INSERT INTO pet_species_growth VALUES(?,?,2,?)',room,'cloud-fox',new Date().toISOString());
  s.addTemplates(giver,{space_id:room,templates:['pet_feast','pet_sketchbook','pet_scarf','pet_satchel']});
  // Unlock Lv.5 for wanderer set
  const tid=s.createTasks(learner,{space_id:room,tasks:[{title:'长期积累',task_kind:'long',points:1200}]}).ids[0];
  s.complete(learner,{space_id:room,task_id:tid,done:true});
  for(const eff of ['pet_scarf','pet_satchel']){
    const pr=s.get('SELECT * FROM prizes WHERE room_id=? AND effect=?',room,eff);
    const card=s.issue(learner,pr,'shop');
    s.pets.use(learner,{space_id:room,card_id:card.id});
  }
  s.pets.dress(learner,{space_id:room,form:'cloud-fox',equipped:{head:'',neck:'pet_scarf',body:'pet_satchel',companion:''},transforms:{neck:{dx:12,dy:-6,scale:1.15,rot:-8}}});
  const dressedPet=s.pets.state(room);
  assert.deepEqual(dressedPet.transforms.neck,{dx:12,dy:-6,scale:1.15,rot:-8});
  assert.match(petPortrait(dressedPet),/rotate\(-8\)/);
  const food=s.issue(learner,s.get('SELECT * FROM prizes WHERE room_id=? AND effect=?',room,'pet_feast'),'shop');
  const gear=s.issue(learner,s.get('SELECT * FROM prizes WHERE room_id=? AND effect=?',room,'pet_sketchbook'),'shop');
  const start=Date.now(),rolls=[0,0,8500];
  const trip=op('/api/pets/travel',{card_ids:[food.id,gear.id]},b=>s.travel.depart(learner,b,()=>rolls.shift(),start)).trip;
  assert.equal(rolls.length,0);
  assert.ok(trip.choices.length===2);
  // Choose midway direction -> wanderer set adds +8 on top of +12 = +20 XP!
  const beforeTripXp=trip.xp;
  const chosen=op('/api/pets/travel/choice',{trip_id:trip.id,choice:trip.choices[0].id},b=>s.travel.chooseDirection(learner,b));
  assert.equal(chosen.bonusXp,20);
  assert.equal(s.travel.state(room).trip.xp,beforeTripXp+20);
  const again=s.travel.chooseDirection(learner,{space_id:room,trip_id:trip.id,choice:trip.choices[1].id});
  assert.equal(again.already,true);
  assert.equal(s.travel.state(room).trip.xp,beforeTripXp+20);

  s.travel.maintain(trip.returnAt);
  const postcard=s.travel.readPostcard(learner,{space_id:room,trip_id:trip.id});
  assert.ok(postcard.postscript.length>10);
  // Find keepsake and place on cottage windowsill
  const placeId=postcard.placeId;
  assert.throws(()=>s.pets.decorateShelf(learner,{space_id:room,shelf:[placeId]}),/已经收集/);
  const found=s.travel.findKeepsake(learner,{space_id:room,trip_id:trip.id,choice:KEEPSAKES[placeId].answer});
  assert.equal(found.found,true);
  op('/api/pets/shelf',{shelf:[placeId]},b=>s.pets.decorateShelf(learner,b));
  assert.deepEqual(s.pets.state(room).shelf,[placeId]);

  // Share postcard to giver inbox (rejects duplicate share)
  op('/api/pets/travel/share',{trip_id:trip.id},b=>s.travel.sharePostcard(learner,b));
  assert.throws(()=>s.travel.sharePostcard(learner,{space_id:room,trip_id:trip.id}),/已经抄送/);
  const giverInbox=s.community.inbox(giver,{});
  assert.ok(giverInbox.entries.some(m=>m.kind==='notice'&&m.subject.includes(postcard.destination)));
});

test('德扑牌力与概率助手准确识别轮顺、葫芦、同花听牌与两头顺听牌',()=>{
  const wheel=bestHand(['Ah','2d','3c','4s','5h','Kd','9c']);
  assert.equal(wheel.name,'顺子');
  const fh=bestHand(['Kh','Kd','Ks','Qc','Qd','2h','3s']);
  assert.equal(fh.name,'葫芦');
  const drawInfo=analyzeHand(['Ah','Kh'],['7h','8h','9c']);
  assert.equal(drawInfo.made.name,'高牌');
  assert.ok(drawInfo.draws.some(d=>d.kind==='flush'&&d.outs===9&&Math.abs(d.nextPct-19.1)<0.2));
  const oesd=analyzeHand(['9s','Tc'],['7d','8h','2c']);
  assert.ok(oesd.draws.some(d=>d.kind==='straight'&&d.outs===8&&Math.abs(d.nextPct-17.0)<0.2));
});

test('星光牌屋：0码试玩零通胀、学习币1:1兑筹码、防买码直兑套利、打卡赠4码、动态对齐抽奖价与星狐彩金',t=>{
  const {s,learner,giver,room,op}=makeRoom(t);
  let p=s.poker.read(learner,{space_id:room});
  assert.equal(p.chips,0);
  assert.equal(p.earnedChips,0);
  assert.equal(p.ticketCost,20);
  assert.equal(p.minWinRequired,5);

  // 1. 0-chip practice mode: full 3-street play produces 0 chips & 0 milestone inflation!
  const pracRolls=[51,50,0,0,47,46,45,44,43, 10,10,10];
  p=op('/api/poker',{version:p.version,move:'deal',bet:0},b=>s.poker.move(learner,b,max=>Math.min(max-1,pracRolls.shift()??0))).table;
  assert.equal(p.hand.practice,true);
  p=op('/api/poker',{version:p.version,move:'check',handId:p.hand.id},b=>s.poker.move(learner,b)).table;
  p=op('/api/poker',{version:p.version,move:'bet',handId:p.hand.id},b=>s.poker.move(learner,b)).table;
  p=op('/api/poker',{version:p.version,move:'check',handId:p.hand.id},b=>s.poker.move(learner,b)).table;
  assert.equal(p.hand.outcome,'win');
  assert.equal(p.chips,0,'0-chip practice never mints chips');
  assert.equal(p.earnedChips,0);

  // 2. Buy 20 chips using 20 学习币 -> deducts ledger coins, but CANNOT pass-through directly to a lottery ticket without winning at poker!
  const balBefore=s.balance(room);
  p=op('/api/poker',{version:p.version,move:'buy_chips',coins:20},b=>s.poker.move(learner,b)).table;
  assert.equal(s.balance(room),balBefore-20*COIN);
  assert.equal(p.chips,20);
  assert.equal(p.earnedChips,0);
  assert.throws(()=>s.poker.move(learner,{space_id:room,version:p.version,move:'exchange'}),/净赢满 5 枚/);

  // 3. Complete a study task today -> unlocks modest +4 check-in bonus chips!
  assert.throws(()=>s.poker.move(learner,{space_id:room,version:p.version,move:'claim_task'}),/打卡/);
  const taskId=s.createTasks(learner,{space_id:room,tasks:[{title:'今日背单词',task_kind:'normal',points:20}]}).ids[0];
  s.complete(learner,{space_id:room,task_id:taskId,done:true});
  p=op('/api/poker',{version:p.version,move:'claim_task'},b=>s.poker.move(learner,b)).table;
  assert.equal(p.chips,24);
  assert.equal(p.earnedChips,0,'check-in bonus chips still require table wins before ticket exchange');

  // 4. Switch to Fox dealer (+20% win bonus) and play a real 3-street hand to earn net profit!
  p=op('/api/poker',{version:p.version,move:'dealer',dealer:'fox'},b=>s.poker.move(learner,b)).table;
  assert.equal(p.dealerId,'fox');

  const customRolls=[51,50,0,0,47,46,45,44,43, 10,10,10];
  p=op('/api/poker',{version:p.version,move:'deal',bet:10},b=>s.poker.move(learner,b,max=>Math.min(max-1,customRolls.shift()??0))).table;
  assert.equal(p.hand.street,'flop');
  assert.equal(p.hand.dealer,null,'dealer hole cards hidden during play');
  p=op('/api/poker',{version:p.version,move:'check',handId:p.hand.id},b=>s.poker.move(learner,b)).table;
  assert.equal(p.hand.street,'turn');
  assert.equal(p.hand.board.length,4);
  p=op('/api/poker',{version:p.version,move:'bet',handId:p.hand.id},b=>s.poker.move(learner,b)).table;
  assert.equal(p.hand.street,'river');
  assert.equal(p.hand.board.length,5);
  p=op('/api/poker',{version:p.version,move:'check',handId:p.hand.id},b=>s.poker.move(learner,b)).table;
  assert.equal(p.hand.street,'ended');
  assert.equal(p.hand.outcome,'win');
  assert.ok(p.hand.foxBonus>=4);
  assert.ok(p.earnedChips>=5);

  // 5. Exchange 20 chips (with >=5 net won) for 1 free lottery ticket!
  const ticketsBefore=s.ticketBalance(room);
  p=op('/api/poker',{version:p.version,move:'exchange'},b=>s.poker.move(learner,b)).table;
  assert.equal(s.ticketBalance(room),ticketsBefore+1);
  assert.equal(p.exchangedToday,1);
  // Default dailyTicketCap is 1/day!
  assert.throws(()=>s.poker.move(learner,{space_id:room,version:p.version,move:'exchange'}),/已兑满 1 次/);

  // 6. Dynamic ticketCost tracks room drawCost, and giver can disable poker house
  const curSettings=s.settings(room);
  s.saveSettings(giver,{...curSettings,space_id:room,drawCost:40,pokerDailyTickets:2,pokerEnabled:true});
  const scaled=s.poker.read(learner,{space_id:room});
  assert.equal(scaled.ticketCost,40);
  assert.equal(scaled.minWinRequired,10);
  s.saveSettings(giver,{...curSettings,space_id:room,pokerDailyTickets:1,pokerEnabled:false});
  assert.equal(pokerHouseEntry(s.poker.read(learner,{space_id:room}),true),'');
  assert.throws(()=>s.poker.move(learner,{space_id:room,version:p.version,move:'buy_chips',coins:10}),/收起了星光牌屋/);

  // 7. Clean visual-first UI renders 5:7 SVG cards (viewBox="0 0 100 140") without noisy card stickers
  const rendered=pokerTable(p);
  assert.match(rendered,/poker-house-modal/);
  assert.match(rendered,/viewBox="0 0 100 140"/);
  assert.match(rendered,/poker-coach-bar/);
  assert.ok(!rendered.includes('best-five-tag'));
  assert.match(pokerTable({chips:30,ticketCost:20,dailyChips:30,canClaim:false,hand:null}),/poker-move/);
});
