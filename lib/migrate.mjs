import {randomUUID} from 'node:crypto';
import {TEMPLATES} from './rewards.mjs';

// Additive, transactional migration: the v1 account, ledger and card IDs survive.
function migrateLegacy(db) {
  const version=Number(db.prepare('PRAGMA user_version').get().user_version);
  if(version>=3)return;
  if(version===2){db.exec("BEGIN IMMEDIATE; ALTER TABLE cards ADD COLUMN redemption_version INTEGER NOT NULL DEFAULT 0; CREATE TABLE IF NOT EXISTS pair_transfers (id TEXT PRIMARY KEY,learner_id TEXT NOT NULL,manager_id TEXT NOT NULL,cards TEXT NOT NULL,face_cents INTEGER NOT NULL,created TEXT NOT NULL); PRAGMA user_version=3; COMMIT");return;}
  db.exec('BEGIN IMMEDIATE');
  try {
    const add=(table,definition)=>{const name=definition.split(' ')[0];if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===name))db.exec(`ALTER TABLE ${table} ADD COLUMN ${definition}`);};
    add('users','email TEXT');add('users','email_verified INTEGER NOT NULL DEFAULT 0');add('users','github_id TEXT');add('users','github_login TEXT');
    add('tasks',"quadrant TEXT NOT NULL DEFAULT 'none'");
    add('invites','creator_id TEXT REFERENCES users(id)');add('invites',"direction TEXT NOT NULL DEFAULT 'learner'");
    add('prizes','space_id TEXT REFERENCES users(id)');add('prizes',"category TEXT NOT NULL DEFAULT 'custom'");add('prizes','face_cents INTEGER NOT NULL DEFAULT 0');add('prizes',"tier TEXT NOT NULL DEFAULT '小小心愿'");
    add('cards','manager_id TEXT REFERENCES users(id)');add('cards',"category TEXT NOT NULL DEFAULT 'custom'");add('cards','face_cents INTEGER NOT NULL DEFAULT 0');add('cards',"tier TEXT NOT NULL DEFAULT '小小心愿'");add('cards',"receipt_note TEXT NOT NULL DEFAULT ''");add('cards','claim_cents INTEGER NOT NULL DEFAULT 0');add('cards','paid_cents INTEGER NOT NULL DEFAULT 0');add('cards','fulfilled_by TEXT REFERENCES users(id)');
    add('cards','redemption_version INTEGER NOT NULL DEFAULT 0');
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users(email) WHERE email IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS users_github ON users(github_id) WHERE github_id IS NOT NULL;
      CREATE TABLE IF NOT EXISTS pairs (learner_id TEXT PRIMARY KEY REFERENCES users(id),manager_id TEXT NOT NULL REFERENCES users(id),created TEXT NOT NULL,CHECK(learner_id<>manager_id));
      CREATE INDEX IF NOT EXISTS pairs_manager ON pairs(manager_id);
      CREATE TABLE IF NOT EXISTS pair_transfers (id TEXT PRIMARY KEY,learner_id TEXT NOT NULL,manager_id TEXT NOT NULL,cards TEXT NOT NULL,face_cents INTEGER NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS space_settings (user_id TEXT PRIMARY KEY REFERENCES users(id),value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS card_moves (id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,inputs TEXT NOT NULL,outputs TEXT NOT NULL,face_cents INTEGER NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS redemption_links (card_id TEXT PRIMARY KEY REFERENCES cards(id),token_hash TEXT UNIQUE NOT NULL,expires INTEGER NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS receipts (card_id TEXT PRIMARY KEY REFERENCES cards(id),mime TEXT NOT NULL,data BLOB NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS email_challenges (id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),email TEXT NOT NULL,purpose TEXT NOT NULL,code_hash TEXT NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,expires INTEGER NOT NULL,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS oauth_flows (state_hash TEXT PRIMARY KEY,browser_hash TEXT NOT NULL,verifier TEXT NOT NULL,user_id TEXT REFERENCES users(id),invite_hash TEXT,expires INTEGER NOT NULL);
    `);
    const users=db.prepare('SELECT id,role FROM users ORDER BY created,id').all(),owner=users.find(u=>u.role==='admin'),prizes=db.prepare('SELECT * FROM prizes WHERE space_id IS NULL').all();
    const time=new Date().toISOString();
    if(owner){
      db.prepare('UPDATE invites SET creator_id=? WHERE creator_id IS NULL').run(owner.id);
      for(const u of users){
        if(u.id!==owner.id)db.prepare('INSERT OR IGNORE INTO pairs VALUES(?,?,?)').run(u.id,owner.id,time);
        for(const p of prizes){
          const pid=u.id===owner.id?p.id:randomUUID();
          if(pid===p.id)db.prepare('UPDATE prizes SET space_id=? WHERE id=?').run(u.id,p.id);
          else {
            db.prepare('INSERT INTO prizes(id,title,description,emoji,tone,cost,stock,weight,wait_days,active,space_id,category,face_cents,tier) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(pid,p.title,p.description,p.emoji,p.tone,p.cost,0,p.weight,p.wait_days,p.active,u.id,p.category,p.face_cents,p.tier);
            db.prepare('UPDATE cards SET prize_id=? WHERE user_id=? AND prize_id=?').run(pid,u.id,p.id);
            db.prepare('UPDATE draws SET prize_id=? WHERE user_id=? AND prize_id=?').run(pid,u.id,p.id);
          }
        }
        db.prepare('UPDATE cards SET manager_id=? WHERE user_id=?').run(owner.id,u.id);
      }
    }
    db.exec('PRAGMA user_version=3; COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}

function migrateSpaces(db) {
  migrateLegacy(db);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)>=4)return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE spaces (
      id TEXT PRIMARY KEY, learner_id TEXT NOT NULL REFERENCES users(id),
      giver_id TEXT REFERENCES users(id), legacy_self INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL,
      CHECK(learner_id<>giver_id), UNIQUE(learner_id,giver_id));
      CREATE UNIQUE INDEX spaces_personal ON spaces(learner_id) WHERE giver_id IS NULL;
      CREATE INDEX spaces_giver ON spaces(giver_id);
      CREATE TABLE room_settings(space_id TEXT PRIMARY KEY REFERENCES spaces(id),value TEXT NOT NULL);
      CREATE TABLE room_lessons(space_id TEXT NOT NULL REFERENCES spaces(id),lesson TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(space_id,lesson));`);
    const users=db.prepare('SELECT id,role,created FROM users').all();
    const insert=db.prepare('INSERT INTO spaces VALUES(?,?,?,?,?)');
    for(const user of users){
      const giver=db.prepare('SELECT manager_id FROM pairs WHERE learner_id=?').get(user.id)?.manager_id||null;
      insert.run(user.id,user.id,giver,!giver&&user.role==='admin'?1:0,user.created);
      if(giver)insert.run(randomUUID(),user.id,null,0,user.created);
    }
    for(const table of ['tasks','completions','ledger','cards','draws','card_moves']){
      db.exec(`ALTER TABLE ${table} ADD COLUMN space_id TEXT REFERENCES spaces(id);
        UPDATE ${table} SET space_id=user_id;
        CREATE INDEX ${table}_space ON ${table}(space_id);`);
    }
    // Keep the old prize owner column for its existing user FK and historical exports.
    db.exec(`ALTER TABLE prizes ADD COLUMN room_id TEXT REFERENCES spaces(id);
      UPDATE prizes SET room_id=space_id;
      CREATE INDEX prizes_room ON prizes(room_id);
      INSERT INTO room_settings SELECT user_id,value FROM space_settings;
      INSERT INTO room_lessons SELECT user_id,lesson,created FROM lessons;
      PRAGMA user_version=4; COMMIT;`);
  }catch(error){db.exec('ROLLBACK');throw error;}
}

function migrateBonuses(db) {
  migrateSpaces(db);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)>=5)return;
  db.exec('BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE daily_bonuses (
      space_id TEXT NOT NULL REFERENCES spaces(id),day TEXT NOT NULL,
      kind TEXT NOT NULL CHECK(kind IN ('coins','ticket')),amount INTEGER NOT NULL CHECK(amount>0),
      active INTEGER NOT NULL CHECK(active IN (0,1)),created TEXT NOT NULL,updated TEXT NOT NULL,
      PRIMARY KEY(space_id,day));
      CREATE TABLE ticket_ledger (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,
        space_id TEXT NOT NULL REFERENCES spaces(id),amount INTEGER NOT NULL,
        kind TEXT NOT NULL,note TEXT NOT NULL,ref TEXT NOT NULL,created TEXT NOT NULL);
      CREATE INDEX ticket_ledger_space ON ticket_ledger(space_id,seq);
      PRAGMA user_version=5; COMMIT;`);
  }catch(error){db.exec('ROLLBACK');throw error;}
}

function migrateTemplates(db){
  migrateBonuses(db);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)>=6)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    const columns=db.prepare('PRAGMA table_info(prizes)').all();
    if(!columns.some(c=>c.name==='template_id'))db.exec('ALTER TABLE prizes ADD COLUMN template_id TEXT');
    if(!columns.some(c=>c.name==='removed'))db.exec('ALTER TABLE prizes ADD COLUMN removed INTEGER NOT NULL DEFAULT 0');
    // Recognize untouched template descriptions, without rewriting prices, stock or issued cards.
    for(const t of TEMPLATES.filter(t=>!t.effect))db.prepare('UPDATE prizes SET template_id=? WHERE template_id IS NULL AND title=? AND description=? AND category=? AND face_cents=? AND emoji=? AND tier=?').run(t.template_id,t.title,t.description,t.category,t.face_cents,t.emoji,t.tier);
    db.exec('PRAGMA user_version=6;COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}

function migrateCommunity(db){
  migrateTemplates(db);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)>=7)return;
  // Replace only the old pair uniqueness constraint; referenced IDs stay unchanged.
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try{
    db.exec(`CREATE TABLE spaces_v7 (
      id TEXT PRIMARY KEY,learner_id TEXT NOT NULL REFERENCES users(id),giver_id TEXT REFERENCES users(id),
      legacy_self INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL,created_by TEXT REFERENCES users(id),
      family_id TEXT,status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','unbound','deleted')),
      closed_at TEXT,CHECK(learner_id<>giver_id));
      INSERT INTO spaces_v7(id,learner_id,giver_id,legacy_self,created,created_by)
        SELECT id,learner_id,giver_id,legacy_self,created,CASE WHEN giver_id IS NULL THEN learner_id ELSE NULL END FROM spaces;
      DROP TABLE spaces; ALTER TABLE spaces_v7 RENAME TO spaces;
      CREATE UNIQUE INDEX spaces_personal ON spaces(learner_id) WHERE giver_id IS NULL AND family_id IS NULL;
      CREATE UNIQUE INDEX spaces_pair_active ON spaces(learner_id,giver_id) WHERE giver_id IS NOT NULL AND status='active';
      CREATE INDEX spaces_giver ON spaces(giver_id);
      CREATE INDEX spaces_family ON spaces(family_id);
      CREATE TABLE IF NOT EXISTS families(id TEXT PRIMARY KEY,name TEXT NOT NULL,creator_id TEXT NOT NULL REFERENCES users(id),pool_space_id TEXT NOT NULL REFERENCES spaces(id),status TEXT NOT NULL DEFAULT 'active',created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS family_members(family_id TEXT NOT NULL REFERENCES families(id),user_id TEXT NOT NULL REFERENCES users(id),space_id TEXT NOT NULL UNIQUE REFERENCES spaces(id),is_admin INTEGER NOT NULL DEFAULT 0 CHECK(is_admin IN (0,1)),created TEXT NOT NULL,PRIMARY KEY(family_id,user_id));
      CREATE TABLE IF NOT EXISTS mailbox(id TEXT PRIMARY KEY,sender_id TEXT NOT NULL REFERENCES users(id),recipient_id TEXT NOT NULL REFERENCES users(id),kind TEXT NOT NULL,subject TEXT NOT NULL,payload TEXT NOT NULL DEFAULT '{}',status TEXT NOT NULL DEFAULT 'pending',created TEXT NOT NULL,updated TEXT NOT NULL,read_at TEXT);
      CREATE INDEX IF NOT EXISTS mailbox_recipient ON mailbox(recipient_id,created);
      CREATE TABLE IF NOT EXISTS room_closures(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),family_id TEXT,requester_id TEXT NOT NULL REFERENCES users(id),mode TEXT NOT NULL CHECK(mode IN ('unbound','deleted')),status TEXT NOT NULL DEFAULT 'pending',created TEXT NOT NULL,updated TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS room_close_pending ON room_closures(space_id) WHERE status='pending';
      CREATE TABLE IF NOT EXISTS room_close_votes(request_id TEXT NOT NULL REFERENCES room_closures(id),user_id TEXT NOT NULL REFERENCES users(id),decision TEXT NOT NULL DEFAULT 'pending',mail_id TEXT UNIQUE REFERENCES mailbox(id),PRIMARY KEY(request_id,user_id));
      CREATE TABLE IF NOT EXISTS friends(user_a TEXT NOT NULL REFERENCES users(id),user_b TEXT NOT NULL REFERENCES users(id),created TEXT NOT NULL,PRIMARY KEY(user_a,user_b),CHECK(user_a<user_b));
      CREATE TABLE IF NOT EXISTS diaries(user_id TEXT NOT NULL REFERENCES users(id),day TEXT NOT NULL,content TEXT NOT NULL,updated TEXT NOT NULL,PRIMARY KEY(user_id,day));
      CREATE TABLE IF NOT EXISTS day_shares(id TEXT PRIMARY KEY,mail_id TEXT UNIQUE NOT NULL REFERENCES mailbox(id),owner_id TEXT NOT NULL REFERENCES users(id),viewer_id TEXT NOT NULL REFERENCES users(id),day TEXT NOT NULL,scope TEXT NOT NULL,snapshot TEXT NOT NULL,revoked INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS room_audit(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT UNIQUE NOT NULL,space_id TEXT NOT NULL REFERENCES spaces(id),family_id TEXT,actor_id TEXT NOT NULL REFERENCES users(id),actor_name TEXT NOT NULL,action TEXT NOT NULL,summary TEXT NOT NULL,detail TEXT NOT NULL DEFAULT '{}',created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS audit_space ON room_audit(space_id,seq);
      CREATE INDEX IF NOT EXISTS audit_family ON room_audit(family_id,seq);
      CREATE INDEX IF NOT EXISTS audit_actor ON room_audit(actor_id,created);
      CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON room_audit BEGIN SELECT RAISE(ABORT,'audit is append only'); END;
      CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON room_audit BEGIN SELECT RAISE(ABORT,'audit is append only'); END;`);
    const inviteColumns=db.prepare('PRAGMA table_info(invites)').all();
    if(!inviteColumns.some(c=>c.name==='family_id'))db.exec('ALTER TABLE invites ADD COLUMN family_id TEXT REFERENCES families(id)');
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Migration foreign key validation failed');
    db.exec('PRAGMA user_version=7;COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}finally{db.exec('PRAGMA foreign_keys=ON');}
}

function migrateEffects(db){
  migrateCommunity(db);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)>=8)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    for(const [table,column] of [['spaces','room_name'],['prizes','effect'],['cards','effect']]){
      if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} TEXT NOT NULL DEFAULT ''`);
    }
    db.exec('PRAGMA user_version=8;COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}

function migrateScoring(db){
  migrateEffects(db);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)>=9)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    const additions=[['tasks','difficulty',"TEXT NOT NULL DEFAULT ''"],['completions','difficulty',"TEXT NOT NULL DEFAULT ''"],['completions','score_mode',"TEXT NOT NULL DEFAULT 'manual'"],['completions','nominal_points','INTEGER NOT NULL DEFAULT 0']];
    for(const [table,column,type] of additions)if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    db.exec('UPDATE completions SET nominal_points=points WHERE nominal_points=0 AND points>0');
    // Preserve the agreed scoring of existing rooms; only new rooms default to difficulty mode.
    for(const room of db.prepare('SELECT id FROM spaces').all()){
      const settings=JSON.parse(db.prepare('SELECT value FROM room_settings WHERE space_id=?').get(room.id)?.value||'{}');
      if(!settings.taskScoreMode){settings.taskScoreMode='manual';db.prepare('INSERT INTO room_settings VALUES(?,?) ON CONFLICT(space_id) DO UPDATE SET value=excluded.value').run(room.id,JSON.stringify(settings));}
    }
    db.exec('PRAGMA user_version=9;COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}

function migrateLottery(db){
  migrateScoring(db);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)>=10)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    const additions=[['prizes','channel',"TEXT NOT NULL DEFAULT 'shop'"],['cards','lottery_funded','INTEGER NOT NULL DEFAULT 0']];
    for(const [table,column,type] of additions)if(!db.prepare(`PRAGMA table_info(${table})`).all().some(c=>c.name===column))db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
    // Keep existing shop stock and issued cards untouched. The giver explicitly
    // prepares the new independent lottery, so migration cannot double inventory.
    db.exec(`CREATE TABLE IF NOT EXISTS lottery_costs(id TEXT PRIMARY KEY,room_id TEXT NOT NULL REFERENCES spaces(id),cents INTEGER NOT NULL CHECK(cents>0),kind TEXT NOT NULL,ref TEXT NOT NULL,created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS lottery_costs_room ON lottery_costs(room_id);
      CREATE TABLE IF NOT EXISTS room_themes(space_id TEXT PRIMARY KEY REFERENCES spaces(id),theme TEXT NOT NULL,expires TEXT NOT NULL);
      PRAGMA user_version=10;COMMIT`);
  }catch(e){db.exec('ROLLBACK');throw e;}
}

function migratePets(db){
  migrateLottery(db);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)>=11)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    if(!db.prepare('PRAGMA table_info(tasks)').all().some(c=>c.name==='estimated_minutes'))db.exec('ALTER TABLE tasks ADD COLUMN estimated_minutes INTEGER NOT NULL DEFAULT 0 CHECK(estimated_minutes BETWEEN 0 AND 1440)');
    db.exec(`CREATE TABLE IF NOT EXISTS pets(space_id TEXT PRIMARY KEY REFERENCES spaces(id),form TEXT NOT NULL,outfit TEXT NOT NULL DEFAULT '',created TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS pet_experience(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),card_id TEXT NOT NULL UNIQUE REFERENCES cards(id),amount INTEGER NOT NULL CHECK(amount>0),created TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS pet_experience_space ON pet_experience(space_id);
      CREATE TABLE IF NOT EXISTS pet_outfits(space_id TEXT NOT NULL REFERENCES spaces(id),effect TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(space_id,effect));`);
    // Only update the uncustomized default jackpot. Issued cards are immutable snapshots.
    db.prepare("UPDATE prizes SET title='500 元自选心愿卡',category='universal',emoji='🌈',description='任意品类的 ¥500 报销额度，选一份真正喜欢的心愿。' WHERE template_id='lucky-6' AND channel='lottery' AND title='快乐大礼包' AND category='play' AND face_cents=50000 AND effect='' AND description='游戏或玩具的 ¥500 报销额度，把小期待变成大快乐。'").run();
    db.exec('PRAGMA user_version=11;COMMIT');
  }catch(e){db.exec('ROLLBACK');throw e;}
}

function migrateProgress(db){
  migratePets(db);
  if(Number(db.prepare('PRAGMA user_version').get().user_version)>=12)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    const cols=db.prepare('PRAGMA table_info(tasks)').all();
    if(!cols.some(c=>c.name==='score_override'))db.exec('ALTER TABLE tasks ADD COLUMN score_override INTEGER');
    if(!cols.some(c=>c.name==='score_revision'))db.exec('ALTER TABLE tasks ADD COLUMN score_revision INTEGER NOT NULL DEFAULT 0');
    if(!db.prepare('PRAGMA table_info(cards)').all().some(c=>c.name==='merge_roots'))db.exec("ALTER TABLE cards ADD COLUMN merge_roots TEXT NOT NULL DEFAULT '[]'");
    for(const move of db.prepare('SELECT inputs,outputs FROM card_moves ORDER BY rowid').all()){const roots=[...new Set(JSON.parse(move.inputs).flatMap(cid=>{const card=db.prepare('SELECT merge_roots FROM cards WHERE id=?').get(cid);const r=JSON.parse(card?.merge_roots||'[]');return r.length?r:[cid];}))];for(const cid of JSON.parse(move.outputs))db.prepare('UPDATE cards SET merge_roots=? WHERE id=?').run(JSON.stringify(roots),cid);}
    db.exec(`CREATE TABLE IF NOT EXISTS task_timers(id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),space_id TEXT NOT NULL REFERENCES spaces(id),user_id TEXT NOT NULL REFERENCES users(id),started_ms INTEGER NOT NULL,ended_ms INTEGER);
      CREATE UNIQUE INDEX IF NOT EXISTS timer_active_user ON task_timers(user_id) WHERE ended_ms IS NULL;
      CREATE INDEX IF NOT EXISTS timer_space ON task_timers(space_id,started_ms);
      CREATE TABLE IF NOT EXISTS growth_rules(space_id TEXT PRIMARY KEY REFERENCES spaces(id),value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS growth_progress(space_id TEXT PRIMARY KEY REFERENCES spaces(id),high_xp INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS progress_events(space_id TEXT NOT NULL REFERENCES spaces(id),event_key TEXT NOT NULL,recipient_id TEXT NOT NULL REFERENCES users(id),mail_id TEXT NOT NULL REFERENCES mailbox(id),created TEXT NOT NULL,PRIMARY KEY(space_id,event_key,recipient_id));
      CREATE TABLE IF NOT EXISTS mail_gifts(mail_id TEXT PRIMARY KEY REFERENCES mailbox(id),space_id TEXT NOT NULL REFERENCES spaces(id),recipient_id TEXT NOT NULL REFERENCES users(id),manager_id TEXT NOT NULL REFERENCES users(id),gift TEXT NOT NULL,threshold INTEGER NOT NULL DEFAULT 0,created TEXT NOT NULL,claimed_at TEXT,card_id TEXT REFERENCES cards(id));
      CREATE TABLE IF NOT EXISTS daily_reports(space_id TEXT NOT NULL REFERENCES spaces(id),day TEXT NOT NULL,report TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(space_id,day));
      CREATE TABLE IF NOT EXISTS pet_trips(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),departure INTEGER NOT NULL,return_at INTEGER NOT NULL,duration_hours INTEGER NOT NULL,xp INTEGER NOT NULL,supplies TEXT NOT NULL,destination TEXT NOT NULL,story TEXT NOT NULL,gift TEXT NOT NULL,status TEXT NOT NULL,mail_id TEXT REFERENCES mailbox(id),created TEXT NOT NULL);
      CREATE UNIQUE INDEX IF NOT EXISTS pet_trip_away ON pet_trips(space_id) WHERE status='away';
      CREATE INDEX IF NOT EXISTS pet_trip_due ON pet_trips(status,return_at);`);
    db.exec(`INSERT OR IGNORE INTO growth_progress SELECT s.id,MAX(0,COALESCE((SELECT SUM(points)/1000000 FROM completions WHERE space_id=s.id AND done=1),0)+COALESCE((SELECT SUM(amount) FROM daily_bonuses WHERE space_id=s.id AND active=1 AND kind='coins'),0)+COALESCE((SELECT SUM(amount) FROM pet_experience WHERE space_id=s.id),0)) FROM spaces s;
      INSERT OR IGNORE INTO settings VALUES('progress_started_day',strftime('%Y-%m-%d','now','+8 hours'));
      PRAGMA user_version=12;COMMIT`);
  }catch(e){db.exec('ROLLBACK');throw e;}
}

function migrateTaskPlans(db){
  migrateProgress(db);if(Number(db.prepare('PRAGMA user_version').get().user_version)>=13)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    const columns=db.prepare('PRAGMA table_info(tasks)').all();
    for(const [name,type] of [['task_kind',"TEXT NOT NULL DEFAULT 'normal' CHECK(task_kind IN ('normal','repeat','long'))"],['repeat_days','INTEGER NOT NULL DEFAULT 1 CHECK(repeat_days IN (1,2,7))'],['deadline',"TEXT NOT NULL DEFAULT ''"],['archived_at','TEXT']])if(!columns.some(c=>c.name===name))db.exec('ALTER TABLE tasks ADD COLUMN '+name+' '+type);
    if(!columns.some(c=>c.name==='task_kind'))db.exec("UPDATE tasks SET task_kind='repeat' WHERE recurrence='daily'");
    db.exec("CREATE TABLE IF NOT EXISTS task_settlements(space_id TEXT NOT NULL REFERENCES spaces(id),day TEXT NOT NULL,gross INTEGER NOT NULL,missed INTEGER NOT NULL,percent INTEGER NOT NULL CHECK(percent BETWEEN 0 AND 100),amount INTEGER NOT NULL,detail TEXT NOT NULL,created TEXT NOT NULL,PRIMARY KEY(space_id,day)); INSERT OR IGNORE INTO settings VALUES('task_settlement_start',strftime('%Y-%m-%d','now','+8 hours')); PRAGMA user_version=13; COMMIT");
  }catch(e){db.exec('ROLLBACK');throw e;}
}

function migrateGrowthDelivery(db){
  migrateTaskPlans(db);if(Number(db.prepare('PRAGMA user_version').get().user_version)>=14)return;
  db.exec('BEGIN IMMEDIATE');
  try{db.exec("CREATE TABLE IF NOT EXISTS growth_deliveries(id TEXT PRIMARY KEY,space_id TEXT NOT NULL REFERENCES spaces(id),next_threshold INTEGER NOT NULL,end_xp INTEGER NOT NULL,rules TEXT NOT NULL,created TEXT NOT NULL); CREATE INDEX IF NOT EXISTS growth_delivery_space ON growth_deliveries(space_id,created); PRAGMA user_version=14; COMMIT");}
  catch(e){db.exec('ROLLBACK');throw e;}
}

export function migrate(db){
  migrateGrowthDelivery(db);if(Number(db.prepare('PRAGMA user_version').get().user_version)>=15)return;
  db.exec('BEGIN IMMEDIATE');
  try{
    db.exec(`CREATE TABLE IF NOT EXISTS pet_growth(space_id TEXT PRIMARY KEY REFERENCES pets(space_id),stage INTEGER NOT NULL CHECK(stage BETWEEN 0 AND 5),updated TEXT NOT NULL);
      INSERT OR IGNORE INTO pet_growth(space_id,stage,updated)
      SELECT p.space_id,CASE WHEN
        COALESCE((SELECT SUM(c.points)/1000000.0 FROM completions c WHERE c.space_id=p.space_id AND c.done=1),0)+
        COALESCE((SELECT SUM(b.amount) FROM daily_bonuses b WHERE b.space_id=p.space_id AND b.active=1 AND b.kind='coins'),0)+
        COALESCE((SELECT SUM(e.amount) FROM pet_experience e WHERE e.space_id=p.space_id),0)+
        COALESCE((SELECT SUM(t.xp) FROM pet_trips t WHERE t.space_id=p.space_id AND t.status='returned'),0)>=600 THEN 2 ELSE 1 END,
        strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM pets p;
      PRAGMA user_version=15;COMMIT`);
  }catch(e){db.exec('ROLLBACK');throw e;}
}
