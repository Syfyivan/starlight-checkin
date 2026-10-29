import {BookSource} from './lib/book-source.mjs';
import {exportPlans,importPlans} from './lib/plan-transfer.mjs';
import {plansMarkdown} from './public/plan-transfer.js';
import http from 'node:http';
import {readFileSync,existsSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {Store,Fault,requireThat,passwordHash,passwordMatches,hash} from './lib/store.mjs';
import {Identity} from './lib/identity.mjs';
import {PET_FORMS} from './lib/pets.mjs';
import {Encouragement} from './lib/encouragement.mjs';
const root=dirname(fileURLToPath(import.meta.url));
export async function createApp(options={}) {
  const demo=options.demo??process.argv.includes('--demo'),publicOrigin=options.origin??process.env.PUBLIC_ORIGIN??'';
  requireThat(!demo||!publicOrigin,'示例空间仅允许在本机预览');
  const dbPath=options.dbPath||process.env.DB_PATH||resolve(root,'data',demo?'demo-v2.sqlite':'starlight.sqlite');
  const store=new Store(dbPath),basePath=process.env.BASE_PATH||'/';
  const webVersion=JSON.parse(readFileSync(resolve(root,'package.json'),'utf8')).version;
  const apkFile=resolve(root,'public/downloads/starlight.apk'),metadataFile=resolve(root,'public/downloads/starlight.json');
  const metadata=existsSync(metadataFile)?JSON.parse(readFileSync(metadataFile,'utf8')):null;
  const apk=existsSync(apkFile)&&metadata?{version:metadata.version,versionCode:metadata.versionCode,sha256:metadata.sha256,bytes:metadata.bytes,url:basePath+'downloads/starlight.apk'}:null;
  if(apk)requireThat(/^\d{1,6}\.\d{1,6}\.\d{1,6}$/.test(apk.version)&&Number.isSafeInteger(apk.versionCode)&&apk.versionCode>0&&/^[a-f0-9]{64}$/.test(apk.sha256)&&Number.isSafeInteger(apk.bytes)&&apk.bytes>0,'Android release metadata is invalid');
  const encouragement=new Encouragement({fetcher:options.quoteFetcher});
  const identity=new Identity(store,{origin:publicOrigin,basePath,config:options.identityConfig,fetcher:options.fetcher,mailer:options.mailer});
  requireThat(/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(basePath),'BASE_PATH 必须以 / 开始和结尾');
  if(demo)await store.seedDemo();
  const bookSource=new BookSource(store,{fetcher:options.bookFetcher,sourceCacheDir:options.bookSourceCacheDir??process.env.BOOK_SOURCE_CACHE_DIR});
  const limits=new Map();
  function limit(key,max=30){const t=Date.now(),old=limits.get(key);if(!old||t-old.start>900_000){if(limits.size>5000)limits.delete(limits.keys().next().value);limits.set(key,{start:t,n:1});return;}requireThat(++old.n<=max,'操作太频繁，请稍后再试',429);}
  const cookie=(token,clear=false)=>`starlight_session=${clear?'':token}; HttpOnly; SameSite=Strict; Path=${basePath}; Max-Age=${clear?0:14*86400}${publicOrigin.startsWith('https://')?'; Secure':''}`;
  const oauthCookie=(token='')=>`starlight_oauth=${token}; HttpOnly; SameSite=Lax; Path=${basePath}; Max-Age=${token?600:0}${publicOrigin.startsWith('https://')?'; Secure':''}`;
  async function handler(req,res) {
    const headers={'X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Permissions-Policy':'camera=(), microphone=(), geolocation=()','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'",'Cache-Control':'no-store'};
    const send=(status,body,extra={})=>{res.writeHead(status,{...headers,'Content-Type':'application/json; charset=utf-8',...extra});res.end(JSON.stringify(body));};
    try {
      const url=new URL(req.url,'http://localhost'),path=url.pathname,method=req.method;
      const rawCookie=(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith('starlight_session='))?.slice(18)||'';
      const user=store.authenticate(rawCookie);
      if(path==='/healthz'){store.get('SELECT 1');return send(200,{ok:true});}
      if(path==='/api/auth/github/callback'&&method==='GET'){
        const browser=(req.headers.cookie||'').split(';').map(p=>p.trim()).find(p=>p.startsWith('starlight_oauth='))?.slice(16)||'';
        try{const r=await identity.githubCallback(url.searchParams,browser);const extra={'Set-Cookie':[oauthCookie()]};let fragment='';if(r.user){const s=store.session(r.user.id);extra['Set-Cookie'].push(cookie(s.token));}else fragment='#github-bind='+r.pending;res.writeHead(303,{...headers,...extra,Location:basePath+fragment});res.end();}
        catch(e){res.writeHead(303,{...headers,'Set-Cookie':oauthCookie(),Location:basePath+'#auth-error='+encodeURIComponent(e instanceof Fault?e.message:'GitHub 暂时连接失败，请稍后重试')});res.end();}return;
      }
      if(!path.startsWith('/api/')) {
        requireThat(method==='GET'||method==='HEAD','不支持的请求方式',405);
        if(path==='/manifest.webmanifest')return send(200,{id:basePath,name:'小小成就 · 心愿花园',short_name:'小小成就',lang:'zh-CN',start_url:basePath,scope:basePath,display:'standalone',background_color:'#f6f7f2',theme_color:'#284e3b',icons:[{src:basePath+'icon-192.png',sizes:'192x192',type:'image/png',purpose:'any'},{src:basePath+'icon-512.png',sizes:'512x512',type:'image/png',purpose:'any maskable'}]},{'Content-Type':'application/manifest+json; charset=utf-8'});
        const petFiles=Object.fromEntries(PET_FORMS.flatMap(f=>['young.png','winged.png','young-idle-animated.png','winged-idle-animated.png',...(f.id==='nuonuo-seal'?['moon.png','star.png']:[])].map(name=>['/pets/'+f.id+'/'+name,['pets/'+f.id+'/'+name,'image/png']])));
        const extraFiles=Object.fromEntries(['credit.js','rewards-explore.js','timeline.js','reading.js','book-text.js','ebook-worker.js','vendor/ebook-parser.js','vendor/book-display.js','travel-notes.js','travel-art.js','travel-journal.js','plan-transfer.js','family-play.js','chat.js','pet-care.js','pet-growth.js','illustrations.js','pet-catalog.js','travel-view.js','task-types.js','startup.js','compat.js','celebration-content.js','celebration-art.js','progress.js','merge.js','celebrations.js','vendor/canvas-confetti-1.9.4.js'].map(f=>['/'+f,[f,'text/javascript; charset=utf-8']]));extraFiles['/vendor/EBOOK-LICENSES.txt']=['vendor/EBOOK-LICENSES.txt','text/plain; charset=utf-8'];extraFiles['/vendor/OPENCC-LICENSES.txt']=['vendor/OPENCC-LICENSES.txt','text/plain; charset=utf-8'];extraFiles['/timeline.css']=['timeline.css','text/css; charset=utf-8'];extraFiles['/reading.css']=['reading.css','text/css; charset=utf-8'];extraFiles['/chat.css']=['chat.css','text/css; charset=utf-8'];extraFiles['/celebrations.css']=['celebrations.css','text/css; charset=utf-8'];extraFiles['/pet-care.css']=['pet-care.css','text/css; charset=utf-8'];extraFiles['/pet-studio.css']=['pet-studio.css','text/css; charset=utf-8'];extraFiles['/progress.css']=['progress.css','text/css; charset=utf-8'];
        const files={...extraFiles,...petFiles,...{'/':['index.html','text/html; charset=utf-8'],'/index.html':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/lottery.js':['lottery.js','text/javascript; charset=utf-8'],'/pets.js':['pets.js','text/javascript; charset=utf-8'],'/updates.js':['updates.js','text/javascript; charset=utf-8'],'/plans.js':['plans.js','text/javascript; charset=utf-8'],'/rooms.js':['rooms.js','text/javascript; charset=utf-8'],'/invitations.js':['invitations.js','text/javascript; charset=utf-8'],'/community.js':['community.js','text/javascript; charset=utf-8'],'/sw.js':['sw.js','text/javascript; charset=utf-8'],'/offline.html':['offline.html','text/html; charset=utf-8'],'/icon-192.png':['icon-192.png','image/png'],'/icon-512.png':['icon-512.png','image/png'],'/mobile.css':['mobile.css','text/css; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8'],'/favicon.svg':['favicon.svg','image/svg+xml']}};
        files['/downloads/starlight.apk']=['downloads/starlight.apk','application/vnd.android.package-archive'];
        files['/downloads/starlight.apk.sha256']=['downloads/starlight.apk.sha256','text/plain; charset=utf-8'];
        const file=files[path];requireThat(file&&existsSync(resolve(root,'public',file[0])),'页面不存在',404);res.writeHead(200,{...headers,'Content-Type':file[1],...(path.endsWith('.apk')?{'Content-Disposition':'attachment; filename="starlight-'+(apk?.version||webVersion)+'.apk"'}:{})});res.end(method==='HEAD'?undefined:readFileSync(resolve(root,'public',file[0])));return;
      }
      if(path==='/api/status'&&method==='GET')return send(200,{setup:false,tokenRequired:false,registrationOpen:true,webVersion,apk,apkAvailable:existsSync(resolve(root,'public/downloads/starlight.apk')),demo,loggedIn:!!user,...identity.capabilities()});
      let body={};
      if(method==='POST'){
        const origin=publicOrigin||`http://${req.headers.host}`;
        requireThat(req.headers.origin===origin,'请求来源校验失败，请从网站页面操作',403);
        requireThat((req.headers['content-type']||'').startsWith('application/json'),'请使用 JSON 请求',415);
        if(path==='/api/reading/import')requireThat(user,'请先登录',401);
        let size=0,chunks=[];for await(const chunk of req){size+=chunk.length;requireThat(size<=(path==='/api/reading/import'?3*1024*1024:path==='/api/redeem'?4.3*1024*1024:256*1024),'上传内容太大',413);chunks.push(chunk);}
        try{body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new Fault('无法读取提交内容');}requireThat(body&&typeof body==='object'&&!Array.isArray(body),'提交内容无效');
      }
      const remote=process.env.TRUST_PROXY==='1'?(req.headers['x-forwarded-for']||req.socket.remoteAddress):req.socket.remoteAddress;
      if(method==='POST'&&path==='/api/auth/github/start'){limit(`github:${remote}`,15);if(user)requireThat(req.headers['x-csrf-token']===user.csrf,'请刷新页面后重试',403);const r=identity.beginGithub(user,body,rawCookie);return send(200,{ok:true,url:r.url},{'Set-Cookie':oauthCookie(r.browser)});}
      if(method==='POST'&&path==='/api/email/start'){limit(`mail:${remote}`,8);if(user)requireThat(req.headers['x-csrf-token']===user.csrf,'请刷新页面后重试',403);return send(200,await identity.sendEmail(user,body));}
      if(method==='POST'&&path==='/api/invite/preview'){limit(`invite:${remote}`,30);return send(200,identity.previewInvite(user,body.code));}
      if(method==='POST'&&path==='/api/setup')throw new Fault('已取消网站初始化口令，请直接注册个人账号',410);
      if(method==='POST'&&['/api/login','/api/register','/api/demo'].includes(path)){
        limit(`auth:${remote}`);
        let account;
        if(path==='/api/demo'){requireThat(demo,'没有开启示例模式',404);const username=body.username||'demo';requireThat(['demo','seedling','sunshine'].includes(username),'示例角色不存在');account=store.get('SELECT * FROM users WHERE username=?',username);requireThat(account,'示例角色不存在',404);}
        if(path==='/api/login'){
          const username=typeof body.username==='string'?body.username.toLowerCase().trim():'';limit(`name:${username}`,15);
          const u=store.get('SELECT * FROM users WHERE username=? OR (email=? AND email_verified=1)',username,username);
          const valid=await passwordMatches(body.password,u?.password||'00000000000000000000000000000000:'+ '00'.repeat(64));requireThat(u&&valid&&u.enabled,'账号或密码不正确，或账号已停用',401);account=u;
        }
        if(path==='/api/register'){
          requireThat(body.code===undefined||typeof body.code==='string','邀请码格式不正确');
          const code=body.code?.trim()||'';
          if(code)identity.inviteValid(code);
          const password=await passwordHash(body.password);
          const verified=body.email?identity.verifyEmail(null,body,'register'):null;
          account=store.tx(()=>{const u=store.newUser({username:body.username,name:body.name,password,role:'member'});if(code)u.joinedSpace=store.acceptInvite(u,code).space_id;if(verified){store.run('UPDATE users SET email=?,email_verified=1 WHERE id=?',verified.email,u.id);store.run('DELETE FROM email_challenges WHERE id=?',verified.challenge);}return u;});
        }
        const session=store.session(account.id);return send(200,{ok:true,space_id:account.joinedSpace},{'Set-Cookie':cookie(session.token)});
      }
      requireThat(user,'请先登录',401);
      if(method==='GET') {
        if(path==='/api/celebration/quote'){limit(`quote:${user.id}`,40);return send(200,await encouragement.get());}
        const query=Object.fromEntries(url.searchParams),community=store.community;
        if(path==='/api/tasks/timeline')return send(200,store.progress.timeline(user,query));
        if(path==='/api/reading/library')return send(200,store.reading.list(user,query));
        if(path==='/api/reading/book')return send(200,store.reading.detail(user,query));
        if(path==='/api/reading/search'){limit('booksearch:'+user.id,80);return send(200,await bookSource.searchAll(query.q));}
        if(path==='/api/pets/postcard')return send(200,store.travel.readPostcard(user,query));
        if(path==='/api/friends/chat')return send(200,store.friends.messages(user,query));
        if(path==='/api/friends/threads')return send(200,{friends:store.friends.list(user)});
        if(path==='/api/friends/invite-preview')return send(200,store.friends.previewInvite(user,query));
        if(path==='/api/community/inbox')return send(200,community.inbox(user,query));
        if(path==='/api/community/logs')return send(200,community.logs(user,query));
        if(path==='/api/community/diary')return send(200,community.diary(user,query));
        if(path==='/api/community/share-preview')return send(200,community.previewShare(user,query));
        if(path==='/api/community/day-share')return send(200,community.readShare(user,query));
        if(path==='/api/state')return send(200,{...store.state(user,url.searchParams.get('space')||undefined),demo,...identity.capabilities()});
        if(path.startsWith('/api/receipts/')){const r=store.receipt(user,path.slice('/api/receipts/'.length));res.writeHead(200,{...headers,'Content-Type':r.mime,'Content-Disposition':'inline'});res.end(r.data);return;}
        if(path==='/api/market')return send(200,{enabled:false,threshold:store.settings().marketThreshold,message:'模拟市场将在后续版本开放'});
        if(path==='/api/tasks/export'){
          const doc=exportPlans(store,user,query),format=query.format||'json';requireThat(['json','md'].includes(format),'请选择 JSON 或 Markdown');
          const extra={'Content-Disposition':'attachment; filename="starlight-'+doc.scope+'-plans-'+doc.exported_on+'.'+format+'"'};
          if(format==='md'){res.writeHead(200,{...headers,...extra,'Content-Type':'text/markdown; charset=utf-8'});res.end(plansMarkdown(doc));return;}
          return send(200,doc,extra);
        }
        if(path==='/api/export'){const spaceId=store.viewSpace(user,url.searchParams.get('space')||undefined);return send(200,{exportedAt:new Date().toISOString(),space_id:spaceId,ledger:store.all('SELECT * FROM ledger WHERE space_id=? ORDER BY seq',spaceId),ticketLedger:store.all('SELECT * FROM ticket_ledger WHERE space_id=? ORDER BY seq',spaceId)},{'Content-Disposition':'attachment; filename="starlight-ledger.json"'});}
      }
      requireThat(method==='POST','接口不存在',404);requireThat(req.headers['x-csrf-token']===user.csrf,'页面已过期，请刷新后重试',403);limit((path==='/api/friends/message'||path==='/api/friends/read'?'chatwrite:':'write:')+user.id,path==='/api/friends/message'||path==='/api/friends/read'?600:300);
      if(path==='/api/logout'){store.run('DELETE FROM sessions WHERE token=?',hash(rawCookie));return send(200,{ok:true},{'Set-Cookie':cookie('',true)});}
      if(path==='/api/password'){
        const account=store.get('SELECT * FROM users WHERE id=?',user.id);requireThat(account.password?await passwordMatches(body.oldPassword,account.password):!!account.github_id,'原密码不正确');const password=await passwordHash(body.password);
        store.tx(()=>{store.run('UPDATE users SET password=? WHERE id=?',password,user.id);store.run('DELETE FROM sessions WHERE user_id=?',user.id);});const s=store.session(user.id);return send(200,{ok:true},{'Set-Cookie':cookie(s.token)});
      }
      if(path==='/api/email/confirm'){limit(`emailconfirm:${user.id}`,15);return send(200,identity.bindEmail(user,body));}
      if(path==='/api/auth/github/confirm')return send(200,identity.confirmGithub(user,body,rawCookie));
      if(path==='/api/cards/drop-preview')return send(200,store.lottery.inspectDrop(user,body));
      if(path==='/api/share/inspect')return send(200,store.shareCard(user,body.token));
      const key=req.headers['idempotency-key'];const old=store.replay(user,key,path,body);if(old)return send(200,old);
      let operation;
      if(path==='/api/reading/import')limit('bookimport:'+user.id,15);
      if(path==='/api/reading/download'){
        store.ownSpace(user,body);limit('bookdownload:'+user.id,10);
        const result=await bookSource.download(body.source_id);
        return send(200,store.operation(user,key,path,body,()=>store.reading.import(user,{...body,book:result.book},result.source)));
      }
      const actions={'/api/wishes/goal':()=>store.setWishGoal(user,body),'/api/pets/travel/memory':()=>store.travel.remember(user,body),'/api/pets/travel/practice':()=>store.travel.practice(user,body),'/api/tasks/import':()=>importPlans(store,user,body),'/api/tasks/edit':()=>store.plans.edit(user,body),'/api/pets/evolve':()=>store.pets.evolve(user,body),'/api/tasks/timer':()=>store.progress.timer(user,body),'/api/admin/task-score':()=>store.progress.taskScore(user,body),'/api/admin/growth-rules':()=>store.progress.saveRules(user,body),'/api/mail/claim':()=>store.progress.claim(user,body),'/api/pets/travel':()=>store.travel.depart(user,body),'/api/tasks/estimate':()=>store.estimateTask(user,body),'/api/pets/use':()=>store.pets.use(user,body),'/api/pets/dress':()=>store.pets.dress(user,body),'/api/admin/lottery/defaults':()=>store.lottery.defaults(user,body),'/api/admin/lottery/copy':()=>store.lottery.copy(user,body),'/api/cards/use':()=>store.lottery.use(user,body),'/api/tasks':()=>store.createTasks(user,body),'/api/bonus/claim':()=>store.claimDailyBonus(user,body),'/api/complete':()=>store.complete(user,body),'/api/archive':()=>store.archive(user,body),'/api/buy':()=>store.buy(user,body),'/api/draw':()=>store.draw(user,body),'/api/redeem':()=>store.redeem(user,body),'/api/redeem/cancel':()=>store.cancelRedemption(user,body),'/api/share':()=>store.share(user,body),'/api/cards/rename-room':()=>store.renameRoom(user,body),'/api/cards/merge':()=>store.moveCards(user,body,'merge'),'/api/cards/convert':()=>store.moveCards(user,body,'convert'),'/api/pairs/accept':()=>store.acceptInvite(user,body.code),'/api/lesson':()=>store.lesson(user,body),'/api/admin/prize':()=>store.savePrize(user,body),'/api/admin/templates':()=>store.addTemplates(user,body),'/api/admin/prizes/remove':()=>store.removePrizes(user,body),'/api/admin/prizes/restore':()=>store.restorePrizes(user,body),'/api/admin/odds':()=>store.saveOdds(user,body),'/api/admin/settings':()=>store.saveSettings(user,body),'/api/admin/invite':()=>store.invite(user,body),'/api/admin/fulfill':()=>store.fulfill(user,body)};
      Object.assign(actions,{'/api/credit/rules':()=>store.credit.saveRules(user,body),'/api/credit/preview':()=>store.credit.preview(user,body),'/api/credit/accept':()=>store.credit.accept(user,body),'/api/credit/respond':()=>store.credit.respond(user,body),'/api/credit/cancel':()=>store.credit.cancel(user,body),'/api/credit/repay':()=>store.credit.repay(user,body),'/api/credit/waive':()=>store.credit.waive(user,body)});
      Object.assign(actions,{'/api/reading/import':()=>store.reading.import(user,body),'/api/reading/position':()=>store.reading.position(user,body),'/api/reading/note':()=>store.reading.note(user,body),'/api/reading/finish':()=>store.reading.finish(user,body),'/api/reading/rules':()=>store.reading.saveRules(user,body)});
      const community=store.community;
      Object.assign(actions,{'/api/friends/message':()=>store.friends.send(user,body),'/api/friends/read':()=>store.friends.read(user,body),'/api/friends/invite':()=>store.friends.invite(user,body)});
      Object.assign(actions,{'/api/family/mode':()=>store.familyPlay.mode(user,body),'/api/family/plans':()=>store.familyPlay.create(user,body),'/api/family/plans/archive':()=>store.familyPlay.archive(user,body),'/api/family/buy':()=>store.familyPlay.buy(user,body),'/api/admin/penalty/refund':()=>store.plans.refund(user,body),'/api/family/create':()=>community.createFamily(user,body),'/api/family/invite':()=>community.familyInvite(user,body),'/api/family/admins':()=>community.setAdmins(user,body),'/api/rooms/close':()=>community.requestClose(user,body),'/api/rooms/close/cancel':()=>community.cancelClose(user,body),'/api/friends/request':()=>community.friendRequest(user,body),'/api/friends/remove':()=>community.removeFriend(user,body),'/api/friends/view-request':()=>community.viewRequest(user,body),'/api/community/respond':()=>community.respond(user,body),'/api/community/read':()=>community.readMail(user,body),'/api/community/revoke':()=>community.revokeShare(user,body),'/api/community/diary':()=>community.saveDiary(user,body)});
      if(path==='/api/trade')throw new Fault('模拟交易暂未开放',403);
      operation=actions[path];requireThat(operation,'接口不存在',404);
      return send(200,store.operation(user,key,path,body,operation));
    }catch(error){if(!(error instanceof Fault))console.error('Request failed:',error.name,error.code||'internal');if(!res.headersSent)send(error.status||500,{error:error instanceof Fault?error.message:'服务暂时遇到问题，请稍后重试'});else res.end();}
  }
  const server=http.createServer({requestTimeout:15_000,headersTimeout:12_000,maxHeaderSize:16_384},handler);
  const maintain=()=>{try{store.tx(()=>store.progress.maintain());}catch(e){console.error('Progress maintenance failed:',e.name,e.code||'internal');}};
  server.on('listening',maintain);const maintenance=setInterval(maintain,60000);maintenance.unref();server.on('close',()=>clearInterval(maintenance));
  return {server,store,identity};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const app=await createApp();const host=process.env.HOST||'127.0.0.1',port=Number(process.env.PORT||3210);
  app.server.listen(port,host,()=>console.log(`小小成就 · http://${host}:${port}${process.argv.includes('--demo')?' · 示例空间':''}`));
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>{app.server.close(()=>{app.store.db.close();process.exit(0);});setTimeout(()=>process.exit(1),8000).unref();});
}
