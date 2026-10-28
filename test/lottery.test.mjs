import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';
import {COIN} from '../lib/common.mjs';
import {migrate} from '../lib/migrate.mjs';
import {inversePrices} from '../lib/lottery.mjs';
import {createApp} from '../server.mjs';

function setup(t){
  const s=new Store(':memory:');t.after(()=>s.db.close());
  const a=s.newUser({username:'learner',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'晴天',password:''}),other=s.newUser({username:'outsider',name:'路过',password:''});
  const room=s.pair(a.id,g.id).space_id;a.space_id=room;s.post(room,10000*COIN,'test','测试','x');
  const op=(u,route,body,fn,key=randomUUID())=>{body={space_id:room,...body};return s.operation(u,key,route,body,()=>fn(u,body));};
  const prize=(extra={})=>{const r=s.savePrize(g,{space_id:room,title:'学习小卡',description:'测试报销',emoji:'🌱',category:'study',face_cents:500,cost:25,stock:10,weight:5,wait_days:0,active:true,...extra});return s.get('SELECT * FROM prizes WHERE id=?',r.id);};
  const odds=entries=>s.saveOdds(g,{space_id:room,version:s.oddsConfig(room).version,entries});
  const hit=(p,mode='coins',key=randomUUID())=>op(a,'/api/draw',{mode},(u,b)=>s.draw(u,b,()=>{let n=0;for(const x of s.pool(room)){if(x.id===p.id)return n;n+=x.weight;}throw Error('missing prize');}),key);
  const use=(card,body={},random=()=>0,key=randomUUID())=>op(a,'/api/cards/use',{card_id:card.id,...body},(u,b)=>s.lottery.use(u,b,random),key);
  return {s,a,g,other,room,prize,odds,hit,op,use};
}

test('商城与抽奖分别编辑库存，抽奖专属不能绕过 API 购买',t=>{
  const {s,a,g,other,room,prize,odds,hit}=setup(t),shop=prize();
  assert.equal(s.pool(room).length,1);
  const copied=s.lottery.copy(g,{space_id:room,prize_id:shop.id,stock:2});
  let lucky=s.get('SELECT * FROM prizes WHERE id=?',copied.id);
  assert.equal(lucky.channel,'lottery');assert.equal(lucky.weight,0);
  odds([{id:lucky.id,bps:10000}]);
  s.savePrize(g,{...shop,space_id:room,cost:99,stock:3,title:'新商城价'});
  assert.equal(s.get('SELECT cost FROM prizes WHERE id=?',lucky.id).cost,25*COIN);
  const before=s.balance(room);assert.throws(()=>s.buy(a,{prize_id:lucky.id}),/不能从商城/);assert.equal(s.balance(room),before);
  assert.throws(()=>s.lottery.copy(a,{space_id:room,prize_id:shop.id,stock:1}),/发奖人/);
  assert.throws(()=>s.lottery.copy(other,{space_id:room,prize_id:shop.id,stock:1}),/发奖人/);
  hit(lucky);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',shop.id).stock,3);assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',lucky.id).stock,1);
  assert.deepEqual(s.state(a,room).prizes.map(p=>p.id),[shop.id]);
});

test('默认七种奖品，大额低概率，切换默认不重置商城或已发卡',t=>{
  const {s,a,g,room,prize,op}=setup(t),shop=prize(),card=s.issue(a,shop,'test');
  const body={version:s.oddsConfig(room).version},key=randomUUID(),fn=(u,b)=>s.lottery.defaults(u,b);
  op(g,'/api/admin/lottery/defaults',body,fn,key);op(g,'/api/admin/lottery/defaults',body,fn,key);
  const pool=s.pool(room);assert.equal(pool.length,8);assert.equal(pool[0].probability,.159);
  assert.equal(pool.find(p=>p.face_cents===50000).probability,.001);
  assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',shop.id).stock,9);
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'ready');
  assert.equal(s.all("SELECT * FROM prizes WHERE channel='lottery' AND removed=0").length,7);
  const report=s.lottery.report(room);assert.equal(report.maximum_cents,50000);assert.equal(report.blocked,'');
  assert.ok(Math.abs(report.chain_cents-(.08*500+.02*500+.001*50000)/.8)<1e-9);
  const jackpot=pool.find(p=>p.face_cents===50000);
  const received=op(a,'/api/draw',{mode:'coins'},(u,b)=>s.draw(u,b,()=>{let n=0;for(const p of s.pool(room)){if(p.id===jackpot.id)return n;n+=p.weight;}}));
  assert.equal(received.card.face_cents,50000); // No hidden 100-yuan cap.
});

test('续杯只存入一次机会，免费抽也不自动递归，重试不增发',t=>{
  const {s,a,room,prize,odds,hit}=setup(t),p=prize({channel:'lottery',effect:'extra_draw',category:'custom',face_cents:0});
  odds([{id:p.id,bps:2000}]);const before=s.balance(room),key=randomUUID();hit(p,'coins',key);hit(p,'coins',key);
  assert.equal(s.ticketBalance(room),1);assert.equal(s.balance(room),before-20*COIN);assert.equal(s.get('SELECT COUNT(*) n FROM draws').n,1);
  hit(p,'ticket');assert.equal(s.ticketBalance(room),1);assert.equal(s.balance(room),before-20*COIN);
  assert.equal(s.get('SELECT COUNT(*) n FROM draws').n,2);assert.ok(s.all('SELECT * FROM cards').every(c=>c.status==='used'));
  assert.throws(()=>odds([{id:p.id,bps:2501}]),/25%/);
});

test('偷偷卡覆盖全商城报销卡，价格倒数给概率，大奖不被暗中排除',t=>{
  const {s,a,room,prize,odds,hit,use}=setup(t),cheap=prize({cost:25}),expensive=prize({title:'大大奖',cost:10000,face_cents:50000});
  prize({effect:'room_rename',category:'custom',face_cents:0});prize({active:false});prize({stock:0});
  const p=prize({channel:'lottery',effect:'shop_drop',category:'custom',face_cents:0});odds([{id:p.id,bps:10000}]);
  const card=hit(p).card,preview=s.lottery.inspectDrop(a,{space_id:room,card_id:card.id});
  assert.equal(preview.pool.length,2);const pc=preview.pool.find(x=>x.id===cheap.id),pe=preview.pool.find(x=>x.id===expensive.id);
  assert.ok(Math.abs(pc.probability/pe.probability-400)<1e-8);
  const start=preview.pool.slice(0,preview.pool.findIndex(p=>p.id===expensive.id)).reduce((n,p)=>n+p.probability,0);
  const key=randomUUID(),body={version:preview.version},balance=s.balance(room),r=use(card,body,()=>Math.floor((start+pe.probability/2)*(2**48-1)),key);
  assert.equal(r.card.face_cents,50000);assert.equal(s.balance(room),balance);assert.equal(r.card.lottery_funded,1);
  assert.equal(use(card,body,()=>0,key).card.id,r.card.id);assert.throws(()=>use(card,body),/用过/);
  assert.equal(s.get('SELECT stock FROM prizes WHERE id=?',expensive.id).stock,9);
  assert.equal(s.lottery.report(room).issued_cents,50000);
});

test('掉落确认遇到价格库存变化或空商城时不消耗卡，不接受跨小屋请求',t=>{
  const {s,a,g,other,room,prize,odds,hit,use}=setup(t),shop=prize(),p=prize({channel:'lottery',effect:'shop_drop',category:'custom',face_cents:0});
  odds([{id:p.id,bps:10000}]);const card=hit(p).card,preview=s.lottery.inspectDrop(a,{space_id:room,card_id:card.id});
  s.savePrize(g,{...shop,space_id:room,cost:80});assert.throws(()=>use(card,{version:preview.version}),/重新查看/);
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'ready');
  assert.throws(()=>s.lottery.inspectDrop(other,{space_id:room,card_id:card.id}),/小屋/);
  s.run('UPDATE prizes SET stock=0 WHERE id=?',shop.id);assert.throws(()=>use(card,{version:'x'}),/先留好/);
  const before=s.balance(room);assert.throws(()=>hit(p),/商城报销卡/);assert.equal(s.balance(room),before);
});

test('一天配色按本人小屋保存，24 小时到期，卡和偏好原子写入',t=>{
  t.mock.timers.enable({apis:['Date'],now:new Date('2026-10-27T04:00:00Z')});
  const {s,a,room,prize,odds,hit,use}=setup(t),p=prize({channel:'lottery',effect:'day_theme',category:'custom',face_cents:0});
  odds([{id:p.id,bps:10000}]);const card=hit(p).card;assert.throws(()=>use(card,{theme:'<script>'}),/配色/);
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'ready');use(card,{theme:'berry'});
  assert.equal(s.state(a,room).theme.theme,'berry');assert.equal(s.lottery.theme(s.personalSpaceId(a.id)),null);
  t.mock.timers.tick(86400_000);assert.equal(s.lottery.theme(room),null);
});

test('抽奖来源经过转换合成仍记录增额，商城来源不冒充抽奖成本',t=>{
  const {s,a,room,prize,odds,hit,op}=setup(t),p=prize({channel:'lottery',category:'universal',face_cents:200});
  odds([{id:p.id,bps:10000}]);const first=hit(p).card,second=hit(p).card;
  const merge=op(a,'/api/cards/merge',{card_ids:[first.id,second.id]},(u,b)=>s.moveCards(u,b,'merge'));
  assert.equal(merge.card.face_cents,500);assert.equal(s.lottery.report(room).issued_cents,500);
  assert.equal(s.lottery.report(room).merge_cents,100);
  const converted=op(a,'/api/cards/convert',{card_ids:[merge.card.id],category:'study',face_cents:200},(u,b)=>s.moveCards(u,b,'convert'));
  assert.ok(converted.outputs.every(c=>c.lottery_funded===1));assert.equal(s.lottery.report(room).issued_cents,500);
});

test('反比概率归一且保持价格比例，不因库存多而加权',()=>{
  const rows=inversePrices([{id:1,cost:20,stock:1},{id:2,cost:40,stock:100}]);
  assert.equal(rows[0].probability,2/3);assert.equal(rows[1].probability,1/3);
});

test('真正安全随机数可以掉落奖品；日志失败会回滚库存、用卡和额度记录',t=>{
  const {s,a,room,prize,odds,hit}=setup(t);prize();const p=prize({channel:'lottery',effect:'shop_drop',category:'custom',face_cents:0});odds([{id:p.id,bps:10000}]);
  const card=hit(p).card,body={space_id:room,card_id:card.id,version:s.lottery.inspectDrop(a,{space_id:room,card_id:card.id}).version};
  s.db.exec("CREATE TRIGGER fail_lucky_audit BEFORE INSERT ON room_audit BEGIN SELECT RAISE(ABORT,'audit unavailable'); END");
  assert.throws(()=>s.operation(a,randomUUID(),'/api/cards/use',body,()=>s.lottery.use(a,body)),/audit unavailable/);
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'ready');assert.equal(s.lottery.report(room).issued_cents,0);
  s.db.exec('DROP TRIGGER fail_lucky_audit');const r=s.operation(a,randomUUID(),'/api/cards/use',body,()=>s.lottery.use(a,body));
  assert.equal(r.card.face_cents,500);assert.equal(s.lottery.report(room).issued_cents,500);
});

test('家庭共用抽奖和掉落库存，各自持卡与配色，其他小屋不可见',t=>{
  const {s,a,g,other,prize}=setup(t),family=s.community.createFamily(g,{name:'一家人'}).space_id;
  const invite=s.community.familyInvite(g,{space_id:family});
  const joined=s.acceptInvite(a,invite.code).space_id;
  const p=s.savePrize(g,{space_id:family,title:'一天配色',description:'体验',emoji:'🎨',category:'custom',face_cents:0,effect:'day_theme',channel:'lottery',cost:100,stock:1,weight:5,wait_days:0,active:true});
  s.saveOdds(g,{space_id:family,version:s.oddsConfig(family).version,entries:[{id:p.id,bps:10000}]});s.postTickets(joined,1,'test','test','x');s.postTickets(family,1,'test','test','y');
  const card=s.operation(a,randomUUID(),'/api/draw',{space_id:joined,mode:'ticket'},()=>s.draw(a,{space_id:joined,mode:'ticket'})).card;
  assert.equal(s.pool(family).length,1);assert.equal(s.ticketBalance(family),1);
  s.operation(a,randomUUID(),'/api/cards/use',{space_id:joined,card_id:card.id,theme:'cream'},()=>s.lottery.use(a,{space_id:joined,card_id:card.id,theme:'cream'}));
  assert.equal(s.lottery.theme(family),null);assert.equal(s.lottery.theme(joined).theme,'cream');
  assert.throws(()=>s.state(other,joined),/小屋/);assert.equal(s.state(g,family).cards.length,0);
});

test('v9 迁移不增库存、不改卡片或概率字段，抽奖需单独布置',t=>{
  const {s,a,prize}=setup(t),p=prize(),card=s.issue(a,p,'test');
  const before=s.all('SELECT id,cost,stock,weight FROM prizes');
  s.db.exec('ALTER TABLE prizes DROP COLUMN channel;ALTER TABLE cards DROP COLUMN lottery_funded;PRAGMA user_version=9');
  migrate(s.db);migrate(s.db);assert.equal(s.get('PRAGMA user_version').user_version,16);
  assert.deepEqual(s.all('SELECT id,cost,stock,weight FROM prizes'),before);
  assert.equal(s.get('SELECT status FROM cards WHERE id=?',card.id).status,'ready');
  assert.equal(s.pool(a.space_id).length,1);assert.deepEqual(s.all('PRAGMA foreign_key_check'),[]);
});

test('真实 HTTP 分池操作需要发奖权限，功能卡并发重放只用一次，日志记录行为',async t=>{
  const {server,store:s}=await createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  t.after(()=>new Promise(r=>server.close(()=>{s.db.close();r();})));
  const a=s.newUser({username:'learner',name:'小芽',password:''}),g=s.newUser({username:'giver',name:'晴天',password:''}),room=s.pair(a.id,g.id).space_id;
  const as=s.session(a.id),gs=s.session(g.id),base='http://127.0.0.1:'+server.address().port;
  const call=(session,path,body,key=randomUUID())=>fetch(base+'/api/'+path,{method:'POST',headers:{Origin:base,'Content-Type':'application/json',Cookie:'starlight_session='+session.token,'X-CSRF-Token':session.csrf,'Idempotency-Key':key},body:JSON.stringify({space_id:room,...body})});
  assert.equal((await fetch(base+'/lottery.js')).status,200);
  assert.equal((await call(as,'admin/lottery/defaults',{version:s.oddsConfig(room).version})).status,403);
  assert.equal((await call(gs,'admin/lottery/defaults',{version:s.oddsConfig(room).version})).status,200);
  const p=s.get("SELECT * FROM prizes WHERE effect='day_theme'");a.space_id=room;const card=s.issue(a,p,'test'),key=randomUUID();
  const results=await Promise.all(Array.from({length:4},()=>call(as,'cards/use',{card_id:card.id,theme:'sky'},key)));
  assert.ok(results.every(r=>r.status===200));assert.equal(s.get("SELECT COUNT(*) n FROM room_audit WHERE action='/api/cards/use'").n,1);
});
