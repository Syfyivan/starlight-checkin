import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {TRAVEL_DURATION_ODDS,TRAVEL_GIFT_ODDS,TRAVEL_STORIES} from '../lib/travel.mjs';

const AT=Date.parse('2030-01-01T00:00:00Z'),DAY=86400_000;
const random=(duration=0,destination=0,gift=0)=>{const values=[duration,destination,gift];return max=>{assert.ok(values.length,'unexpected reroll');const value=values.shift();assert.ok(value<max);return value;};};
function setup(t,path=':memory:'){
  let s=new Store(path);t.after(()=>s.db.close());
  const a=s.newUser({username:'learner',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'晴天',password:''}),o=s.newUser({username:'other',name:'路过',password:''});
  const room=s.pair(a.id,g.id).space_id;a.space_id=room;
  const pet=(space=room)=>s.run('INSERT INTO pets VALUES(?,?,?,?)',space,'nuonuo-seal','',new Date(AT-DAY).toISOString());
  const card=(effect='pet_snack',space=room,user=a)=>{
    const manager=s.get('SELECT giver_id FROM spaces WHERE id=?',space).giver_id;
    const result=s.savePrize({...g,id:manager},{space_id:space,title:'旅行测试用品',description:'测试',category:'custom',face_cents:0,effect,channel:'shop',emoji:'🎒',cost:10,stock:10,weight:0,wait_days:0,active:true});
    return s.issue({...user,space_id:space},s.get('SELECT * FROM prizes WHERE id=?',result.id),'shop');
  };
  const depart=(cards,extra={},rng=random(),user=a,key=randomUUID())=>{
    const body={space_id:room,card_ids:cards.map(c=>c.id),...extra};
    return s.operation(user,key,'/api/pets/travel',body,()=>s.travel.depart(user,body,rng,AT));
  };
  return {get s(){return s;},a,g,o,room,pet,card,depart,reopen(){s.db.close();s=new Store(path);return s;}};
}

test('旅行消耗行囊一次、公开时长概率，经验只在归来增加',t=>{
  const {s,a,room,pet,card,depart}=setup(t);pet();const food=card('pet_feast'),gear=card('pet_tent'),key=randomUUID();
  const result=depart([food,gear],{},random(5000,3,7500),a,key);
  assert.equal(result.trip.durationHours,24);assert.equal(result.trip.xp,60);assert.equal(result.trip.remainingMs,DAY);
  assert.equal(result.trip.destination,'日本 · 京都');assert.equal(result.trip.gift,undefined);assert.equal(s.pets.state(room).xp,0);
  assert.ok(s.all('SELECT status FROM cards').every(c=>c.status==='used'));
  assert.equal(depart([food,gear],{},()=>{throw Error('must not reroll');},a,key).trip.id,result.trip.id);
  assert.throws(()=>s.pets.use(a,{card_id:food.id}),/用过/);
  assert.equal(s.travel.maintain(AT+DAY-1).returned,0);assert.equal(s.pets.state(room).xp,0);
  assert.equal(s.travel.maintain(AT+DAY).returned,1);assert.equal(s.pets.state(room).xp,60);
  assert.equal(s.get('SELECT COUNT(*) n FROM pet_experience').n,0);assert.equal(s.balance(room),0);
  const done=s.travel.state(room,AT+DAY);assert.equal(done.away,false);assert.ok(done.lastTrip.mailId);
  assert.equal(s.ticketBalance(room),0,'gift stays in the mailbox until claimed');
  const claim=()=>s.operation(a,randomUUID(),'mail-claim',{mail_id:done.lastTrip.mailId},()=>s.progress.claim(a,{mail_id:done.lastTrip.mailId}));
  claim();claim();assert.equal(s.ticketBalance(room),1);
  for(let i=0;i<3;i++)assert.equal(s.travel.maintain(AT+DAY).returned,0);
  assert.equal(s.pets.state(room).xp,60);assert.equal(s.get("SELECT COUNT(*) n FROM progress_events WHERE event_key LIKE 'travel-return:%'").n,1);
  assert.deepEqual(done.durationOdds,TRAVEL_DURATION_ODDS);assert.deepEqual(done.giftOdds,TRAVEL_GIFT_ODDS);
});

test('旅行只允许本人使用本屋可用卡，拒绝重复种类、延迟卡、负余额与无宠物',t=>{
  const {s,a,g,o,room,pet,card,depart}=setup(t),food=card(),food2=card('pet_feast');
  assert.throws(()=>depart([food]),/遇见/);pet();
  assert.throws(()=>depart([food],{},random(),g),/领奖人/);assert.throws(()=>depart([food],{},random(),o),/没有向你开放/);
  assert.throws(()=>depart([]),/1–2/);assert.throws(()=>depart([food,food]),/1–2/);assert.throws(()=>depart([food,food2]),/最多带/);
  assert.throws(()=>depart([card('pet_bow')]),/装扮/);
  s.run('UPDATE cards SET available=? WHERE id=?',new Date(AT+DAY).toISOString(),food.id);assert.throws(()=>depart([food]),/已经可用/);
  s.run('UPDATE cards SET available=? WHERE id=?','2020-01-01',food.id);
  const other=s.pair(a.id,o.id).space_id,otherCard=card('pet_snack',other);
  assert.throws(()=>depart([otherCard]),/本屋/);
  s.post(room,-COIN,'test','negative','test');assert.throws(()=>depart([food]),/补足/);s.post(room,COIN,'test','restore','test');
  assert.equal(s.get('SELECT COUNT(*) n FROM pet_trips').n,0);assert.equal(s.get('SELECT status FROM cards WHERE id=?',food.id).status,'ready');
  s.run("UPDATE spaces SET status='unbound' WHERE id=?",room);assert.throws(()=>depart([food]),/收起来/);
});

test('一个小屋同时只能有一趟旅行，数据库唯一约束同样生效',t=>{
  const {s,room,pet,card,depart}=setup(t);pet();const first=card(),second=card();depart([first]);
  assert.throws(()=>depart([second]),/已经出门/);assert.equal(s.get('SELECT status FROM cards WHERE id=?',second.id).status,'ready');
  assert.throws(()=>s.run("INSERT INTO pet_trips SELECT ?,space_id,departure,return_at,duration_hours,xp,supplies,destination,story,gift,status,mail_id,created FROM pet_trips WHERE space_id=?",randomUUID(),room),/UNIQUE/);
  assert.equal(s.get('SELECT COUNT(*) n FROM pet_trips').n,1);
});

test('出发或归来失败会原子回滚，归来记录、邮件与经验不会分离',t=>{
  const {s,room,pet,card,depart}=setup(t);pet();const food=card(),audit=s.community.audit;
  s.community.audit=()=>{throw Error('audit unavailable');};assert.throws(()=>depart([food]),/audit unavailable/);s.community.audit=audit;
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',food.id).status,'ready');assert.equal(s.get('SELECT COUNT(*) n FROM pet_trips').n,0);
  const result=depart([food],{},random(0,0,7500));
  const mail=s.progress.mail;s.progress.mail=function(...args){mail.apply(this,args);throw Error('mail unavailable');};
  assert.throws(()=>s.travel.maintain(result.trip.returnAt),/mail unavailable/);s.progress.mail=mail;
  assert.equal(s.get('SELECT status FROM pet_trips').status,'away');assert.equal(s.get('SELECT COUNT(*) n FROM mail_gifts').n,0);assert.equal(s.pets.state(room).xp,0);
  assert.equal(s.travel.maintain(result.trip.returnAt).returned,1);assert.equal(s.pets.state(room).xp,5);
});

test('时长与礼物边界概率正确，全部目的地具有知识来源',t=>{
  const {s,room,pet,card,depart}=setup(t);pet();
  for(const [roll,hours] of [[0,12],[4999,12],[5000,24],[7999,24],[8000,48],[9499,48],[9500,72],[9999,72]]){
    const trip=depart([card()],{},random(roll,0,0)).trip;assert.equal(trip.durationHours,hours);s.travel.maintain(trip.returnAt);
  }
  for(const [roll,kind,effect] of [[0,null,null],[6999,null,null],[7000,'ticket',null],[8999,'ticket',null],[9000,'item','pet_snack'],[9799,'item','pet_snack'],[9800,'item','pet_bow'],[9999,'item','pet_bow']]){
    const trip=depart([card()],{},random(0,0,roll)).trip,gift=JSON.parse(s.get('SELECT gift FROM pet_trips WHERE id=?',trip.id).gift);
    assert.equal(gift?.kind||null,kind);assert.equal(gift?.effect||null,effect);s.travel.maintain(trip.returnAt);
  }
  assert.equal(TRAVEL_DURATION_ODDS.reduce((n,p)=>n+Math.round(p.probability*100),0),100);
  assert.equal(TRAVEL_GIFT_ODDS.reduce((n,p)=>n+Math.round(p.probability*100),0),100);
  assert.ok(TRAVEL_STORIES.length>=8);assert.equal(new Set(TRAVEL_STORIES.map(s=>s.id)).size,TRAVEL_STORIES.length);
  assert.ok(TRAVEL_STORIES.every(s=>s.story.length>50&&s.source.startsWith('https://whc.unesco.org/en/list/')));
  assert.equal(s.travel.state(room).away,false);
});

test('重复装扮改口粮，出发后新解锁也不会带回重复装扮',t=>{
  const {s,room,pet,card,depart}=setup(t);pet();const first=depart([card()],{},random(0,0,9800)).trip;
  s.run('INSERT INTO pet_outfits VALUES(?,?,?)',room,'pet_bow',new Date(AT).toISOString());
  s.travel.maintain(first.returnAt);let gift=JSON.parse(s.get('SELECT gift FROM mail_gifts').gift);assert.equal(gift.effect,'pet_snack');
  const second=depart([card()],{},random(0,0,9800)).trip;gift=JSON.parse(s.get('SELECT gift FROM pet_trips WHERE id=?',second.id).gift);assert.equal(gift.effect,'pet_snack');
});

test('旅行邀请最多每周一封，归来先休息一天，关闭的小屋仍能收归来信',t=>{
  const {s,room,pet,card,depart}=setup(t);pet();
  const count=()=>s.get("SELECT COUNT(*) n FROM progress_events WHERE event_key LIKE 'travel-invite:%'").n;
  s.travel.maintain(AT);s.travel.maintain(AT+DAY);assert.equal(count(),1);
  s.travel.maintain(AT+7*DAY);assert.equal(count(),2);
  const result=depart([card()],{},random(0,0,0));s.travel.maintain(result.trip.returnAt);assert.equal(count(),2);
  s.travel.maintain(result.trip.returnAt+DAY-1);assert.equal(count(),2);s.travel.maintain(result.trip.returnAt+DAY);assert.equal(count(),3);
  const next=depart([card()],{},random(0,0,7500));s.run("UPDATE spaces SET status='unbound' WHERE id=?",room);
  s.travel.maintain(next.trip.returnAt+9*DAY);assert.equal(s.get('SELECT status FROM pet_trips WHERE id=?',next.trip.id).status,'returned');assert.equal(count(),3);
});

test('重启后按保存的旅程补发来信，不重新抽签，关闭小屋也能领取旧礼物',t=>{
  const dir=mkdtempSync(join(tmpdir(),'starlight-travel-')),path=join(dir,'test.sqlite');
  const f=setup(t,path);
  // Remove only the known fixture files in the newly-created temporary directory.
  t.after(()=>{for(const suffix of ['','-wal','-shm'])rmSync(path+suffix,{force:true});rmdirSync(dir);});
  f.pet();const result=f.depart([f.card()],{},random(0,4,7500));
  const before=f.s.get('SELECT duration_hours,destination,story,gift,xp FROM pet_trips');f.reopen();
  assert.deepEqual(f.s.get('SELECT duration_hours,destination,story,gift,xp FROM pet_trips'),before);
  f.s.run("UPDATE spaces SET status='unbound' WHERE id=?",f.room);f.s.travel.maintain(result.trip.returnAt+DAY);
  const mid=f.s.travel.state(f.room).lastTrip.mailId;f.s.tx(()=>f.s.progress.claim(f.a,{mail_id:mid}));
  assert.equal(f.s.ticketBalance(f.room),1);assert.equal(f.s.pets.state(f.room).xp,5);
  f.reopen();f.s.travel.maintain(result.trip.returnAt+2*DAY);assert.equal(f.s.ticketBalance(f.room),1);
  assert.equal(f.s.get("SELECT COUNT(*) n FROM progress_events WHERE event_key LIKE 'travel-return:%'").n,1);
  assert.equal(f.s.get('PRAGMA integrity_check').integrity_check,'ok');assert.deepEqual(f.s.all('PRAGMA foreign_key_check'),[]);
});
