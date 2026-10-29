const HOUR=3600000,DAY=24*HOUR;
const categoryClass=category=>({'学习':'study','运动':'sport','生活':'life','工作':'work'}[category]||'study');
export const timelineDuration=ms=>{const minutes=Math.floor(Math.max(0,ms)/60000);return minutes>=60?`${Math.floor(minutes/60)} 小时${minutes%60?' '+minutes%60+' 分钟':''}`:minutes?minutes+' 分钟':ms>0?'不足 1 分钟':'0 分钟';};
export const timelineClock=(at,start)=>{const minutes=Math.max(0,Math.min(1440,Math.floor((at-start)/60000)));return String(Math.floor(minutes/60)).padStart(2,'0')+':'+String(minutes%60).padStart(2,'0');};
export function timelineBands(data){
  return Array.from({length:4},(_,i)=>{const start=data.dayStart+i*6*HOUR,end=start+6*HOUR;return {hour:i*6,segments:data.sessions.filter(s=>s.started_ms<end&&s.ended_ms>=start&&(s.ended_ms>start||s.running)).map(s=>({...s,left:(Math.max(start,s.started_ms)-start)/(6*HOUR)*100,width:Math.max(0,(Math.min(end,s.ended_ms)-Math.max(start,s.started_ms))/(6*HOUR)*100)}))};});
}

export function timelineUI({getState,api,render,esc,openDialog}){
  let scope='',day='',serverDay='',data=null,error='',sequence=0,lastFetch=0,loading=false,active=false;
  const today=()=>serverDay||getState().day;
  const currentScope=()=>{const s=getState();return s?s.user.id+':'+s.space.id:'';};
  async function load(page){
    active=page==='timeline';
    const key=currentScope();
    if(key!==scope){scope=key;day=getState()?.day||'';serverDay=day;data=null;error='';sequence++;}
    if(!active){sequence++;loading=false;return;}
    const request=++sequence,requestedDay=day;loading=true;lastFetch=Date.now();
    try{const result=await api('tasks/timeline?space_id='+encodeURIComponent(getState().space.id)+'&day='+encodeURIComponent(day));if(request===sequence&&scope===currentScope()&&requestedDay===day){data=result;serverDay=new Date(result.serverNow+8*HOUR).toISOString().slice(0,10);error='';}}
    catch(e){if(request===sequence){data=null;error=e.message;}}
    finally{if(request===sequence)loading=false;}
  }
  const range=s=>timelineClock(s.started_ms,data.dayStart)+'–'+timelineClock(s.ended_ms,data.dayStart);
  function body(){
    if(error)return `<div class="timeline-empty" role="status"><p>${esc(error)}</p><button class="btn secondary sm" data-action="timeline-reload">重新加载</button></div>`;
    if(!data)return '<p class="subtext" role="status">正在整理这一天…</p>';
    const running=data.sessions.find(s=>s.running),now=data.serverNow>=data.dayStart&&data.serverNow<data.dayEnd;
    return `<div class="timeline-summary"><div><span>已记录</span><strong>${timelineDuration(data.total_ms)}</strong></div><div><span>任务 / 时间段</span><strong>${data.task_count}<small> 项 / </small>${data.sessions.length}<small> 段</small></strong></div>${running?`<span class="timeline-live"><i></i> 正在进行 · ${esc(running.title)}</span>`:''}</div>
      <section class="timeline-map" aria-label="全天 24 小时计时分布"><div class="timeline-map-heading"><h2>一天的足迹</h2><span>北京时间 · 00:00–24:00</span></div>${timelineBands(data).map(b=>`<div class="timeline-band"><div class="timeline-hours" aria-hidden="true">${Array.from({length:7},(_,i)=>'<span>'+String(b.hour+i).padStart(2,'0')+':00</span>').join('')}</div><div class="timeline-track">${b.segments.map(s=>`<button class="timeline-segment ${categoryClass(s.category)} ${s.running?'is-running':''}" data-left="${s.left}" data-width="${s.width}" data-action="timeline-session" data-id="${esc(s.id)}" aria-label="${esc(s.title)}，${range(s)}，${timelineDuration(s.duration_ms)}${s.running?'，计时中':''}" title="${esc(s.title)} · ${range(s)}"></button>`).join('')}${now&&data.serverNow>=data.dayStart+b.hour*HOUR&&data.serverNow<data.dayStart+(b.hour+6)*HOUR?`<i class="timeline-now" data-left="${(data.serverNow-data.dayStart-b.hour*HOUR)/(6*HOUR)*100}" aria-label="现在"></i>`:''}</div></div>`).join('')}<div class="timeline-legend">${['学习','运动','生活','工作'].map(c=>`<span><i class="${categoryClass(c)}"></i>${c}</span>`).join('')}<span class="timeline-blank">空白是未计时</span></div></section>
      <section class="timeline-details"><div class="timeline-map-heading"><h2>时间段明细</h2><span>暂停后再开始，会另记一段</span></div>${data.sessions.length?`<ol class="timeline-list">${data.sessions.map(s=>`<li><button data-action="timeline-session" data-id="${esc(s.id)}" class="timeline-row"><span class="timeline-range">${range(s)}${s.running?'<small>计时中</small>':''}</span><i class="timeline-dot ${categoryClass(s.category)}"></i><span class="timeline-task"><strong>${esc(s.title)}</strong><small>${esc(s.category)}${s.continuedBefore?' · 从前一天继续':''}${s.continuedAfter?' · 延续至下一天':''}</small></span><span class="timeline-duration">${timelineDuration(s.duration_ms)}</span></button></li>`).join('')}</ol>`:`<div class="timeline-empty"><strong>这一天，还没有计时足迹</strong><p>${getState().space.isSelf?'在任务下点「开始计时」，每一段专注都会留在这里。':'伙伴开始给任务计时后，就能在这里看到。'}</p><button class="btn secondary sm" data-page="today">去看任务</button></div>`}</section>`;
  }
  function page(){
    const s=getState(),currentDay=today();
    return `<section class="panel timeline-panel"><div class="timeline-heading"><div><h1>${s.space.isSelf?'我的时间轴':esc(s.space.name)+'的时间轴'}</h1><p>把一天里的专注，慢慢串起来。</p></div><div class="timeline-date-controls"><button class="btn secondary sm" data-action="timeline-day" data-step="-1" aria-label="前一天" ${day<='2000-01-01'?'disabled':''}>‹</button><label><span class="sr-only">查看日期</span><input id="timeline-date" type="date" min="2000-01-01" max="${currentDay}" value="${esc(day)}" /></label><button class="btn secondary sm" data-action="timeline-day" data-step="1" aria-label="后一天" ${day>=currentDay?'disabled':''}>›</button><button class="text-btn" data-action="timeline-today">今天</button></div></div><div data-timeline-content>${body()}</div><details class="timeline-help"><summary>这些时间怎样记录？</summary><p>点击开始后记录，暂停或完成任务时结束；刷新、锁屏后仍会继续，单次最长 4 小时。这里只展示本小屋主动开启的计时，空白不代表没有学习，时长也不影响得分。你和本屋发奖人可查看；家庭中沿用成员之间的计划可见范围。</p></details></section>`;
  }
  async function choose(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>today())return;day=value;data=null;error='';await load('timeline');if(active)render();}
  async function click(action,el){
    if(!action.startsWith('timeline-'))return false;
    if(action==='timeline-day')await choose(new Date(Date.parse(day+'T12:00:00Z')+Number(el.dataset.step)*DAY).toISOString().slice(0,10));
    if(action==='timeline-today')await choose(today());
    if(action==='timeline-reload'){await load('timeline');if(active)render();}
    if(action==='timeline-session'){const s=data?.sessions.find(s=>s.id===el.dataset.id);if(s)openDialog('这一段专注',`<h3>${esc(s.title)}</h3><p>${esc(data.day)} · ${range(s)}${s.running?' · 正在计时':''}</p><p>${esc(s.category)} · 已记录 ${timelineDuration(s.duration_ms)}</p>${s.continuedBefore||s.continuedAfter?'<p class="subtext">跨午夜的记录按日期拆开展示，这里只统计当天的部分。</p>':''}<button class="btn secondary full-width" data-action="close">看完啦</button>`);}
    return true;
  }
  function paint(){for(const el of document.querySelectorAll('.timeline-panel [data-left]')){el.style.left=el.dataset.left+'%';if(el.dataset.width!==undefined)el.style.width=el.dataset.width+'%';}}
  async function tick(pageName){
    if(pageName!=='timeline'||!getState()||document.hidden){active=false;return;}
    active=true;if(loading||Date.now()-lastFetch<30000)return;
    const wasToday=day===today(),requestedDay=day,key=scope,pending=load(pageName),request=sequence;await pending;
    if(!active||day!==requestedDay||key!==scope||request!==sequence)return;
    if(active&&wasToday&&day<today()){await choose(today());return;}
    const target=document.querySelector('[data-timeline-content]');
    if(active&&scope===currentScope()&&target){target.innerHTML=body();paint();const input=document.querySelector('#timeline-date');if(input)input.max=today();const next=document.querySelector('[data-action="timeline-day"][data-step="1"]');if(next)next.disabled=day>=today();}
  }
  return {load,page,click,change:el=>choose(el.value),tick,paint};
}
