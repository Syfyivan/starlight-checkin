import test from 'node:test';
import assert from 'node:assert/strict';
import {timelineUI,timelineBands,timelineClock,timelineDuration} from '../public/timeline.js';
import {roomNavigation} from '../public/rooms.js';
const start=Date.parse('2026-10-29T00:00:00+08:00'),hour=3600000;
const payload=(day='2026-10-29',extra={})=>({day,dayStart:start,dayEnd:start+24*hour,serverNow:start+10*hour,sessions:[],total_ms:0,task_count:0,...extra});
const state={user:{id:'learner'},space:{id:'room-a',name:'小芽',isSelf:true,status:'active'},day:'2026-10-29'};
const esc=s=>String(s).replaceAll('<','&lt;').replaceAll('"','&quot;');
test('全天图在六小时分界处拆开同一时间段，时刻可表示24:00',()=>{
  const bands=timelineBands(payload(undefined,{sessions:[{id:'session',started_ms:start+5*hour,ended_ms:start+7*hour}]}));
  assert.equal(bands[0].segments.length,1);assert.equal(bands[1].segments.length,1);assert.equal(bands[2].segments.length,0);
  assert.equal(bands[0].segments[0].left,5/6*100);assert.equal(bands[1].segments[0].left,0);
  assert.ok(Math.abs(bands[0].segments[0].width-100/6)<1e-9);assert.equal(timelineClock(start+24*hour,start),'24:00');
  assert.equal(timelineDuration(90000),'1 分钟');assert.equal(timelineDuration(5000),'不足 1 分钟');
});
test('双方和历史小屋都有时间轴入口',()=>{
  for(const perspective of ['receive','manage','preview'])for(const status of ['active','closed'])assert.ok(roomNavigation({...state,space:{...state.space,status}},perspective).some(n=>n.page==='timeline'));
});
test('切换小屋后旧请求不能覆盖新小屋，离开页面后不渲染旧请求',async()=>{
  let current=structuredClone(state),resolveOld,first=true;
  const ui=timelineUI({getState:()=>current,esc,render:()=>{},openDialog:()=>{},api:async()=>first?(first=false,new Promise(r=>resolveOld=r)):payload(undefined,{sessions:[{id:'new',title:'新小屋的任务',category:'学习',started_ms:start+hour,ended_ms:start+2*hour,duration_ms:hour}],total_ms:hour,task_count:1})});
  const old=ui.load('timeline');current.space.id='room-b';await ui.load('timeline');resolveOld(payload(undefined,{task_count:99}));await old;
  assert.match(ui.page(),/新小屋的任务/);assert.doesNotMatch(ui.page(),/style="/);
});
test('任务名按文本展示且看历史日期时不透露其他日期的记录',async()=>{
  let captured='';const ui=timelineUI({getState:()=>state,esc,render:()=>{},openDialog:(title,body)=>captured=body,api:async url=>url.endsWith('2026-10-28')?payload('2026-10-28'):payload(undefined,{sessions:[{id:'s',title:'<img src=x>',category:'学习',started_ms:start,ended_ms:start+hour,duration_ms:hour}],total_ms:hour,task_count:1})});
  await ui.load('timeline');assert.ok(!ui.page().includes('<img src=x>'));await ui.click('timeline-session',{dataset:{id:'s'}});assert.match(captured,/&lt;img/);
  await ui.change({value:'2026-10-28'});assert.doesNotMatch(ui.page(),/&lt;img/);assert.match(ui.page(),/这一天，还没有计时足迹/);
});
test('跨午夜跟随今天，历史日期保留且日期上限以服务器为准',async()=>{
  const previousDocument=globalThis.document,realNow=Date.now;let clock=100000,serverTime=start+24*hour-1;
  globalThis.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};Date.now=()=>clock;
  try{
    const ui=timelineUI({getState:()=>state,esc,render:()=>{},openDialog:()=>{},api:async url=>payload(url.split('day=')[1],{serverNow:serverTime})});
    await ui.load('timeline');serverTime=start+24*hour+60000;clock+=31000;await ui.tick('timeline');
    assert.match(ui.page(),/value="2026-10-30"/);assert.match(ui.page(),/max="2026-10-30"/);
    await ui.change({value:'2026-10-28'});clock+=31000;serverTime+=24*hour;await ui.tick('timeline');
    assert.match(ui.page(),/value="2026-10-28"/);assert.match(ui.page(),/max="2026-10-31"/);
  }finally{Date.now=realNow;globalThis.document=previousDocument;}
});
test('后台刷新等待时切换历史日，不会被旧响应拉回今天',async()=>{
  const previousDocument=globalThis.document,realNow=Date.now;let clock=100000,calls=0,resolveTick,resolveDate;
  globalThis.document={hidden:false,querySelector:()=>null,querySelectorAll:()=>[]};Date.now=()=>clock;
  try{
    const ui=timelineUI({getState:()=>state,esc,render:()=>{},openDialog:()=>{},api:async()=>{calls++;if(calls===1)return payload();return new Promise(resolve=>{if(calls===2)resolveTick=resolve;else resolveDate=resolve;});}});
    await ui.load('timeline');clock+=31000;const pendingTick=ui.tick('timeline'),pendingDate=ui.change({value:'2026-10-28'});
    resolveTick(payload());await pendingTick;assert.equal(calls,3);
    resolveDate(payload('2026-10-28'));await pendingDate;assert.match(ui.page(),/value="2026-10-28"/);
  }finally{Date.now=realNow;globalThis.document=previousDocument;}
});
