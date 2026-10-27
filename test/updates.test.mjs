import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {appUpdateState,versionParts,nativeAutoUpdate,needsUpdateBootstrap} from '../public/updates.js';
import {createApp} from '../server.mjs';

test('安装包版本按数字逐段比较，兼容早期两段版本，避免误降级',()=>{
  for(const [current,latest,kind] of [['1.0','3.2.0','update'],['3.1.0','3.2.0','update'],['3.2','3.2.0','current'],['3.2.0','3.2.0','current'],['3.10.0','3.2.0','newer'],['3.2.9','3.2.10','update']])assert.equal(appUpdateState('Mozilla/5.0 StarlightAndroid/'+current,{version:latest}).kind,kind);
  assert.equal(appUpdateState('Mozilla/5.0 Android',{version:'3.2.0'}).kind,'web');
  assert.equal(appUpdateState('Mozilla/5.0 (Linux; Android 14; Phone Build/A; wv) AppleWebKit/537.36 Version/4.0 Chrome/120.0 Mobile Safari/537.36',{version:'3.2.0'}).kind,'unknown');
  assert.equal(appUpdateState('StarlightAndroid/bad',{version:'3.2.0'}).kind,'unknown');
  assert.equal(appUpdateState('StarlightAndroid/3.0',null).kind,'unavailable');
  for(const invalid of ['3','3.2.bad','3.2.0-beta','3.2.0.1','9999999.0','<script>',null])assert.equal(versionParts(invalid),null);
});

test('更新接口无须登录，版本与实际 APK 摘要一致，下载沿用同源地址且不缓存',async t=>{
  const {server,store}=await createApp({dbPath:':memory:'});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(()=>{store.db.close();r();})));
  const base='http://127.0.0.1:'+server.address().port,response=await fetch(base+'/api/status'),status=await response.json();
  const apk=readFileSync(new URL('../public/downloads/starlight.apk',import.meta.url)),release=JSON.parse(readFileSync(new URL('../public/downloads/starlight.json',import.meta.url),'utf8'));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal(status.webVersion,JSON.parse(readFileSync(new URL('../package.json',import.meta.url))).version);
  assert.equal(status.apk.version,release.version);assert.equal(status.apk.versionCode,release.versionCode);assert.equal(status.apk.sha256,createHash('sha256').update(apk).digest('hex'));assert.equal(status.apk.bytes,apk.length);assert.equal(status.apk.url,'/downloads/starlight.apk');
  const download=await fetch(base+status.apk.url,{method:'HEAD'});assert.equal(download.status,200);assert.match(download.headers.get('content-disposition'),new RegExp(release.version.replaceAll('.','\\.')));
  const module=await fetch(base+'/updates.js');assert.equal(module.status,200);assert.match(await module.text(),/appUpdateState/);
});

test('旧 APK 引导覆盖安装一次，新 APK 交给原生更新且不重复弹网页提示',()=>{
 const release={version:'3.7.0',versionCode:370};
 assert.equal(needsUpdateBootstrap('Mozilla Android StarlightAndroid/3.2.0',release),true);
 assert.equal(needsUpdateBootstrap('Mozilla Android 14; Phone; wv)',release),false);
 assert.equal(needsUpdateBootstrap('Mozilla Android Chrome/120.0',release),false);
 assert.equal(needsUpdateBootstrap('Mozilla Firefox/129.0',release),false);
 const native='Mozilla Android StarlightAndroid/3.7.0 StarlightAutoUpdate/1';
 assert.equal(nativeAutoUpdate(native),true);assert.equal(needsUpdateBootstrap(native,{version:'3.8.0',versionCode:380}),false);
 assert.equal(nativeAutoUpdate('StarlightAutoUpdate/10'),false);
 assert.equal(needsUpdateBootstrap('StarlightAndroid/3.2.0',null),false);
});
