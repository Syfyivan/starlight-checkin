import {LOCAL_MESSAGES,ShuffleBag} from './celebration-content.js';
import {EFFECTS,playCelebration} from './celebration-art.js';
import {fetchJSON} from './compat.js';
export {EFFECTS};
const PREF_KEY='starlight.celebration.preferences.v1',SEEN_KEY='starlight.celebration.online-seen.v1';
let messageBag,effectBag,layer,card,disposeMotion,motionQuery,motionListener,timers=[],lastTaskId,lastTaskAt=0,turn=0;
let onlineQuote=null,loading=null,lastFetch=0,recent=null;
export function celebrationPreferences(){try{const s=JSON.parse(localStorage.getItem(PREF_KEY)||'null');return {motion:s?.motion!==false,online:s?.online!==false};}catch{return {motion:true,online:true};}}
export function saveCelebrationPreferences(value){const p={motion:!!value.motion,online:!!value.online};try{localStorage.setItem(PREF_KEY,JSON.stringify(p));}catch{}if(!p.online)onlineQuote=null;if(!p.motion)stopMotion();return p;}
function seen(){if(recent)return recent;try{const saved=JSON.parse(localStorage.getItem(SEEN_KEY)||'[]');recent=Array.isArray(saved)?saved.filter(t=>typeof t==='string'&&t.length<=60).slice(-40):[];}catch{recent=[];}return recent;}
export function warmMessages(){
  if(!celebrationPreferences().online||typeof location==='undefined'||loading||Date.now()-lastFetch<30000)return loading;
  lastFetch=Date.now();
  loading=fetchJSON(new URL('api/celebration/quote',location.href.split(/[?#]/)[0]),{credentials:'same-origin'},3500).then(({response:r,data})=>{
    if(!r.ok)return;const {quote:q}=data;
    if(celebrationPreferences().online&&q&&typeof q.text==='string'&&q.text.length<=30&&typeof q.attribution==='string'&&q.attribution.length<=100&&/^https:\/\/hitokoto\.cn\/\?uuid=[\da-f-]{36}$/i.test(q.url)&&!seen().includes(q.text)&&!LOCAL_MESSAGES.some(m=>m[0]===q.text))onlineQuote=q;
  }).catch(()=>{}).finally(()=>{loading=null;});return loading;
}
function nextMessage(){
  turn++;if(celebrationPreferences().online&&onlineQuote&&turn%3===0){const q=onlineQuote;onlineQuote=null;seen().push(q.text);recent=recent.slice(-40);try{localStorage.setItem(SEEN_KEY,JSON.stringify(recent));}catch{}return {...q,online:true};}
  if(!messageBag)messageBag=new ShuffleBag(LOCAL_MESSAGES.length,'starlight.task-celebration-bag.v2');const [text,attribution]=LOCAL_MESSAGES[messageBag.next()];return {text,attribution};
}
function later(fn,ms){timers.push(setTimeout(fn,ms));}
function stopMotion(){disposeMotion?.();disposeMotion=null;layer?.remove();layer=null;}
export function cleanup(){timers.forEach(clearTimeout);timers=[];stopMotion();card?.remove();card=null;if(motionListener)motionQuery?.removeEventListener?.('change',motionListener);motionListener=null;}
export function celebrateTask({taskId,title='',coins=0,effect,preview=false}={}){
  if(typeof document==='undefined'||!document.body||document.hidden)return;
  const now=Date.now();if(!preview&&taskId!=null&&taskId===lastTaskId&&now-lastTaskAt<800)return;
  lastTaskId=taskId;lastTaskAt=now;cleanup();
  if(!effectBag)effectBag=new ShuffleBag(EFFECTS.length,'starlight.task-celebration-effects.v1');
  const design=EFFECTS.find(e=>e.id===effect)||EFFECTS[effectBag.next()];
  const message=preview?{text:'认真完成的一小步，值得好好庆祝。',attribution:design.name+' · 效果预览，不影响积分'}:nextMessage();
  card=document.createElement('div');card.className='task-celebration-note tone-'+design.color;card.setAttribute('role','status');card.setAttribute('aria-live','polite');card.setAttribute('aria-atomic','true');
  const badge=document.createElement('small');badge.className='task-celebration-kicker';badge.textContent=design.icon+'  '+(preview?'给你的小庆祝':'又收好一份小成就');
  const heading=document.createElement('strong');heading.textContent=message.text;
  const detail=document.createElement('span'),amount=Number(coins),shortTitle=Array.from(String(title)).slice(0,30).join('');
  detail.textContent=message.attribution?'——'+message.attribution:(shortTitle?'完成「'+shortTitle+'」':'又完成一个小计划')+(Number.isFinite(amount)&&amount>0?' · +'+new Intl.NumberFormat('zh-CN',{maximumFractionDigits:2}).format(amount)+' 学习币':'');
  card.append(badge,heading,detail);
  if(preview){const again=document.createElement('button');again.type='button';again.textContent='再看一种';again.className='celebration-source';again.setAttribute('data-action','celebration-settings');card.append(again);}
  if(message.online){const source=document.createElement('a');source.href=message.url;source.target='_blank';source.rel='noopener noreferrer';source.textContent='诗句来自一言 ↗';source.className='celebration-source';card.append(source);}
  document.body.append(card);
  motionQuery=typeof matchMedia==='function'?matchMedia('(prefers-reduced-motion: reduce)'):null;
  if(celebrationPreferences().motion&&!motionQuery?.matches){try{layer=document.createElement('div');layer.className='task-celebration-layer';layer.setAttribute('aria-hidden','true');document.body.append(layer);disposeMotion=playCelebration(layer,design.id);}catch{stopMotion();}}
  motionListener=e=>{if(e.matches)stopMotion();};motionQuery?.addEventListener?.('change',motionListener);
  later(stopMotion,3100);later(cleanup,message.online?4800:3600);if(!preview)warmMessages();
}
if(typeof document!=='undefined')document.addEventListener('visibilitychange',()=>{if(document.hidden)cleanup();});
