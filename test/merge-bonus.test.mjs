import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Store} from '../lib/store.mjs';

function setup(t){
  const s=new Store(':memory:');t.after(()=>s.db.close());
  const learner=s.newUser({username:'learner',name:'小芽',password:''}),giver=s.newUser({username:'giver',name:'伙伴',password:''}),room=s.pair(learner.id,giver.id).space_id;
  const {id}=s.savePrize(giver,{space_id:room,title:'零食小卡',description:'凭记录报销',emoji:'🍪',tone:'yellow',category:'food',face_cents:200,tier:'小小心愿',use_rate:true,stock:100,weight:1,wait_days:0,active:true});
  const card=(cents,category='food')=>{const c=s.issue(learner,s.get('SELECT * FROM prizes WHERE id=?',id),'test');s.run('UPDATE cards SET face_cents=?,category=? WHERE id=?',cents,category,c.id);return c.id;};
  const move=(kind,body,key=randomUUID())=>{body={space_id:room,...body};return s.operation(learner,key,'/api/cards/'+kind,body,()=>s.moveCards(learner,body,kind));};
  return {s,learner,giver,room,card,move};
}

test('等额按总和加成；不等额仅给最小卡加成，最后向上取整到元',t=>{
  const {s,learner,room,card,move}=setup(t);
  for(const [inputs,expected] of [[[200,200],500],[[200,300],600],[[101,100],300],[[400,400],1000],[[100,100,100],400]]){
    const ids=inputs.map(cents=>card(cents)),total=inputs.reduce((a,b)=>a+b,0),r=move('merge',{card_ids:ids});
    assert.equal(r.card.face_cents,expected);
    assert.deepEqual(r.move,{input_cents:total,output_cents:expected,bonus_cents:expected-total});
    const log=s.state(learner,room).cardMoves.find(m=>JSON.parse(m.outputs).includes(r.card.id));
    assert.equal(log.face_cents,total);assert.equal(log.output_cents,expected);
  }
});

test('合成请求重放不增发，已合成卡不能复用，新卡可按当前面额继续合成',t=>{
  const {s,room,card,move}=setup(t),ids=[card(200),card(200)],key=randomUUID(),first=move('merge',{card_ids:ids},key);
  assert.equal(move('merge',{card_ids:ids},key).card.id,first.card.id);
  assert.equal(s.all('SELECT * FROM card_moves').length,1);
  assert.equal(s.all('SELECT * FROM room_audit WHERE action=?','/api/cards/merge').length,1);
  assert.throws(()=>move('merge',{card_ids:ids}),/只能使用/);
  const second=move('merge',{card_ids:[first.card.id,card(100)]});
  assert.equal(second.card.face_cents,700);
  assert.equal(s.balance(room),0);
  assert.equal(s.get('SELECT stock FROM prizes').stock,97);
  const log=JSON.parse(s.get("SELECT detail FROM room_audit WHERE action='/api/cards/merge' ORDER BY seq DESC LIMIT 1").detail);
  assert.deepEqual(log.cardMove,{input_cents:600,output_cents:700,bonus_cents:100});
});

test('合成后的万能卡转换仍按 1:1 找零，不重复加成',t=>{
  const {card,move}=setup(t),merged=move('merge',{card_ids:[card(200,'universal'),card(300,'universal')]});
  assert.equal(merged.card.face_cents,600);
  const converted=move('convert',{card_ids:[merged.card.id],category:'study',face_cents:251});
  assert.equal(converted.card.face_cents,251);assert.equal(converted.outputs[1].face_cents,349);
  assert.deepEqual(converted.move,{input_cents:600,output_cents:600,bonus_cents:0});
});

test('加成后超过额度上限时整笔拒绝，卡片、余额和日志不变',t=>{
  const {s,room,card,move}=setup(t),ids=[card(48_000_000),card(48_000_001)],logCount=s.all('SELECT * FROM room_audit').length;
  assert.throws(()=>move('merge',{card_ids:ids}),/合成后额度/);
  assert.equal(s.all("SELECT id FROM cards WHERE status='ready'").length,2);
  assert.equal(s.all('SELECT * FROM card_moves').length,0);
  assert.equal(s.all('SELECT * FROM room_audit').length,logCount);
  assert.equal(s.balance(room),0);
});

test('旧的等额合成记录依照已发卡额度显示，不补发历史加成',t=>{
  const {s,learner,room,card,move}=setup(t),merged=move('merge',{card_ids:[card(200),card(200)]});
  // Reproduce a pre-bonus issued card and its existing movement record.
  s.run('UPDATE cards SET face_cents=400 WHERE id=?',merged.card.id);
  const row=s.state(learner,room).cardMoves[0];
  assert.equal(row.face_cents,400);assert.equal(row.output_cents,400);
  assert.equal(s.get('SELECT face_cents FROM cards WHERE id=?',merged.card.id).face_cents,400);
});
