import {randomBytes,randomInt,createHash} from 'node:crypto';
import {Fault,hash,requireThat,string,id,now,normalizeInviteCode} from './store.mjs';

export function emailAddress(value){const email=string(value,'邮箱',254).toLowerCase();requireThat(/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(email)&&!email.includes('..'),'请填写有效邮箱地址');return email;}
export class Identity {
  constructor(store,{origin,basePath,config={},fetcher=fetch,mailer}={}){
    this.store=store;this.origin=origin;this.basePath=basePath;this.fetcher=fetcher;
    this.clientId=config.githubClientId??process.env.GITHUB_CLIENT_ID;this.clientSecret=config.githubClientSecret??process.env.GITHUB_CLIENT_SECRET;
    this.mailKey=config.mailKey??process.env.RESEND_API_KEY;this.mailFrom=config.mailFrom??process.env.MAIL_FROM;this.mailer=mailer;
    store.db.exec(`CREATE TABLE IF NOT EXISTS identity_pending (token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),session_hash TEXT NOT NULL,github_id TEXT NOT NULL,github_login TEXT NOT NULL,expires INTEGER NOT NULL);`);
    if(!store.all('PRAGMA table_info(oauth_flows)').some(c=>c.name==='session_hash'))store.db.exec('ALTER TABLE oauth_flows ADD COLUMN session_hash TEXT');
  }
  capabilities(){return {githubEnabled:!!(this.clientId&&this.clientSecret&&this.origin),emailEnabled:!!(this.mailer||(this.mailKey&&this.mailFrom))};}
  inviteValid(code){const invite=this.store.get('SELECT * FROM invites WHERE hash=?',hash(normalizeInviteCode(code)));requireThat(invite&&invite.creator_id&&invite.remaining>0&&invite.expires>Date.now(),'邀请码无效、已用完或已过期');return invite;}
  previewInvite(user,code){
    const invite=this.store.get('SELECT * FROM invites WHERE hash=?',hash(normalizeInviteCode(code)));requireThat(invite?.creator_id,'这张请柬没有找到，请朋友重新分享一次');
    if(invite.family_id)return this.store.community.previewFamily(user,invite);
    const creator=this.store.get('SELECT name,username FROM users WHERE id=? AND enabled=1',invite.creator_id);requireThat(creator,'这位伙伴的账号暂时不可用');requireThat(invite.creator_id!==user?.id,'这是你发出的邀请，发给朋友使用吧');
    // Reopening an old link may lead only to the caller's own existing room.
    const learner=invite.direction==='manager'?invite.creator_id:user?.id,giver=invite.direction==='manager'?user?.id:invite.creator_id;
    const existing=user?this.store.get("SELECT id FROM spaces WHERE learner_id=? AND giver_id=? AND status='active'",learner,giver):null;
    if(!existing)this.inviteValid(code);
    return {...creator,direction:invite.direction,...(existing?{existingSpace:existing.id}:{})};
  }
  async sendEmail(user,body){
    requireThat(this.capabilities().emailEnabled,'邮箱验证暂未启用，请先使用账号密码登录',503);
    const email=emailAddress(body.email),purpose=user?'bind':'register';if(!user&&body.code)this.inviteValid(body.code);
    requireThat(!this.store.get('SELECT id FROM users WHERE email=?',email),'这个邮箱已经绑定账号',409);
    requireThat(!this.store.get('SELECT id FROM email_challenges WHERE email=? AND created>?',email,new Date(Date.now()-60_000).toISOString()),'请 60 秒后再发送');
    const challenge=id(),code=String(randomInt(100000,1000000));this.store.run('DELETE FROM email_challenges WHERE email=? AND purpose=?',email,purpose);
    this.store.run('INSERT INTO email_challenges(id,user_id,email,purpose,code_hash,expires,created) VALUES(?,?,?,?,?,?,?)',challenge,user?.id||null,email,purpose,hash(challenge+':'+code),Date.now()+10*60_000,now());
    try {
      const message={from:this.mailFrom,to:[email],subject:'小小成就 · 邮箱验证码',text:`你的邮箱验证码是 ${code}，10 分钟内有效。只在你打开的小小成就网页输入。若非本人操作，请忽略。`};
      if(this.mailer)await this.mailer(message);else {const r=await this.fetcher('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${this.mailKey}`,'Content-Type':'application/json','Idempotency-Key':challenge},body:JSON.stringify(message),signal:AbortSignal.timeout(12_000)});requireThat(r.ok,'邮件发送失败，请稍后再试',503);}
    }catch{this.store.run('DELETE FROM email_challenges WHERE id=?',challenge);throw new Fault('邮件发送失败，请稍后再试',503);}
    return {ok:true,challenge,expiresIn:600};
  }
  verifyEmail(user,body,purpose='bind'){
    const email=emailAddress(body.email),r=this.store.get('SELECT * FROM email_challenges WHERE id=?',String(body.challenge||''));
    requireThat(r&&r.email===email&&r.purpose===purpose&&r.user_id===(user?.id||null)&&r.expires>Date.now()&&r.attempts<5,'验证码已失效，请重新发送');
    this.store.run('UPDATE email_challenges SET attempts=attempts+1 WHERE id=?',r.id);
    requireThat(typeof body.email_code==='string'&&hash(r.id+':'+body.email_code)===r.code_hash,'验证码不正确');
    requireThat(!this.store.get('SELECT id FROM users WHERE email=? AND id<>?',email,user?.id||''),'这个邮箱已经绑定账号',409);
    return {email,challenge:r.id};
  }
  bindEmail(user,body){const verified=this.verifyEmail(user,body);return this.store.tx(()=>{this.store.run('UPDATE users SET email=?,email_verified=1 WHERE id=?',verified.email,user.id);this.store.run('DELETE FROM email_challenges WHERE id=?',verified.challenge);return {ok:true};});}
  beginGithub(user,body,sessionToken){
    requireThat(this.capabilities().githubEnabled,'GitHub 登录暂未启用',503);
    const state=randomBytes(32).toString('hex'),browser=randomBytes(32).toString('hex'),verifier=randomBytes(32).toString('base64url');
    const inviteHash=!user&&body.code?this.inviteValid(body.code).hash:null;
    this.store.run('DELETE FROM oauth_flows WHERE expires<?',Date.now());
    this.store.run('INSERT INTO oauth_flows(state_hash,browser_hash,verifier,user_id,invite_hash,expires,session_hash) VALUES(?,?,?,?,?,?,?)',hash(state),hash(browser),verifier,user?.id||null,inviteHash,Date.now()+600_000,user?hash(sessionToken):null);
    const target=new URL('https://github.com/login/oauth/authorize');target.search=new URLSearchParams({client_id:this.clientId,redirect_uri:this.callbackUrl(),scope:'read:user',state,code_challenge:createHash('sha256').update(verifier).digest('base64url'),code_challenge_method:'S256'}).toString();
    return {url:target.href,browser};
  }
  callbackUrl(){return `${this.origin}${this.basePath}api/auth/github/callback`;}
  async githubCallback(query,browser){
    requireThat(this.capabilities().githubEnabled,'GitHub 登录暂未启用',503);
    const state=query.get('state');requireThat(typeof state==='string'&&/^[a-f0-9]{64}$/.test(state),'GitHub 登录流程已失效');
    const flow=this.store.get('SELECT * FROM oauth_flows WHERE state_hash=?',hash(state));
    requireThat(flow&&flow.expires>Date.now()&&typeof browser==='string'&&hash(browser)===flow.browser_hash,'GitHub 登录流程已失效，请重新发起');
    this.store.run('DELETE FROM oauth_flows WHERE state_hash=?',hash(state));requireThat(!query.get('error')&&query.get('code'),'GitHub 授权没有完成');
    const r=await this.fetcher('https://github.com/login/oauth/access_token',{method:'POST',headers:{Accept:'application/json','Content-Type':'application/json'},body:JSON.stringify({client_id:this.clientId,client_secret:this.clientSecret,code:query.get('code'),redirect_uri:this.callbackUrl(),code_verifier:flow.verifier}),signal:AbortSignal.timeout(15_000)});
    const token=await r.json();requireThat(r.ok&&token.access_token,'GitHub 授权兑换失败，请重试',502);
    const profileResponse=await this.fetcher('https://api.github.com/user',{headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/vnd.github+json','User-Agent':'starlight-checkin','X-GitHub-Api-Version':'2022-11-28'},signal:AbortSignal.timeout(15_000)}),profile=await profileResponse.json();
    requireThat(profileResponse.ok&&Number.isSafeInteger(profile.id)&&typeof profile.login==='string','无法读取 GitHub 身份',502);const subject=String(profile.id);
    const existing=this.store.get('SELECT * FROM users WHERE github_id=?',subject);
    if(flow.user_id){
      requireThat(!existing||existing.id===flow.user_id,'这个 GitHub 已绑定其他账号',409);
      const session=this.store.get('SELECT user_id FROM sessions WHERE token=? AND expires>?',flow.session_hash,Date.now());requireThat(session?.user_id===flow.user_id,'原登录会话已失效，请重新登录后绑定');
      const pending=randomBytes(32).toString('hex');this.store.run('DELETE FROM identity_pending WHERE expires<?',Date.now());this.store.run('INSERT INTO identity_pending VALUES(?,?,?,?,?,?)',hash(pending),flow.user_id,flow.session_hash,subject,profile.login,Date.now()+600_000);return {pending};
    }
    if(existing){requireThat(existing.enabled,'这个账号已停用',403);return {user:existing};}
    const user=this.store.tx(()=>{const invite=flow.invite_hash?this.store.get('SELECT * FROM invites WHERE hash=?',flow.invite_hash):null;if(flow.invite_hash)requireThat(invite&&invite.remaining>0&&invite.expires>Date.now(),'邀请码已失效');const u=this.store.newUser({username:`gh_${randomBytes(10).toString("hex")}`,name:String(profile.name||profile.login).slice(0,24),password:''});this.store.run('UPDATE users SET github_id=?,github_login=? WHERE id=?',subject,profile.login,u.id);if(invite?.family_id)this.store.community.joinFamily(u,invite);else if(invite){const learner=invite.direction==='manager'?invite.creator_id:u.id,manager=invite.direction==='manager'?u.id:invite.creator_id;this.store.pair(learner,manager,invite.creator_id);this.store.run('UPDATE invites SET remaining=remaining-1 WHERE hash=?',invite.hash);}return u;});return {user};
  }
  confirmGithub(user,body,sessionToken){const p=this.store.get('SELECT * FROM identity_pending WHERE token_hash=?',hash(String(body.pending||'')));requireThat(p&&p.user_id===user.id&&p.session_hash===hash(sessionToken)&&p.expires>Date.now(),'绑定确认已失效，或当前账号发生变化',403);requireThat(!this.store.get('SELECT id FROM users WHERE github_id=? AND id<>?',p.github_id,user.id),'这个 GitHub 已绑定其他账号',409);return this.store.tx(()=>{this.store.run('UPDATE users SET github_id=?,github_login=? WHERE id=?',p.github_id,p.github_login,user.id);this.store.run('DELETE FROM identity_pending WHERE token_hash=?',p.token_hash);return {ok:true};});}
}
