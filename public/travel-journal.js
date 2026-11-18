import {postcardScene,keepsakeIcon} from './travel-art.js';
import {petPortrait} from './pets.js';
import {KEEPSAKES,THEMED_ROUTES,TRAVEL_ROUTES} from './travel-notes.js';

const MOOD_LABELS={dawn:'🌅 晨曦微光',day:'☀️ 晴朗午后',dusk:'🌇 落日琥珀',night:'🌌 星垂夜幕'};

export function postcardPicture(h){
 return `<div class="postcard-stage">${postcardScene(h.placeId,{mood:h.mood||'day',cameo:h.cameo||''})}${h.pet?'<div class="postcard-companion">'+petPortrait({...h.pet,owned:true},{small:true,staticPose:true})+'</div>':''}</div>`;
}

export function passport(t,esc,filter='all'){
 const album=t.album||[];
 const routes=(t.themedRoutes||THEMED_ROUTES.map(r=>({...r,done:r.places.filter(id=>album.find(a=>a.id===id)?.visits).length,total:r.places.length})));
 const filtered=filter==='visited'?album.filter(a=>a.visits):filter==='keepsake'?album.filter(a=>a.keepsakeFound):album;
 return `<div class="themed-routes-box"><h3>主题探索集章 · ${routes.filter(r=>r.done===r.total).length} / ${routes.length} 枚印章</h3><div class="themed-routes-grid">${routes.map(r=>`<div class="route-stamp-card ${r.done===r.total?'completed':''}"><strong>${esc(r.name)}</strong><span>${esc(r.badge)}</span><small>${r.done} / ${r.total} 站${r.done===r.total?' · 已集齐 ✓':''}</small></div>`).join('')}</div></div>
 <h3>世界足迹与纪念物 · ${album.filter(a=>a.keepsakeFound).length} / ${album.length}</h3>
 <p class="subtext">点开去过的地方可读明信片、猜旅行口袋纪念物；收集到的纪念物可在宠物小屋「窗台陈列」摆上桌面。</p>
 <div class="reward-tools passport-filters"><button type="button" class="btn secondary sm" data-action="passport-filter" data-filter="all" ${filter==='all'?'disabled':''}>全部 ${album.length}</button><button type="button" class="btn secondary sm" data-action="passport-filter" data-filter="visited" ${filter==='visited'?'disabled':''}>已抵达 ${album.filter(a=>a.visits).length}</button><button type="button" class="btn secondary sm" data-action="passport-filter" data-filter="keepsake" ${filter==='keepsake'?'disabled':''}>已收纪念物 ${album.filter(a=>a.keepsakeFound).length}</button></div>
 <div class="travel-passport">${filtered.map(a=>`<${a.visits?'button':'div'} class="passport-place ${a.visits?'visited':'locked'}" ${a.visits?'data-action="trip-letter" data-id="'+a.tripId+'"':''}>${postcardScene(a.id,{locked:!a.visits})}<strong>${a.visits?esc(a.place):'等待一场偶遇'}</strong><small>${a.visits?esc(a.stamp)+' · 来过 '+a.visits+' 次':''}</small><small>${a.visits?(a.keepsakeFound?keepsakeIcon(a.id)+esc(KEEPSAKES[a.id].items[KEEPSAKES[a.id].answer]):'有一条纪念物线索'):'尚未抵达 · 神秘轮廓'}</small></${a.visits?'button':'div'}>`).join('')}</div>`;
}

export function journalIntro(t,esc){
 const h=t.history?.[0];
 return (t.roadLetter&&t.away?'<details class="road-letter" open><summary>途中来信 · 小伙伴惦记着你</summary><p>'+esc(t.roadLetter.text)+'</p><small>虚构的宠物旅行故事，也已放进信箱。</small></details>':!t.away&&h?'<div class="travel-return"><div><strong>欢迎回家，小旅行家</strong><small>从 '+esc(h.destination)+' 带回了新见闻。</small></div><button class="btn secondary sm" data-action="trip-letter" data-id="'+h.id+'">拆开来信</button></div>':'')+(t.pendingGifts?.length?'<p class="travel-pending">还有 '+t.pendingGifts.length+' 份旅行礼物没收下。<button class="text-btn" data-action="trip-letter" data-id="'+t.pendingGifts[0].tripId+'">去看看 →</button></p>':'');
}

export function routePicker(weekly,esc){
 const choices=weekly?.choices||[];
 const note=weekly?.used?'这周的指定地点已用过，下周再相约。':choices.length?'这周打卡满三天啦，可以指定一次目的地。':`本周已打卡 ${Math.min(3,weekly?.days||0)} / 3 天，满三天可指定一次目的地。`;
 const routes=TRAVEL_ROUTES.concat(choices.map(({id,place})=>['wish:'+id,place]));
 return `<fieldset class="travel-route-picker"><legend>这趟想怎么走？</legend>${routes.map(([id,label])=>`<label><input type="radio" name="route" value="${esc(id)}" ${id==='auto'?'checked':''}><span>${esc(label)}</span></label>`).join('')}</fieldset><p class="field-help">${note}</p><p id="travel-route-preview" class="field-help" aria-live="polite"></p>`;
}

function keepsake(h,canAct,esc){
 const clue=KEEPSAKES[h.placeId];if(!clue)return '';
 return `<section class="keepsake-pocket"><h3>${h.keepsakeFound?'收进纪念柜了':'翻翻旅行口袋'}</h3><p>${esc(clue.clue)}</p>${h.keepsakeFound?'<div class="keepsake-found-row"><strong class="keepsake-found">'+keepsakeIcon(h.placeId)+esc(clue.items[clue.answer])+'</strong>'+(canAct?'<button type="button" class="btn secondary sm" data-action="cottage-shelf">摆上小屋窗台 →</button>':'')+'</div>':canAct?`<div class="travel-quiz-options">${clue.items.map((item,i)=>`<button class="btn secondary sm" data-action="trip-keepsake" data-index="${i}">${esc(item)}</button>`).join('')}</div><small id="keepsake-feedback" role="status">根据线索猜猜它亲手做的是哪一件纪念物？</small>`:'<small>等小伙伴的主人来揭晓。</small>'}</section>`;
}

export function postcardContents(h,s,canAct,esc,actions){
 const k=h.knowledge;
 const badges=[...(h.letterBadge?[h.letterBadge]:[]),MOOD_LABELS[h.mood]||MOOD_LABELS.day,...(h.combos||[]),...(h.cameo?['🐾 偶遇当地小动物同框']:[])];
 const canShare=canAct&&!s?.space?.personal;
 return `${postcardPicture(h)}<div class="postcard-tags">${badges.map(b=>`<span class="set-pill">${esc(b)}</span>`).join('')}</div><p class="mail-letter">${esc(h.story)}</p>${h.postscript?`<div class="travel-postscript"><strong>💌 收到你回信后的旅途彩蛋</strong><p>${esc(h.postscript)}</p></div>`:''}<p class="field-help">虚构的宠物旅行故事 · 归来已获得 ${h.xp} 经验。${canShare?(h.shared?' <span>· 已抄送给小屋伙伴 ✓</span>':` <button type="button" class="text-btn" data-action="trip-share" data-id="${esc(h.id)}">把明信片抄送给小屋伙伴 ↗</button>`):''}</p>${keepsake(h,canAct,esc)}${h.hasGift?`<div class="travel-letter-gift"><span><strong>${esc(h.giftTitle||'一份旅行小礼物')}</strong><small>${h.claimed?'已经收好啦':'和信箱是同一份礼物，只需领取一次。'}</small></span>${!h.claimed&&canAct?'<button class="btn sm" data-action="trip-gift" data-id="'+h.id+'" data-mail="'+h.mailId+'">收下礼物</button>':''}</div>`:''}
 ${k?`<section class="travel-knowledge"><span class="pet-eyebrow">捎给你的小知识</span><h3>${esc(k.stamp)}</h3><p>${esc(k.fact)}</p><details class="travel-quiz"><summary>猜一猜：${esc(k.question)}</summary><div class="travel-quiz-options">${k.choices.map((c,i)=>'<button class="btn secondary sm" data-action="trip-quiz" data-index="'+i+'">'+esc(c)+'</button>').join('')}</div><p id="travel-quiz-feedback" aria-live="polite">只是一起想一想，答错也没有关系，不计分。</p></details></section>`:''}
 ${/^https:\/\/whc\.unesco\.org\/en\/list\/\d+\/$/.test(h.source||'')?'<p><a href="'+esc(h.source)+'" target="_blank" rel="noopener">小知识来源：UNESCO ↗</a></p>':''}
 ${canAct?`<form id="travel-memory-form" data-id="${h.id}"><label class="field-label" for="travel-memory">我记住的一件小事</label><textarea id="travel-memory" name="memory" maxlength="240" rows="3" placeholder="写一句发现，给这张明信片加上你的声音。">${esc(h.memory)}</textarea><p class="field-help">选填，最多 240 字；记在这间小屋的明信片里。</p>${actions('保存小发现')}</form>`:h.memory?'<div class="travel-memory"><strong>伙伴的小发现</strong><p>'+esc(h.memory)+'</p></div>':''}
 ${k?`<div class="travel-practice"><strong>把好奇心带回今天</strong><p>${esc(k.practice)}</p><small>预计 ${k.minutes} 分钟 · 完成后按本屋规则计分</small>${h.practiceTask?'<p class="subtext">已加入计划'+(h.practiceTask.archived?'（已归档）':'')+'，同一趟不重复添加。</p>':canAct?'<button class="btn secondary sm" data-action="trip-practice" data-id="'+h.id+'">安排一个小计划 →</button>':''}</div>`:''}`;
}
