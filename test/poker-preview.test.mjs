import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createApp} from '../server.mjs';
import {bestHand} from '../lib/poker-preview.mjs';

test('七选五识别全部牌型、A2345、踢脚牌和公牌平局',()=>{
 const examples=['As 9d 7c 5h 3s 2c Jd','As Ad 9c 7h 4s 3d 2c','As Ad 9c 9h 4s 3d 2c','As Ad Ac 9h 7s 4d 2c','As 2d 3h 4c 5s 9d Jc','As Js 9s 6s 2s 3h 5c','As Ad Ac 7h 7s 7d 2c','As Ad Ac Ah 7s 4d 2c','As Ks Qs Js Ts 4d 2c'];
 const hands=examples.map(s=>bestHand(s.split(' ')));
 assert.deepEqual(hands.map(h=>h.name),['高牌','一对','两对','三条','顺子','同花','葫芦','四条','同花顺']);
 for(let i=1;i<hands.length;i++)assert.ok(hands[i].score>hands[i-1].score);
 assert.ok(bestHand('2c 3h 4d 5s 6h Td Qs'.split(' ')).score>hands[4].score);
 assert.ok(bestHand('As Ad Kc Jh 8s 3d 2c'.split(' ')).score>bestHand('Ac Ah Qc Jh 8s 3d 2c'.split(' ')).score);
 assert.equal(bestHand('As Ks Qs Js Ts 4d 2c'.split(' ')).score,bestHand('As Ks Qs Js Ts 7h 8d'.split(' ')).score);
});

test('本机评审兑换进入原抽奖流水，盖牌、重复请求和过期牌局受保护',async t=>{
 const app=await createApp({dbPath:':memory:',demo:true,review:true});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.server.close(()=>{app.store.db.close();resolve();})));
 const base='http://127.0.0.1:'+app.server.address().port,s=app.store;
 assert.equal((await fetch(base+'/review')).status,200);
 const atlas=await fetch(base+'/api/review/atlas').then(r=>r.json());assert.equal(atlas.length,64);
 assert.equal(new Set(atlas.map(p=>p.source)).size,64);
 const user=s.get("SELECT * FROM users WHERE username='demo'");
 const room=s.get('SELECT id FROM spaces WHERE learner_id=? AND giver_id IS NOT NULL',user.id).id,session=s.session(user.id);
 const headers={Origin:base,Cookie:'starlight_session='+session.token,'Content-Type':'application/json','X-CSRF-Token':s.authenticate(session.token).csrf};
 const post=(body,key=randomUUID())=>fetch(base+'/api/review/poker',{method:'POST',headers:{...headers,'Idempotency-Key':key},body:JSON.stringify({space_id:room,...body})});
 const read=()=>fetch(base+'/api/review/poker?space_id='+room,{headers}).then(r=>r.json());
 assert.equal((await read()).chips,0);
 const move=async body=>{const r=await post(body);assert.equal(r.status,200);return (await r.json()).table;};
 let table=await move({move:'claim',version:0});assert.equal(table.chips,30);
 assert.equal((await post({move:'claim',version:table.version})).status,409);
 table=await move({move:'deal',bet:2,version:table.version});assert.equal(table.chips,28);assert.equal(table.hand.dealer,undefined);assert.equal(table.hand.board.length,3);
 assert.deepEqual(table,await read());
 const stale={move:'show',handId:table.hand.id,version:table.version};
 table=await move({...stale,move:'raise'});assert.equal(table.hand.stake,4);assert.equal(table.chips,30+table.hand.profit);
 assert.equal(new Set([...table.hand.player,...table.hand.dealer,...table.hand.board]).size,9);
 assert.equal((await post(stale)).status,409);
 const before=s.ticketBalance(room),key=randomUUID(),body={move:'exchange',version:table.version};
 const result=await (await post(body,key)).json();assert.ok(result.ok);
 assert.deepEqual(await (await post(body,key)).json(),result);assert.equal(s.ticketBalance(room),before+1);
 assert.equal((await post(body)).status,409);
 const draw=await fetch(base+'/api/draw',{method:'POST',headers:{...headers,'Idempotency-Key':randomUUID()},body:JSON.stringify({space_id:room,mode:'ticket'})});
 assert.equal(draw.status,200);assert.equal((await draw.json()).mode,'ticket');
 const foreign=s.get('SELECT id FROM spaces WHERE learner_id!=? LIMIT 1',user.id);
 assert.notEqual((await post({move:'claim',version:0,space_id:foreign.id})).status,200);
});

test('常规服务不会创建评审牌桌或提供总览',async t=>{
 const app=await createApp({dbPath:':memory:',demo:false,review:true});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));
 t.after(()=>new Promise(resolve=>app.server.close(()=>{app.store.db.close();resolve();})));
 const base='http://127.0.0.1:'+app.server.address().port;
 assert.equal((await fetch(base+'/review')).status,404);
 assert.ok(!app.store.get("SELECT name FROM sqlite_master WHERE name='preview_poker'"));
 const u=app.store.newUser({username:'reviewgate',name:'门禁',password:''}),session=app.store.session(u.id);
 const headers={Cookie:'starlight_session='+session.token,Origin:base,'Content-Type':'application/json','X-CSRF-Token':app.store.authenticate(session.token).csrf,'Idempotency-Key':randomUUID()};
 assert.equal((await fetch(base+'/api/review/atlas',{headers})).status,404);
 assert.equal((await fetch(base+'/api/review/poker',{method:'POST',headers,body:'{}'})).status,404);
});
