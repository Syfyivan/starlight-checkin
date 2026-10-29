import {renameNotice} from './rooms.js';
import {friendChatUI} from './chat.js';
import {taskTypeLabel} from './task-types.js';
export function communityUI({getState,api,refresh,render,navigate,openDialog,dialog,esc,time,field,textarea,actions,toast,roomLabel}){
  let inbox={entries:[],next:null},logs={entries:[],next:null},direction='received',tab='letters',diaryOriginal='',diaryDay='',sharePreview=null;
  const shown=new Set(),state=()=>getState(),closed=()=>state().space.status!=='active';
  const chat=friendChatUI({getState,api,openDialog,dialog,esc,time});
  let threadPoll=null,lastThreads=0;
  const scopeName={activity:'任务动态',diary:'日记',both:'任务动态和日记'},statusName={pending:'等回复',accepted:'已同意',declined:'暂不同意',cancelled:'已撤回 / 已结束',done:'通知'};
  async function load(page,more=false){
    if(page==='inbox'){const r=await api('community/inbox?direction='+direction+(more&&inbox.next?'&before='+inbox.next:''));inbox={...r,entries:more?[...inbox.entries,...r.entries]:r.entries};}
    if(page==='logs'){const r=await api('community/logs?space_id='+encodeURIComponent(state().space.id)+(more&&logs.next?'&before='+logs.next:''));logs={...r,entries:more?[...logs.entries,...r.entries]:r.entries};}
  }
  function badge(){const n=(state().community.pendingCount||state().community.unread)+(state().community.chatUnread||0);return `<button class="mail-button" data-page="inbox" aria-label="我的信箱${n?'，'+n+' 条待处理或未读':''}"><span aria-hidden="true">✉</span><span class="mail-label">信箱</span>${n?`<b>${Math.min(n,99)}${n>99?'+':''}</b>`:''}</button>`;}
  function familyStrip(){const f=state().family;if(!f)return '';return `<div class="family-strip" aria-label="家庭成员计划">${f.members.map(m=>`<button class="family-person ${m.space_id===state().space.id?'selected':''}" data-action="switch-room" data-id="${m.space_id}"><span>${esc(m.name)}${m.user_id===state().user.id?' · 我':''}${m.is_admin?' ♡':''}</span><small>${m.done}/${m.total} 已完成</small></button>`).join('')}</div>`;}
  function roomInfo(){
    const s=state(),f=s.family,c=s.closure;
    const pending=c.pending?`<div class="notice soft"><strong>💌 有一份关闭小窝申请</strong><p>${c.pending.votes.filter(v=>v.decision==='accepted').length} / ${c.pending.votes.length} 位伙伴已同意。</p>${c.pending.requester_id===s.user.id?`<button class="text-btn" data-action="close-cancel" data-id="${c.pending.id}">撤回这份申请</button>`:'<button class="text-btn" data-page="inbox">去信箱回复</button>'}</div>`:'';
    const members=f?`<p class="subtext">${f.members.length} / 6 位伙伴 · ♡ 是奖品管家。${f.mode==='guardian'?'家长发奖：管家备奖，其他家人完成任务领奖。':f.mode==='friends'?'朋友共进：大家都能领奖，也能完成共同计划、攒共享金币。':'各自成长：计划与金币各自计算，共享奖池和库存。'}</p><div class="family-members">${f.members.map(m=>`<div class="record-row"><span class="avatar">${esc(m.name.slice(0,1))}</span><div class="record-main"><strong>${esc(m.name)}${m.user_id===s.user.id?' · 我':''}</strong><small>@${esc(m.username)} · ${m.done}/${m.total} 已完成${m.is_admin?' · 奖品管家':''}</small></div><button class="text-btn" data-action="switch-room" data-id="${m.space_id}">看计划</button></div>`).join('')}</div>${!closed()?`<button class="btn secondary full-width mt" data-action="family-invite" ${f.members.length>=6||c.pending?'disabled':''}>💌 邀请一位家人</button>`:''}${!closed()&&f.creator_id===s.user.id?`<details class="mt"><summary>安排 1–2 位奖品管家</summary><form id="family-admins-form"><p class="subtext">只有管家可以改奖池、核销卡片；${f.mode==='guardian'?'在家长发奖模式中，管家不参与任务领奖。':'管家也能正常做任务领奖。'}变更会通知全体成员并记入日志。</p>${f.members.map(m=>`<label class="checkbox-label"><input type="checkbox" name="admins" value="${m.user_id}" ${m.is_admin?'checked':''}>${esc(m.name)}</label>`).join('')}${actions('保存管家名单')}</form></details>`:''}`:`<p>${s.space.personal?'这间个人小屋只属于你。':'这间小屋只有你们两个人能看。'}</p>`;
    openDialog(f?'🏡 '+esc(f.name):'这间小屋的约定',`${renameNotice(s,esc,time)}${members}${f&&f.creator_id===s.user.id&&!closed()?`<details class="mt"><summary>家庭形式</summary><form id="family-mode-form"><label class="field">相处方式<select name="mode">${[['classic','各自成长（原有规则）'],['friends','朋友共进'],['guardian','家长发奖']].map(([id,name])=>`<option value="${id}" ${f.mode===id?'selected':''}>${name}</option>`).join('')}</select></label><p class="field-help">朋友共进有共同计划和共享金币；家长发奖由管家备奖，其他人领奖。旧记录与卡片保留。切换会通知家人。</p>${actions('保存家庭形式')}</form></details>`:''}${pending}<div class="welcome-links"><button class="text-btn" data-page="logs">📒 看小屋日志</button>${s.admin?'<button class="text-btn" data-page="admin">🎁 奖品与报销</button>':''}</div>${closed()?'<p class="notice soft">小屋已经收好，不能继续攒币和兑换。计划与日志仍可查看，已有卡仍可报销。</p>':c.canRequest&&!c.pending?`<details class="room-close-options"><summary>关闭小窝</summary><p class="subtext">${f?'需要其余每一位家人':'需要另一位伙伴'}同意才生效。已发出的卡仍可兑现，日志和账本保留。${c.legacyCreator?'这间旧小屋没有记录创建人，双方都可以发起。':''}</p><button class="btn secondary full-width" data-action="close-request">申请关闭小窝</button></details>`:''}`);
  }
  function snapshotHTML(snapshot){
    const d=snapshot;return `<div class="day-snapshot"><p class="subtext">${esc(d.name)} · ${esc(d.day)} · ${scopeName[d.scope]}</p>${d.scope!=='activity'?`<section><h3>📖 这一天的日记</h3><div class="journal-text">${esc(d.diary?.content||'这一天还没有写日记。')}</div></section>`:''}${d.scope!=='diary'?`<section><h3>🌱 任务动态</h3>${d.activity.length?d.activity.map(e=>`<div class="record-row"><div class="record-main"><strong>${esc(e.summary)}</strong><small>${time(e.created)}</small></div></div>`).join(''):'<p class="subtext">这一天没有新记录。</p>'}${d.truncated?'<p>仅展示前 1000 条动态。</p>':''}<details class="mt"><summary>这一天的打卡记录（${d.completions.length}）</summary>${d.completions.map(c=>`<div class="record-row"><div class="record-main"><strong>${c.done?'✓':'↩'} ${esc(c.title)}</strong><small>${c.done?'已完成':'已撤销'}${c.note?' · '+esc(c.note):''}</small></div></div>`).join('')}</details></section>`:''}</div>`;
  }
  function mailText(m){const p=m.payload,who=m.recipient_id&&m.recipient_id!==state().user.id?m.recipient_name:'你';return m.kind==='room_invite'?`${m.sender_name} ${p.direction==='family'?'邀请'+who+'加入「'+p.family_name+'」家庭':p.direction==='learner'?'想给'+who+'发奖励，一起建一间小屋':'想请'+who+'给 TA 发奖励，一起建一间小屋'}。${p.label?' 留言：'+p.label:''}`:m.kind==='view_day'?`${m.sender_name} 想看看${who} ${p.day} 的${scopeName[p.scope]}。`:m.kind==='room_close'?`${m.sender_name} 想关闭「${p.room_name}」${p.family?'家庭':''}。需要所有伙伴同意才会生效。`:m.kind==='friend'?`${m.sender_name} 想和${who}成为好友。成为好友后仍需另外申请，才能查看某一天的动态或日记。`:p.text||m.subject;}
  async function mailDialog(m){
    const received=m.recipient_id===state().user.id||!m.recipient_id,pending=received&&m.status==='pending';
    let extra='',inviteError='';sharePreview=null;
    if(pending&&m.kind==='view_day'){
      sharePreview=await api('community/share-preview?id='+encodeURIComponent(m.id));
      extra=`<details class="share-preview" open><summary>即将分享的内容，先看一眼</summary>${snapshotHTML(sharePreview.snapshot)}</details><p class="subtext">只分享上面的快照。之后修改日记不会自动更新给朋友；你可以随时撤回访问。任务动态不含其他成员、房间名称或奖池。</p>`;
    }
    if(pending&&m.kind==='room_invite'){
      try{await api('friends/invite-preview?id='+encodeURIComponent(m.id));}catch(e){inviteError=e.message;}
      extra=`<p class="subtext">${m.payload.direction==='family'?'加入后和家人互相看见计划，共享奖池，学习币与卡包各自计算。':m.payload.direction==='learner'?'你来做计划、攒币领奖；朋友来准备奖励、确认报销。':'你来准备奖励、确认报销；朋友来做计划、攒币领奖。'}</p><p class="subtext">邀请有效至 ${time(new Date(m.payload.expires).toISOString())}。已有小屋与好友关系保持原样。</p>${inviteError?'<p class="error-text">'+esc(inviteError)+'</p>':''}`;
    }
    const controls=pending?`<form id="mail-response-form" data-id="${m.id}">${m.kind==='room_close'?'<p class="subtext">同意后，等所有人点头，小屋才会关闭；旧卡和历史记录仍保留。你也可以暂不同意。</p>':''}${extra}<div class="error-text" role="alert"></div><div class="form-actions"><button class="btn secondary" name="decision" value="no" type="submit">暂不同意</button><button class="btn" name="decision" value="yes" type="submit" ${inviteError?'disabled':''}>${m.kind==='view_day'?'同意分享以上内容':m.kind==='room_invite'?'接受邀请':'同意'}</button></div></form>`:`<p class="subtext">${statusName[m.status]||''}</p>${m.share_id&&!m.share_revoked?`<button class="btn" data-action="day-share" data-id="${m.share_id}">查看已同意的内容</button>${received?`<button class="text-btn mt" data-action="share-revoke" data-id="${m.share_id}">撤回这份查看权限</button>`:''}`:''}`;
    if(received&&m.payload.gift)extra=`<div class="mail-gift"><strong>🎁 ${esc(m.payload.gift.title||'一份小礼物')}</strong><p>${m.payload.gift.claimed?'已收好，去卡包或抽奖看看吧。':'这份心意已经准备好，点一下收入自己的小屋。'}</p>${!m.payload.gift.claimed?`<button class="btn" data-action="mail-gift-claim" data-id="${m.id}">收下小礼物</button>`:''}</div>`;
    openDialog(m.kind==='notice'?esc(m.subject):'💌 '+esc(m.sender_name||'朋友')+' 来信啦',`<p class="mail-letter">${esc(mailText(m))}</p>${m.kind==='notice'?'':controls}${m.kind==='notice'?extra:''}${m.payload.space_id?`<button class="text-btn mt" data-action="mail-room" data-id="${m.id}">去这间小屋看看 →</button>`:''}${/^https:\/\/whc\.unesco\.org\/en\/list\/\d+\/$/.test(m.payload.sourceUrl||'')?`<p><a href="${esc(m.payload.sourceUrl)}" target="_blank" rel="noopener">知识来源：UNESCO</a></p>`:''}`);
    if(received){await api('community/read',{ids:[m.id]});if(!m.read_at){state().community.unread=Math.max(0,state().community.unread-1);m.read_at=new Date().toISOString();}}
  }
  function notify(){if(dialog.open)return;const m=state().community.pending.find(m=>!shown.has(state().user.id+':'+m.id));if(!m)return;shown.add(state().user.id+':'+m.id);openDialog('💌 有伙伴在等你的回复',`<p>${esc(mailText(m))}</p><p class="subtext">申请也会留在你的信箱里，可以稍后再决定。</p><div class="form-actions"><button class="btn secondary" data-action="close">稍后看看</button><button class="btn" data-action="pending-mail" data-id="${m.id}">看看这份申请</button></div>`);}
  function inboxPage(){const s=state();return `<div class="compact-heading"><div><h1>我的信箱</h1><p class="subtext">和好友聊聊天，也收好小屋的来信。查看日记仍需要你点头。</p></div><button class="btn secondary sm" data-action="friend-add">＋ 加好友</button></div><div class="admin-tabs"><button class="${tab==='letters'&&direction==='received'?'active':''}" data-action="mail-tab" data-value="received">收到的信${s.community.pendingCount?' · '+s.community.pendingCount+' 待回复':''}</button><button class="${tab==='letters'&&direction==='sent'?'active':''}" data-action="mail-tab" data-value="sent">寄出的信</button><button class="${tab==='friends'?'active':''}" data-action="mail-tab" data-value="friends">好友聊天${s.community.chatUnread?' · '+s.community.chatUnread+' 未读':''}</button></div>${tab==='friends'?friendsHTML():`<section class="panel mail-list">${inbox.entries.map(m=>`<button class="mail-row ${!m.read_at&&direction==='received'?'unread':''}" data-action="mail-open" data-id="${m.id}"><span class="mail-emoji">${m.kind==='room_close'?'🏡':m.kind==='friend'?'🌱':m.kind==='view_day'?'📖':'✉'}</span><span class="record-main"><strong>${direction==='sent'?'给 '+esc(m.recipient_name):m.payload.letterKind?'小屋来信':esc(m.sender_name)} · ${esc(m.subject)}</strong><small>${m.payload.day?m.payload.day+' · '+(scopeName[m.payload.scope]||'日报')+' · ':''}${time(m.created)}</small></span><span class="mail-state">${statusName[m.status]}${m.share_revoked?' · 分享已撤回':''}</span></button>`).join('')||'<p class="subtext">信箱空空，今天也轻轻松松。</p>'}${inbox.next?'<button class="text-btn full-width mt" data-action="mail-more">再看更早的信</button>':''}</section>`}`;}
  function friendsHTML(){return `<section class="panel friend-list">${state().community.friends.map(f=>`<article class="friend-item"><div class="friend-summary"><span class="avatar">${esc(f.name.slice(0,1))}</span><div class="record-main"><strong>${esc(f.name)} ${f.unread?'<b class="friend-unread">'+Math.min(99,f.unread)+(f.unread>99?'+':'')+'</b>':''}</strong><small>@${esc(f.username)} · ${esc(f.last_message||'还没聊过天，打个招呼吧')}</small></div><button class="btn sm" data-action="friend-chat" data-id="${f.id}">聊天</button></div><div class="friend-actions"><button class="text-btn" data-action="friend-invite" data-id="${f.id}">邀请进小屋</button><button class="text-btn" data-action="friend-view" data-id="${f.id}">申请看动态</button><button class="text-btn" data-action="friend-remove" data-id="${f.id}">移除好友</button></div></article>`).join('')||'<p class="subtext">还没有好友。用朋友的登录账号，寄出第一张小请柬吧。</p>'}</section>`;}
  function friendInvite(peer='',preset=''){
    const s=state(),friends=s.community.friends,types=[['learner','我给朋友发奖'],['manager','请朋友给我发奖'],...(s.family?[['family','邀请加入「'+s.family.name+'」家庭']]:[])],direction=types.some(t=>t[0]===preset)?preset:'learner';
    if(!friends.length){openDialog('先认识一位小伙伴', '<p>成为好友后，就能直接把小屋邀请寄进 TA 的信箱。也可以继续使用邀请码或链接。</p><button class="btn" data-action="friend-add">加好友</button>');return;}
    openDialog('给好友寄一张小请柬',`<form id="friend-invite-form"><label class="field">寄给谁？<select name="user_id" required>${friends.map(f=>'<option value="'+f.id+'" '+(f.id===peer?'selected':'')+'>'+esc(f.name)+' · @'+esc(f.username)+'</option>').join('')}</select></label><label class="field">邀请朋友做什么？<select name="direction">${types.map(([id,name])=>'<option value="'+id+'" '+(id===direction?'selected':'')+'>'+esc(name)+'</option>').join('')}</select></label>${field('留一句邀请的话','label','text','一起慢慢成长','required maxlength="40"')}<p class="subtext">朋友会在信箱收到邀请，点头后再加入。邀请 7 天有效，不会自动加入，也不会合并已有小屋。</p>${actions('寄到好友信箱')}</form>`);
  }
  async function poll(){
    if(!state())return;await chat.poll().catch(()=>{});if(!state())return;
    if(threadPoll||Date.now()-lastThreads<10000)return;
    const uid=state().user.id;lastThreads=Date.now();threadPoll=(async()=>{
      const r=await api('friends/threads');if(state()?.user.id!==uid)return;
      state().community.friends=r.friends;state().community.chatUnread=r.friends.reduce((n,f)=>n+f.unread,0);
      const badgeEl=document.querySelector('.mail-button');if(badgeEl&&badgeEl!==document.activeElement)badgeEl.outerHTML=badge();
      const friendTab=document.querySelector('[data-action="mail-tab"][data-value="friends"]');if(friendTab)friendTab.textContent='好友聊天'+(state().community.chatUnread?' · '+state().community.chatUnread+' 未读':'');
      // Never replace the list under a keyboard user or while a dialog is open.
      const list=document.querySelector('.friend-list');if(list&&!dialog.open&&!list.contains(document.activeElement))list.outerHTML=friendsHTML();
    })();try{await threadPoll;}finally{threadPoll=null;}
  }
  function auditDetail(l){
    const d=l.detail,lines=[];
    if(l.action==='/api/cards/rename-room'||l.action==='room.rename.expired'){lines.push(`小屋名字：${d.oldName} → ${d.name||'默认小屋名'}`);if(d.expires)lines.push('招牌有效至：'+time(d.expires));}
    if(l.action==='task.daily.settlement')lines.push('当日获得 '+d.gross+' 币 · 未完成 '+d.missed.length+' 项 · 扣 '+d.percent+'%（'+d.deducted+' 币）',...d.missed.map(t=>'未完成：'+t.title));
    if(d.tasks)lines.push(...d.tasks.map(t=>`${t.title} · 每次 ${t.points} 币 · ${taskTypeLabel(t)} · ${t.start_date} 起`));
    if(d.task?.nominal!==undefined)lines.push('应得 '+d.task.nominal+' 币，实际 '+d.task.awarded+' 币'+(d.task.capped?'（每日额度限制）':''));
    if(d.task?.rescore&&d.task.previous)lines.push('修改前 '+d.task.previous.points+' 币 → 修改后 '+d.task.awarded+' 币');
    if(d.task)lines.push(`${d.task.rescore?'修改得分':d.task.done?'标记完成':'取消完成'} · 本次 ${d.task.points>0?'+':''}${d.task.points} 币`);
    if(d.cards)lines.push(...d.cards);
    if(d.added!==undefined)lines.push(`新增 ${d.added} 张商品，恢复 ${d.restored} 张`);
    if(d.cardMove)lines.push(`原额度 ¥${d.cardMove.input_cents/100} → 新卡合计 ¥${d.cardMove.output_cents/100}${d.cardMove.bonus_cents?' · 合成加成 ¥'+d.cardMove.bonus_cents/100:' · 等额转换'}`);
    if(d.paid_cents!==undefined)lines.push(`实际报销 ¥${d.paid_cents/100}`);
    if(d.tickets)lines.push(`免费机会 ${d.tickets>0?'+':''}${d.tickets} 次`);
    if(d.bonus)lines.push(`全勤奖励 ${d.bonus.amount>0?'+':''}${d.bonus.amount} ${d.bonus.kind==='ticket'?'次机会':'币'}`);
    if(l.action==='/api/admin/odds'&&d.after)for(const item of d.after){const old=d.before?.find(x=>x.id===item.id);if(old?.bps!==item.bps)lines.push(`${item.title||'心愿卡'}：${(old?.bps||0)/100}% → ${item.bps/100}%`);}
    if(d.after&&!Array.isArray(d.after)){
      const fields={effect:'卡片用途',taskScoreMode:'任务计分方式',defaultDifficulty:'默认投入等级',defaultPoints:'默认分数',title:'名称',cost:'学习币价格',stock:'库存',active:'是否上架',face_cents:'报销额度',wait_days:'等待天数',spaceName:'空间名称',coinName:'积分名称',dailyCap:'每日赚币上限',drawCost:'每次抽奖花费',drawLimit:'每天付费抽奖次数',dailyBonusKind:'全勤奖励',dailyBonusAmount:'全勤数量',marketThreshold:'市场解锁门槛'};
      const display=(k,v)=>v===undefined?'未设置':k==='taskScoreMode'?(v==='difficulty'?'按投入等级':'自由填写'):k==='defaultDifficulty'?(state().difficulties.find(d=>d.id===v)?.name||v):k==='effect'?(v==='room_rename'?'小屋改名':'报销 / 约定奖励'):k==='cost'?v/1000000+' 币':k==='face_cents'?'¥'+v/100:k==='active'?v?'上架':'下架':k==='dailyBonusKind'?({ticket:'免费机会',coins:'学习币',none:'关闭'}[v]):v;
      for(const [k,label] of Object.entries(fields))if(d.after[k]!==undefined&&d.before?.[k]!==d.after[k])lines.push(`${label}：${display(k,d.before?.[k])} → ${display(k,d.after[k])}`);
      if(d.after.difficultyPoints)for(const level of state().difficulties)if(d.before?.difficultyPoints?.[level.id]!==d.after.difficultyPoints[level.id])lines.push(level.name+'：'+d.before?.difficultyPoints?.[level.id]+' → '+d.after.difficultyPoints[level.id]+' 币');
      if(d.after.rates)for(const c of state().categories)if(d.before?.rates?.[c.id]!==d.after.rates[c.id])lines.push(`${c.name}每元建议价：${d.before?.rates?.[c.id]??'未设置'} → ${d.after.rates[c.id]} 币`);
    }
    return lines.length?`<details><summary>操作详情</summary><ul class="audit-detail">${lines.map(x=>'<li>'+esc(x)+'</li>').join('')}</ul></details>`:'';
  }
  function logsPage(){return `<div class="compact-heading"><div><h1>${state().family?'家庭':'小屋'}日志</h1><p class="subtext">${state().family?'每位成员和奖品管家':'你们'}的操作都留一笔。记录不能修改或删除，撤销也会留下痕迹。</p></div><button class="text-btn" data-page="ledger">积分账本 →</button></div><section class="panel audit-list">${logs.entries.map(l=>`<article class="audit-row"><div class="audit-dot"></div><div><small>${time(l.created)} · ${esc(l.actor_name)}</small><p>${esc(l.summary)}</p>${auditDetail(l)}</div></article>`).join('')||'<p class="subtext">新的操作会从这里开始记录，升级前的积分仍在账本里。</p>'}${logs.next?'<button class="text-btn full-width mt" data-action="logs-more">看更早的记录</button>':''}</section>`;}
  async function diaryOpen(day=state().day){const d=await api('community/diary?day='+encodeURIComponent(day));diaryOriginal=d.content;diaryDay=d.day;openDialog('📖 留一点今天的心情',`<form id="diary-form">${field('想记哪一天？','diary_day','date',d.day,`required max="${state().day}" min="2000-01-01"`)}<button type="button" class="text-btn" data-action="diary-load">打开这一天</button>${textarea('只给自己看的小日记','content',d.content,'maxlength="8000" rows="10" placeholder="今天有什么想记下来的？"')}<p class="subtext">家庭成员和好友都不能直接看。朋友按日期申请后，只有你同意才会分享；清空后保存可删除原日记。</p>${actions('把这一天存好')}</form>`);}
  async function click(action,el){
    switch(action){
      case 'friend-chat':await chat.open(el.dataset.id);return;
      case 'chat-older':await chat.older();return;
      case 'friend-invite':friendInvite(el.dataset.id,el.dataset.direction);return;
      case 'invite-friends':friendInvite('',el.dataset.direction);return;
      case 'room-settings':roomInfo();return;
      case 'family-create':openDialog('🏡 成立一个小家庭',`<form id="family-create-form">${field('给家庭起个名字','name','text','','required maxlength="24" placeholder="例如：元气充电站"')}<label class="field">家庭形式<select name="mode"><option value="friends">朋友共进</option><option value="guardian">家长发奖</option></select></label><p>朋友共进：管家也能领奖，个人与共同计划都能做。家长发奖：管家准备奖励，其他家人做任务领奖。</p><p class="subtext">你先担任奖品管家，之后可从成员中安排 1–2 位。家庭共享奖池与库存，个人日记仍是私密的。</p>${actions('建好这个家')}</form>`);return;
      case 'family-invite':{const r=await api('family/invite',{}),url=location.origin+location.pathname+'#join='+r.code;await refresh();openDialog('💌 邀请一位家人',`<p>来「${esc(r.name)}」一起种计划。邀请码 7 天有效，只能被一位新成员使用。</p><div id="invite-code" class="code-display">${esc(r.code.match(/.{1,6}/g).join('-'))}</div><button class="btn full-width" data-action="copy-invite">复制邀请码</button><input id="invite-link" class="sr-only" value="${esc(url)}" readonly aria-label="邀请链接"><button class="btn secondary full-width mt" data-action="copy-invite-link">复制邀请链接</button><button class="btn secondary full-width mt" data-action="invite-friends" data-direction="family">发给站内好友</button><p class="subtext">加入后，TA 与家人互相看见计划。币和卡包仍各自计算。</p>`);return;}
      case 'close-request':openDialog('商量一下，关闭这间小窝？',`<form id="room-close-form" data-mode="deleted"><p>给${state().family?'其余家人':'另一位伙伴'}发一封确认信，全部同意后才生效。等待期间仍可正常打卡${state().family?'，家庭暂时不加入新成员':''}。</p><p class="subtext">关闭后停止这间小窝的新打卡、兑换和抽奖，收进“历史小屋”。已有卡仍可报销，计划、账本和日志保留；好友关系和其他小窝不受影响。</p>${actions('寄出这份申请')}</form>`);return;
      case 'close-cancel':await api('rooms/close/cancel',{request_id:el.dataset.id});dialog.close();await refresh();toast('申请已撤回，小屋继续亮着灯');return;
      case 'mail-tab':tab=el.dataset.value==='friends'?'friends':'letters';if(tab==='letters'){direction=el.dataset.value;await load('inbox');}render();return;
      case 'mail-more':await load('inbox',true);render();return;
      case 'logs-more':await load('logs',true);render();return;
      case 'mail-room':{const m=inbox.entries.find(m=>m.id===el.dataset.id);if(m?.payload.space_id){dialog.close();await navigate(m.payload.letterKind?.startsWith('travel')?'growth':'today',m.payload.space_id);}return;}
      case 'mail-gift-claim':{const m=inbox.entries.find(m=>m.id===el.dataset.id);if(!m)return;const r=await api('mail/claim',{mail_id:m.id,space_id:m.payload.space_id});dialog.close();await refresh();toast(r.note);return;}
      case 'mail-open':await mailDialog(inbox.entries.find(m=>m.id===el.dataset.id));return;
      case 'pending-mail':{const m=state().community.pending.find(m=>m.id===el.dataset.id);if(m)await mailDialog({...m,status:'pending'});return;}
      case 'friend-add':openDialog('🌱 认识一位新伙伴',`<form id="friend-add-form">${field('朋友的登录账号','username','text','','required minlength="3" maxlength="32" pattern="[a-zA-Z0-9_]+" placeholder="例如：xiaoya_01"','填写账号，不是昵称。朋友可以在头像菜单里找到 @ 后面的账号。')}<p class="subtext">对方同意后成为好友。就能聊天、寄小屋邀请；日记仍需单独同意才能查看。</p>${actions('寄出好友申请')}</form>`);return;
      case 'friend-view':{const f=state().community.friends.find(f=>f.id===el.dataset.id);openDialog('📖 申请看看 '+esc(f.name)+' 的一天',`<form id="friend-view-form" data-id="${f.id}">${field('想看哪一天？','day','date',state().day,`required min="2000-01-01" max="${state().day}"`)}<label class="field">想看哪些内容？<select name="scope"><option value="both">任务动态和日记</option><option value="activity">只看任务动态</option><option value="diary">只看日记</option></select></label><p class="subtext">对方会先预览将要分享的内容，再决定是否同意。只开放这一天，也可以之后撤回。</p>${actions('寄出查看申请')}</form>`);return;}
      case 'friend-remove':openDialog('把这位好友先移出名单？',`<form id="friend-remove-form" data-id="${el.dataset.id}"><p>你们将停止聊天，互相开放的日记和动态会停止访问，待处理的查看申请与小屋邀请也会取消。</p><p class="subtext">聊天记录不会删除，重新成为好友后可继续查看。</p><p class="subtext">共同加入的小屋和家庭不会解散。</p>${actions('确认移除好友')}</form>`);return;
      case 'day-share':{const r=await api('community/day-share?id='+encodeURIComponent(el.dataset.id));openDialog('朋友分享的一天',`<p class="subtext">分享于 ${time(r.created)} · 是当时同意的快照</p>${snapshotHTML(r.snapshot)}`);return;}
      case 'share-revoke':openDialog('收回这份查看权限？',`<form id="share-revoke-form" data-id="${el.dataset.id}"><p>朋友将不能再从信箱打开这份内容。已经看到的内容无法从对方记忆或截图中收回。</p>${actions('确认收回')}</form>`);return;
      case 'diary-open':await diaryOpen();return;
      case 'diary-load':{const content=document.querySelector('#f-content');if(content.value!==diaryOriginal){toast('先保存当前日记，再打开另一天吧');return;}await diaryOpen(document.querySelector('#f-diary_day').value);return;}
    }
  }
  async function submit(form,data,formData,key,submitter){
    let route,body,message;
    switch(form.id){
      case 'friend-chat-form':await chat.send(form,data,key);return;
      case 'friend-invite-form':route='friends/invite';body={user_id:data.user_id,direction:data.direction,label:data.label};message='邀请已放进好友信箱，等 TA 点头吧';break;
      case 'family-create-form':route='family/create';body={name:data.name,mode:data.mode};message='小家庭建好啦，邀请伙伴回家吧';break;
      case 'family-mode-form':route='family/mode';body={mode:data.mode,expected_mode:state().family.mode};message='家庭形式已保存';break;
      case 'family-admins-form':route='family/admins';body={user_ids:formData.getAll('admins'),expected_admins:state().family.members.filter(m=>m.is_admin).map(m=>m.user_id)};message='奖品管家安排好啦';break;
      case 'room-close-form':route='rooms/close';body={mode:form.dataset.mode};message='申请已经放进伙伴的信箱';break;
      case 'mail-response-form':route='community/respond';body={id:form.dataset.id,accept:submitter?.value==='yes',snapshotHash:sharePreview?.snapshotHash};message=body.accept?'同意的心意已寄出':'已回复，按自己的心意决定就好';break;
      case 'friend-add-form':route='friends/request';body={username:data.username};message='好友申请寄出啦';break;
      case 'friend-view-form':route='friends/view-request';body={user_id:form.dataset.id,day:data.day,scope:data.scope};message='查看申请寄出啦，等朋友点头';break;
      case 'friend-remove-form':route='friends/remove';body={user_id:form.dataset.id};message='已移除好友，并收回互相查看的权限';break;
      case 'share-revoke-form':route='community/revoke';body={id:form.dataset.id};message='这份查看权限已经收回';break;
      case 'diary-form':if(data.diary_day!==diaryDay)throw new Error('先点“打开这一天”，再写下那天的日记吧');route='community/diary';body={day:diaryDay,content:data.content,expectedContent:diaryOriginal};message=data.content.trim()?'这一天，替你认真收好啦':'日记已清空，已分享的快照可在信箱撤回';break;
      default:return;
    }
    const r=await api(route,body,{key});dialog.close();if(form.id==='family-create-form'||(form.id==='mail-response-form'&&r.space_id))await navigate('today',r.space_id);else await refresh();toast(message);
  }
  return {load,badge,familyStrip,roomInfo,notify,inboxPage,logsPage,click,submit,poll};
}
