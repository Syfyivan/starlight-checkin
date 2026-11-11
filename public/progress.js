import {passport,postcardContents} from './travel-journal.js';
import {packingHint,TRAVEL_NOTES} from './travel-notes.js';
import {postcardScene} from './travel-art.js';
import {travelPanel,packingForm,travelScene} from './travel-view.js';
import {artwork} from './illustrations.js';
import {PET_ITEMS} from './pet-catalog.js';
import {petMoment} from './pet-care.js';
import {petPortrait} from './pets.js';
import {scheduledOn,LONG_POINTS_MAX} from './task-types.js';
const studyStamps = [
  {days:1, place:'lijiang', name:'丽江古城'},
  {days:3, place:'fujian-tulou', name:'福建土楼'},
  {days:7, place:'great-wall', name:'长城'},
  {days:14, place:'los-glaciares', name:'阿根廷冰川'}
];
const weekdays = ['一','二','三','四','五','六','日'];
export function studyWeek(history, today) {
  const dates = new Set(history.filter(row=>row.count>0 && row.day<=today).map(row=>row.day));
  const monday = new Date(today+'T00:00:00Z');
  monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay()+6)%7);
  const week = weekdays.map((label,index)=>{
    const day = new Date(monday.getTime()+index*86400000).toISOString().slice(0,10);
    return {label,day,done:dates.has(day)};
  });
  return {week, unlocked:studyStamps.filter(stamp=>stamp.days<=dates.size)};
}
export function newestStudyStamp(before,after,today) {
  const previous=studyWeek(before,today).unlocked.length;
  return studyWeek(after,today).unlocked[previous]?.name;
}
export const elapsedLabel=ms=>{const seconds=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;};
export function progressUI({getState,canAct,getPerspective,esc,field,actions,openDialog,mutation,api}){
  let receivedAt=Date.now(),openedPostcard=null;
  const state=()=>getState(),task=id=>[...state().tasks,...state().futureTasks].find(t=>t.id===id);
  function sync(){receivedAt=Date.now();}
  function taskTools(t){const time=t.timing||{},running=time.running_since!=null;return `<div class="task-time-tools">${canAct()&&!t.done&&scheduledOn(t,state().day)?`<button class="text-btn timer-toggle ${running?'running':''}" data-action="task-timer" data-id="${t.id}" data-mode="${running?'pause':'start'}">${running?'Ⅱ 暂停':'▷ 开始计时'}</button>`:''}${time.elapsed_ms||running?`<span class="task-clock ${running?'running':''}" data-task-clock="${t.id}">${elapsedLabel(time.elapsed_ms||0)}</span>`:''}${state().space.canManage&&getPerspective()!=='preview'?`<button class="text-btn" data-action="giver-task-score" data-id="${t.id}">调整分数</button>`:''}${t.score_override!=null?'<span class="fixed-score">发奖人定分</span>':''}</div>`;}
  function tick(){if(!state())return;for(const el of document.querySelectorAll('[data-task-clock]')){const t=task(el.dataset.taskClock),timing=t?.timing;if(!timing)continue;const extra=timing.running_since==null?0:Math.max(0,Math.min(Date.now()-receivedAt,timing.running_since+4*3600000-state().serverNow));el.textContent=elapsedLabel(timing.elapsed_ms+extra);}const t=state().travel?.trip,clock=document.querySelector('[data-travel-countdown]');if(t&&clock){const at=state().serverNow+Date.now()-receivedAt,ms=Math.max(0,t.returnAt-at),minutes=Math.ceil(ms/60000);clock.textContent=ms?'约 '+Math.floor(minutes/60)+' 小时 '+minutes%60+' 分钟后回家':'已到归来时间，正在整理来信';const bar=document.querySelector('[data-travel-progress]');if(bar)bar.value=Math.min(1,Math.max(0,(at-t.departure)/(t.returnAt-t.departure)));}}
  setInterval(tick,1000);
  function rulesPanel(){const r=state().growthRules;return `<section class="panel mt"><h2>经验来信奖励</h2><p class="subtext">每跨过一个经验门槛，信箱收到一份小礼物；同一门槛只发一次。已有经验不追溯补发，改规则也不重复发奖。</p><form id="growth-rules-form" data-version="${r.version}"><label class="check-label mt"><input name="enabled" type="checkbox" ${r.enabled?'checked':''}> 开启经验奖励</label><div class="form-row mt">${field('每多少经验寄一次','step','number',r.step,'required min="50" max="100000"')}${field('免费机会概率 %','ticket','number',r.ticket,'required min="0" max="100"')}</div><div class="form-row">${field('2 元自选卡概率 %','card2','number',r.card2,'required min="0" max="100"')}${field('5 元自选卡概率 %','card5','number',r.card5,'required min="0" max="100"')}</div><p class="field-help">三项合计 100%。每次预期报销额度 ¥${((r.card2*2+r.card5*5)/100).toFixed(2)}，不含免费机会的后续抽奖成本和合成加成；修改只影响之后跨越的新门槛。</p><div class="error-text" role="alert"></div><button class="btn" type="submit">保存成长奖励</button></form></section>`;}
  function panel(){return travelPanel(state(),canAct,esc);}
  function album(){
    const {week,unlocked}=studyWeek(state().history,state().day);
    const days=week.filter(d=>d.done).length;
    const marks=week.map(d=>`<li class="${d.done?'marked':''}" aria-label="${d.day}，${d.done?'已打卡':'未打卡'}"><span>周${d.label}</span><b aria-hidden="true">${d.done?'✓':'·'}</b></li>`);
    const stamps=studyStamps.map((stamp,index)=>{
      const locked=index>=unlocked.length;
      return `<button class="study-stamp" data-action="study-stamp" data-id="${stamp.place}" ${locked?'disabled':''}>${postcardScene(stamp.place,{locked})}<strong>${locked?'待解锁':stamp.name}</strong><small>累计 ${stamp.days} 天</small></button>`;
    });
    return `<section class="panel study-album"><div class="study-heading"><h2>学习邮册</h2><span>${days>=3?'本周目标已达成':'本周已打卡 '+days+' / 3 天'}</span></div><p class="subtext">完成计划就为这一天盖章。累计学习天数，收集风景邮票。</p><ol class="study-week">${marks.join('')}</ol><div class="study-stamps">${stamps.join('')}</div></section>`;
  }
  async function click(action,el){
    if(action==='study-stamp'){
      const {unlocked}=studyWeek(state().history,state().day);
      const stamp=unlocked.find(item=>item.place===el.dataset.id);
      if(stamp)openDialog(stamp.name+' · 学习邮票',postcardScene(stamp.place)+'<p>'+esc(TRAVEL_NOTES[stamp.place].fact)+'</p>');
      return true;
    }
    if(action==='task-timer'){await mutation('tasks/timer',{task_id:el.dataset.id,action:el.dataset.mode},el.dataset.mode==='start'?'开始计时，专心做一件小事':'这一段努力记下啦');return true;}
    if(action==='giver-task-score'){
      const t=task(el.dataset.id);openDialog('给这个任务定个分',`<form id="giver-score-form" data-id="${t.id}" data-revision="${t.score_revision}"><h3>${esc(t.title)}</h3>${field('完成后获得的学习币','points','number',t.score_override==null?'':t.score_override/1000000,'min="1" max="'+(t.task_kind==='long'?LONG_POINTS_MAX:100)+'" placeholder="留空恢复小屋计分规则"')}<p class="field-help">定分后，领奖人不能自行改高。今天若已完成，会补发或扣回差额；以前的记录保持原样。留空可恢复自由分数或投入等级。</p>${actions('保存分数')}</form>`);return true;
    }
    if(action==='travel-passport'){openDialog('慢慢盖满的旅行护照',passport(state().travel,esc));return true;}
    if(action==='trip-letter'){await openPostcard(el.dataset.id);return true;}
    if(action==='trip-keepsake'&&canAct()&&openedPostcard){
      const h=openedPostcard,room=state().space.id,feedback=document.querySelector('#keepsake-feedback');
      const r=await api('pets/travel/keepsake',{space_id:room,trip_id:h.id,choice:Number(el.dataset.index)});
      if(!feedback?.isConnected||!document.querySelector('#dialog').open||room!==state().space.id)return true;
      if(r.found){
        h.keepsakeFound=true;
        const entry=state().travel.album.find(item=>item.id===h.placeId);if(entry)entry.keepsakeFound=true;
        openDialog('来自 '+esc(h.destination)+' 的明信片',postcardContents(h,state(),canAct(),esc,actions));
      }else feedback.textContent='这件不像信里说的，再猜一件吧。';
      return true;
    }
    if(action==='pack-quick'){
      const f=el.closest('form');
      for(const kind of ['food','gear']){
        if(f.querySelector('[data-kind="'+kind+'"]:checked'))continue;
        const card=state().travel.supplies.filter(c=>c.kind===kind).sort((a,b)=>a.xp-b.xp)[0];
        if(card)f.querySelector('input[value="'+card.id+'"]').checked=true;
      }
      packPreview();savePack();return true;
    }
    if(action==='trip-quiz'&&openedPostcard?.knowledge){const k=openedPostcard.knowledge,right=Number(el.dataset.index)===k.answer;document.querySelector('#travel-quiz-feedback').textContent=right?'记住啦！'+k.fact:'再看看这条小线索：'+k.fact;return true;}
    if(action==='trip-gift'&&canAct()){const r=await mutation('mail/claim',{mail_id:el.dataset.mail},'',undefined);await openPostcard(el.dataset.id);return true;}
    if(action==='trip-practice'&&canAct()&&openedPostcard?.id===el.dataset.id){const h=openedPostcard,k=h.knowledge,settings=state().settings,points=settings.taskScoreMode==='difficulty'?settings.difficultyPoints[settings.defaultDifficulty]:settings.defaultPoints;openDialog('把好奇心安排进生活',`<form id="travel-practice-form" data-id="${h.id}"><h3>${esc(k.practice)}</h3><p class="subtext">预计 ${k.minutes} 分钟 · 完成后预计 +${points} 学习币，以完成时的小屋规则和每日上限为准。</p>${field('从哪天开始','start_date','date',state().day,'required min="'+state().day+'"')}<p class="field-help">只添加待办，不会直接发币。会和普通计划一起参与当天的完成与扣分规则，每趟最多添加一次。</p>${actions('加入我的计划')}</form>`);return true;}
    if(action==='travel-pack'){
      const t=state().travel;openDialog('给小伙伴准备行囊',packingForm(t,esc,actions));restorePack();if(el.dataset.card){const input=[...document.querySelectorAll('#travel-pack-form [name="supplies"]')].find(i=>i.value===el.dataset.card);if(input){input.checked=true;replaceSupply(input);savePack();}}packPreview();return true;
    }return false;
  }
  async function openPostcard(id){const h=await api('pets/postcard?space_id='+encodeURIComponent(state().space.id)+'&trip_id='+encodeURIComponent(id));openedPostcard=h;openDialog('来自 '+esc(h.destination)+' 的明信片',postcardContents(h,state(),canAct(),esc,actions));}
  const packKey=()=> 'starlight.travel-pack.'+state().user.id+'.'+state().space.id;
  function restorePack(){try{const saved=JSON.parse(localStorage.getItem(packKey())||'null'),f=document.querySelector('#travel-pack-form');if(!saved)return;for(const input of f.querySelectorAll('[name="supplies"]'))input.checked=saved.cards?.includes(input.value);const radios=[...f.querySelectorAll('[name="route"]')];const route=radios.find(input=>input.value===saved.route&&(!saved.route.startsWith('wish:')||saved.week===f.dataset.week));(route||radios[0]).checked=true;}catch{}}
  function savePack(){const f=document.querySelector('#travel-pack-form');if(!f)return;try{localStorage.setItem(packKey(),JSON.stringify({cards:[...f.querySelectorAll('[name="supplies"]:checked')].map(e=>e.value),route:f.elements.route.value,week:f.dataset.week}));}catch{}}
  function packPreview(){const f=document.querySelector('#travel-pack-form');if(!f)return;const selected=[...f.querySelectorAll('[name="supplies"]:checked')].map(e=>state().travel.supplies.find(c=>c.id===e.value)),valid=selected.length>0&&selected.length<=2&&new Set(selected.map(c=>c.kind)).size===selected.length;document.querySelector('#travel-xp-preview').textContent=valid?'归来获得 '+selected.reduce((n,c)=>n+c.xp,0)+' 经验':'选一份口粮或一件装备，最多各一件';for(const slot of f.querySelectorAll('[data-bag-slot]')){const c=selected.find(c=>c.kind===slot.dataset.bagSlot);slot.innerHTML=c?artwork(PET_ITEMS[c.effect]?.art)+'<strong>'+esc(c.title)+'</strong><small>+'+c.xp+' 经验</small>':'<span>＋</span><strong>'+ (slot.dataset.bagSlot==='food'?'口粮袋':'旅行用品')+'</strong><small>也可以只带另一种</small>';}document.querySelector('#travel-route-preview').textContent=f.elements.route.value.startsWith('wish:')?'小伙伴会去你选的地方。':packingHint(f.elements.route.value,selected.map(c=>c.effect));const submit=f.querySelector('[type="submit"]');if(submit)submit.disabled=!valid;}
  function replaceSupply(input){if(input.checked&&input.name==='supplies'){for(const peer of input.form.querySelectorAll('[data-kind="'+input.dataset.kind+'"]'))if(peer!==input)peer.checked=false;}}
  document.addEventListener('change',e=>{if(e.target.closest('#travel-pack-form')){replaceSupply(e.target);packPreview();savePack();}});
  async function submit(form,data,formData,key){
    if(form.id==='travel-memory-form'&&canAct()){await mutation('pets/travel/memory',{trip_id:form.dataset.id,memory:data.memory,expectedMemory:openedPostcard?.memory||''},'小发现记在明信片上啦',key);await openPostcard(form.dataset.id);return true;}
    if(form.id==='travel-practice-form'&&canAct()){const r=await mutation('pets/travel/practice',{trip_id:form.dataset.id,start_date:data.start_date},'小计划已安排好',key);await openPostcard(form.dataset.id);return true;}
    if(form.id==='giver-score-form'){await mutation('admin/task-score',{task_id:form.dataset.id,expectedRevision:Number(form.dataset.revision),points:data.points===''?null:Number(data.points)},'任务分数已调整，也给伙伴寄了说明',key);return true;}
    if(form.id==='growth-rules-form'){await mutation('admin/growth-rules',{version:form.dataset.version,enabled:formData.has('enabled'),step:Number(data.step),ticket:Number(data.ticket),card2:Number(data.card2),card5:Number(data.card5)},'成长奖励规则已保存',key);return true;}
    if(form.id==='travel-pack-form'){const before=state().pet;const r=await mutation('pets/travel',{card_ids:formData.getAll('supplies'),...(data.route?.startsWith('wish:')?{route:'auto',destination:data.route.slice(5),week:form.dataset.week}:{route:data.route||'auto'})},'',key);try{localStorage.removeItem(packKey());}catch{}openDialog('小伙伴出发啦',petMoment(before,before,{kind:'depart',portrait:petPortrait})+`<p>这一趟预计 ${r.trip.durationHours/24} 天，回来增加 ${r.trip.xp} 经验。</p><p>旅途见闻会寄到信箱，安心做好自己的小计划吧。</p><button class="btn" data-action="close">一路平安</button>`);return true;}return false;
  }
  return {taskTools,rulesPanel,panel,album,click,submit,sync};
}
