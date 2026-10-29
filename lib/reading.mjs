import {id,now,hash,integer,string,requireThat} from './store.mjs';
import {COIN} from './common.mjs';
import {BOOK_LIMITS,cleanBookText} from '../public/book-text.js';

export const READING_DEFAULTS={enabled:true,finish:100,note:5,noteLimit:5};
export class Reading {
  constructor(store){this.s=store;}
  rules(space){const value={...READING_DEFAULTS,...JSON.parse(this.s.get('SELECT value FROM reading_rules WHERE space_id=?',this.s.rewardSpaceId(space))?.value||'{}')};return {...value,version:hash(JSON.stringify(value))};}
  canConfigure(user,space){const r=this.s.get('SELECT * FROM spaces WHERE id=?',space);return this.s.canManage(user,space)||r?.learner_id===user.id&&!r.giver_id&&!r.family_id&&r.status==='active';}
  saveRules(user,body){
    const space=this.s.viewSpace(user,body.space_id);requireThat(this.canConfigure(user,space),'阅读奖励由发奖人或奖品管家来安排哦',403);
    const old=this.rules(space);requireThat(body.version===old.version,'规则刚有变化，请刷新后再保存',409);requireThat(typeof body.enabled==='boolean','请选择是否开启奖励');
    const value={enabled:body.enabled,finish:integer(body.finish,0,10000,'读完奖励'),note:integer(body.note,0,100,'笔记奖励'),noteLimit:integer(body.noteLimit,0,20,'每本奖励笔记数')};
    this.s.run('INSERT INTO reading_rules VALUES(?,?) ON CONFLICT(space_id) DO UPDATE SET value=excluded.value',this.s.rewardSpaceId(space),JSON.stringify(value));
    this.s.community.audit(user,space,'reading.rules','调整阅读奖励',{before:old,after:value});return {ok:true};
  }
  book(user,bookId,{content=false}={}){const b=this.s.get('SELECT * FROM reading_books WHERE id=?',String(bookId||''));requireThat(b&&(!content||b.owner_id===user.id),'这本书没有向你开放',403);return b;}
  entry(user,body,{write=false}={}){const space=write?this.s.ownSpace(user,body):this.s.viewSpace(user,body.space_id),b=this.book(user,body.book_id),p=this.s.get('SELECT * FROM reading_progress WHERE space_id=? AND book_id=?',space,b.id);requireThat(p,'先把书加入这间小屋的书架吧',404);if(write)requireThat(b.owner_id===user.id,'只能记录自己的阅读',403);return {space,b,p};}
  list(user,query){
    const space=this.s.viewSpace(user,query.space_id),r=this.s.get('SELECT learner_id FROM spaces WHERE id=?',space);
    const books=this.s.all(`SELECT b.id,b.title,b.author,b.chapter_count,b.characters,b.source_url,b.source_name,p.position,p.read_chapters,p.finished,p.finish_coins,p.review,p.updated,
      (SELECT COUNT(*) FROM reading_notes n WHERE n.space_id=p.space_id AND n.book_id=b.id) notes,
      (SELECT COALESCE(SUM(coins),0) FROM reading_notes n WHERE n.space_id=p.space_id AND n.book_id=b.id) note_coins
      FROM reading_progress p JOIN reading_books b ON b.id=p.book_id WHERE p.space_id=? ORDER BY p.updated DESC LIMIT 100`,space).map(b=>({...b,readCount:JSON.parse(b.read_chapters).length,read_chapters:undefined}));
    return {books,rules:this.rules(space),canConfigure:this.canConfigure(user,space),isSelf:r.learner_id===user.id};
  }
  import(user,body,source={}){
    const space=this.s.ownSpace(user,body),raw=body.book;requireThat(raw&&typeof raw==='object','先选择一本书吧');
    const title=string(raw.title,'书名',160),author=typeof raw.author==='string'?raw.author.trim().slice(0,160):'';
    requireThat(Array.isArray(raw.chapters)&&raw.chapters.length>0&&raw.chapters.length<=BOOK_LIMITS.chapters,'一本书需要 1–500 个阅读小节');
    const chapters=raw.chapters.map(c=>{requireThat(c&&typeof c.text==='string'&&c.text.length<=BOOK_LIMITS.chapter,'阅读小节太长，请重新解析');const text=cleanBookText(c.text);requireThat(text.length>0,'正文中有空白小节');return {title:string(c.title||'正文','章节名',120),text};});
    const bytes=Buffer.byteLength(JSON.stringify(chapters));requireThat(bytes<=BOOK_LIMITS.bytes,'正文超过 2 MB，请拆分后导入');
    const combined=chapters.filter(c=>!(source.url&&c.title==='来源与许可')).map(c=>c.text).join('\n');
    // Gutenberg's license must remain readable, but must not count as reading content.
    const start=/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(combined),end=/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.exec(combined);
    const canonical=(start&&end&&end.index>start.index?combined.slice(start.index+start[0].length,end.index):combined).replace(/\s+/g,''),fingerprint=hash(canonical),characters=canonical.length;
    let b=this.s.get('SELECT * FROM reading_books WHERE owner_id=? AND (fingerprint=? OR (?<>\'\' AND source_url=?))',user.id,fingerprint,source.url||'',source.url||'');
    if(!b){
      const quota=this.s.get('SELECT COUNT(*) count,COALESCE(SUM(bytes),0) bytes FROM reading_books WHERE owner_id=?',user.id);requireThat(quota.count<50&&quota.bytes+bytes<=30*1024*1024,'个人书架已到 50 本或 30 MB 上限，请联系网站维护者');
      b={id:id()};this.s.run('INSERT INTO reading_books VALUES(?,?,?,?,?,?,?,?,?,?,?)',b.id,user.id,fingerprint,title,author,chapters.length,characters,bytes,source.url||'',source.name||'自己导入',now());
      chapters.forEach((c,i)=>this.s.run('INSERT INTO reading_chapters VALUES(?,?,?,?)',b.id,i,c.title,c.text));
    }
    const existed=this.s.get('SELECT book_id FROM reading_progress WHERE space_id=? AND book_id=?',space,b.id);
    this.s.run("INSERT OR IGNORE INTO reading_progress VALUES(?,?,0,'[]',NULL,0,'',?)",space,b.id,now());
    if(!existed)this.s.community.audit(user,space,'reading.start','把书放上书架 · '+title,{book_id:b.id,source:source.name||'自己导入'});
    return {ok:true,book_id:b.id,existing:!!existed};
  }
  detail(user,query){
    const {space,b,p}=this.entry(user,query),self=b.owner_id===user.id;
    const chapters=this.s.all('SELECT ordinal,title FROM reading_chapters WHERE book_id=? ORDER BY ordinal',b.id),position=query.chapter===undefined?p.position:integer(Number(query.chapter),0,b.chapter_count-1,'阅读位置');
    return {book:{id:b.id,title:b.title,author:b.author,characters:b.characters,source_url:b.source_url,source_name:b.source_name},chapters,position,readChapters:JSON.parse(p.read_chapters),finished:p.finished,finishCoins:p.finish_coins,review:p.review,rules:this.rules(space),content:self?this.s.get('SELECT text FROM reading_chapters WHERE book_id=? AND ordinal=?',b.id,position).text:null,notes:this.s.all('SELECT id,chapter,text,coins,created FROM reading_notes WHERE book_id=? AND space_id=? ORDER BY created DESC LIMIT 100',b.id,space)};
  }
  position(user,body){
    const {space,b,p}=this.entry(user,body,{write:true}),position=integer(body.chapter,0,b.chapter_count-1,'阅读位置'),read=JSON.parse(p.read_chapters);
    if(body.done===true&&!read.includes(position))read.push(position);
    this.s.run('UPDATE reading_progress SET position=?,read_chapters=?,updated=? WHERE space_id=? AND book_id=?',position,JSON.stringify(read.sort((a,b)=>a-b)),now(),space,b.id);
    if(body.done===true&&!JSON.parse(p.read_chapters).includes(position))this.s.community.audit(user,space,'reading.chapter','读完一个小节 · '+b.title,{book_id:b.id,chapter:position+1});
    return {ok:true};
  }
  award(user,space,book,coins,kind,ref){
    if(coins)this.s.post(space,coins*COIN,kind,(kind==='reading_finish'?'读完一本书':'记录阅读笔记')+' · '+book.title,ref);
    this.s.community.audit(user,space,kind,(kind==='reading_finish'?'读完':'写下阅读笔记')+' · '+book.title,{book_id:book.id,coins});
    this.s.progress.sync(space);
  }
  note(user,body){
    const {space,b}=this.entry(user,body,{write:true}),text=string(body.text,'阅读笔记',2000),chapter=integer(body.chapter,0,b.chapter_count-1,'章节');
    requireThat(text.replace(/\s+/g,'').length>=20,'再写一点自己的想法吧，至少 20 个字');
    const fingerprint=hash(text.replace(/\s+/g,''));requireThat(!this.s.get('SELECT id FROM reading_notes WHERE space_id=? AND fingerprint=?',space,fingerprint),'这条笔记已经记过啦，换一个新的发现吧',409);
    const count=this.s.get('SELECT COUNT(*) n FROM reading_notes WHERE space_id=? AND book_id=?',space,b.id).n;requireThat(count<100,'这本书已记下 100 条笔记啦');
    const rules=this.rules(space);requireThat(rules.version===body.version,'阅读奖励刚调整过，请重新打开后再提交',409);
    const coins=rules.enabled&&b.characters>=1000&&count<rules.noteLimit?rules.note:0,noteId=id();
    this.s.run('INSERT INTO reading_notes VALUES(?,?,?,?,?,?,?,?)',noteId,space,b.id,chapter,text,fingerprint,coins,now());this.award(user,space,b,coins,'reading_note',noteId);return {ok:true,coins};
  }
  finish(user,body){
    const {space,b,p}=this.entry(user,body,{write:true});requireThat(!p.finished,'这本书已经领取过读完奖励啦',409);requireThat(JSON.parse(p.read_chapters).length===b.chapter_count,'读完每个小节后，再来收下整本奖励吧');
    const review=string(body.review,'读后小结',2000);requireThat(review.replace(/\s+/g,'').length>=40,'写下至少 40 个字的小结，留住这本书的收获吧');
    const rules=this.rules(space);requireThat(body.version===rules.version,'奖励刚调整过，请重新打开后再提交',409);
    const coins=rules.enabled&&b.characters>=1000?rules.finish:0;
    this.s.run('UPDATE reading_progress SET finished=?,finish_coins=?,review=?,updated=? WHERE space_id=? AND book_id=?',now(),coins,review,now(),space,b.id);this.award(user,space,b,coins,'reading_finish',b.id);return {ok:true,coins};
  }
}
