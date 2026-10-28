// Private conversations stay separate from room activity and mailbox invitations.
export function friendChatUI({getState,api,openDialog,dialog,esc,time}){
  let current=null,account='',opening=0;
  const drafts=new Map();
  function syncAccount(){const id=getState()?.user.id||'';if(account!==id){account=id;current=null;drafts.clear();opening++;}return id;}
  const live=c=>c&&current===c&&getState()?.user.id===c.account&&dialog.open&&dialog.querySelector('#friend-chat-form')?.dataset.userId===c.peer;
  function status(c,text){if(live(c))dialog.querySelector('.chat-status').textContent=text;}
  function merge(c,entries){const all=new Map(c.entries.map(m=>[m.id,m]));for(const m of entries)all.set(m.id,m);c.entries=[...all.values()].sort((a,b)=>a.seq-b.seq);}
  function paint(c,older=false){
    if(!live(c))return;
    const box=dialog.querySelector('.chat-history'),height=box.scrollHeight,top=box.scrollTop,atEnd=height-top-box.clientHeight<80;
    box.innerHTML=c.entries.map(m=>`<article class="chat-message ${m.sender_id===c.account?'mine':''}" aria-label="${m.sender_id===c.account?'我':esc(c.name)}"><p>${esc(m.body)}</p><time datetime="${esc(m.created)}">${time(m.created)}</time></article>`).join('')||'<p class="chat-empty">和朋友打个招呼吧。</p>';
    box.scrollTop=older?top+box.scrollHeight-height:atEnd?box.scrollHeight:top;
    dialog.querySelector('[data-action="chat-older"]').hidden=!c.before;
  }
  async function markRead(c){
    const through=c.entries.at(-1)?.seq||0;if(!live(c)||through<=c.read)return;
    await api('friends/read',{user_id:c.peer,through});if(!live(c))return;c.read=through;
    const community=getState().community,f=community.friends.find(f=>f.id===c.peer);
    if(f){community.chatUnread=Math.max(0,(community.chatUnread||0)-(f.unread||0));f.unread=0;}
  }
  function fail(c,e){
    if(!live(c))return;
    if(e.status===403||e.status===401){c.blocked=true;dialog.querySelector('textarea').disabled=true;dialog.querySelector('fieldset').disabled=true;status(c,e.message);}
    else status(c,'暂时没连上，草稿还在。正在尝试重新连接…');
  }
  async function pull(c){
    if(!live(c)||c.blocked)return;if(c.pending)return c.pending;
    c.pending=(async()=>{
      try{
        const after=c.entries.at(-1)?.seq||0,r=await api('friends/chat?user_id='+encodeURIComponent(c.peer)+'&after='+after);
        if(!live(c))return;if(r.entries.length){merge(c,r.entries);paint(c);}
        await markRead(c);status(c,'只和好友聊天 · 消息会自动刷新');
      }catch(e){fail(c,e);throw e;}
    })();
    try{await c.pending;}finally{c.pending=null;}
  }
  async function open(peer){
    const user=syncAccount(),ticket=++opening;
    const r=await api('friends/chat?user_id='+encodeURIComponent(peer));
    if(ticket!==opening||getState()?.user.id!==user)return;
    const c=current={account:user,peer,name:r.friend.name,entries:r.entries,before:r.before,read:0,blocked:false,pending:null};
    openDialog(esc(c.name),`<section class="friend-chat"><p class="chat-status" role="status">只和好友聊天 · 消息会自动刷新</p><button class="text-btn chat-older" data-action="chat-older" ${c.before?'':'hidden'}>查看更早的消息</button><div class="chat-history" role="log" aria-label="与 ${esc(c.name)} 的聊天记录" tabindex="0"></div><form id="friend-chat-form" data-user-id="${esc(peer)}"><fieldset><label class="sr-only" for="chat-message">给好友的消息</label><textarea id="chat-message" name="body" maxlength="2000" rows="2" required placeholder="说点什么吧…">${esc(drafts.get(peer)||'')}</textarea><div class="chat-compose-bottom"><small>最多 2000 字 · 换行请按回车</small><button class="btn sm" type="submit">发送</button></div></fieldset><div class="error-text" role="alert"></div></form></section>`);
    dialog.classList.add('chat-dialog');
    dialog.querySelector('textarea').addEventListener('input',e=>{if(live(c))drafts.set(peer,e.target.value);});
    paint(c);dialog.querySelector('.chat-history').scrollTop=dialog.querySelector('.chat-history').scrollHeight;
    try{await markRead(c);}catch(e){fail(c,e);}
  }
  async function send(form,data,key){
    const c=current;if(!live(c)||c.peer!==form.dataset.userId||c.blocked)throw new Error('先重新打开好友聊天吧');
    if(!data.body?.trim())throw new Error('写点内容再发送吧');
    try{await api('friends/message',{user_id:c.peer,body:data.body},{key});}catch(e){if(e.status===403)fail(c,e);throw e;}
    if(!live(c))return;
    // Advance the cursor only through fetched pages, never through a send response:
    // incoming messages may have arrived between the previous poll and this send.
    const input=form.querySelector('textarea');if(input.value===data.body){input.value='';drafts.delete(c.peer);}
    delete form.dataset.key;delete form.dataset.body;
    if(c.pending)await c.pending.catch(()=>{});
    await pull(c).catch(()=>{});
  }
  async function older(){
    const c=current;if(!live(c)||!c.before||c.blocked)return;
    try{const r=await api('friends/chat?user_id='+encodeURIComponent(c.peer)+'&before='+c.before);if(!live(c))return;c.before=r.before;merge(c,r.entries);paint(c,true);}catch(e){fail(c,e);throw e;}
  }
  async function poll(){syncAccount();await pull(current);}
  dialog.addEventListener('close',()=>{dialog.classList.remove('chat-dialog');current=null;opening++;});
  return {open,send,older,poll};
}
