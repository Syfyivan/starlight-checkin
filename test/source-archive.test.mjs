import {test} from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {parseSourceEpub} from '../lib/wikisource.mjs';

function zip(entries,{hideSize=false}={}){
  const locals=[],directory=[];let offset=0;
  for(const [name,value] of Object.entries(entries)){
    const n=Buffer.from(name),body=Buffer.from(value),data=deflateRawSync(body),h=Buffer.alloc(30),d=Buffer.alloc(46),size=hideSize?1:body.length;
    h.writeUInt32LE(0x04034b50);h.writeUInt16LE(20,4);h.writeUInt16LE(8,8);h.writeUInt32LE(data.length,18);h.writeUInt32LE(size,22);h.writeUInt16LE(n.length,26);
    d.writeUInt32LE(0x02014b50);d.writeUInt16LE(20,6);d.writeUInt16LE(8,10);d.writeUInt32LE(data.length,20);d.writeUInt32LE(size,24);d.writeUInt16LE(n.length,28);d.writeUInt32LE(offset,42);
    locals.push(h,n,data);directory.push(d,n);offset+=h.length+n.length+data.length;
  }
  const dirs=Buffer.concat(directory),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(directory.length/2,8);end.writeUInt16LE(directory.length/2,10);end.writeUInt32LE(dirs.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...locals,dirs,end]);
}
const epub=(extra={},manifest='')=>zip({
  mimetype:'application/epub+zip',
  'META-INF/container.xml':'<container><rootfiles><rootfile full-path="book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
  'book.opf':'<package version="3.0"><metadata><title>一段中文阅读</title></metadata><manifest><item id="body" href="body.xhtml" media-type="application/xhtml+xml"/>'+manifest+'</manifest><spine><itemref idref="body"/></spine></package>',
  'body.xhtml':'<html><body><h1>开始阅读</h1><p>我想多读一点书，多学一点新知识。</p></body></html>',...extra
});

test('出版社外层ZIP仅取一本EPUB，不将附带文件变成正文',async()=>{
  const book=await parseSourceEpub(zip({'download/book.epub':epub(),'readme.txt':'不要展示这份说明','__MACOSX/._book.epub':'resource fork'}),{sourceArchive:true,wikisource:false});
  assert.equal(book.title,'一段中文阅读');assert.ok(book.chapters.some(c=>c.text.includes('多学一点新知识')));assert.ok(!JSON.stringify(book).includes('不要展示'));
  assert.equal((await parseSourceEpub(epub(),{sourceArchive:true,wikisource:false})).title,'一段中文阅读');
});
test('字体混淆不妨碍明文正文；正文加密和未知算法仍拒绝',async()=>{
  const declaration=(uri,algorithm='http://www.idpf.org/2008/embedding')=>'<encryption><EncryptedData><EncryptionMethod Algorithm="'+algorithm+'"/><CipherData><CipherReference URI="'+uri+'"/></CipherData></EncryptedData></encryption>';
  const font='<item id="font" href="font.otf" media-type="font/otf"/>';
  const good=epub({'META-INF/encryption.xml':declaration('font.otf'),'font.otf':'unread obfuscated bytes'},font);
  assert.equal((await parseSourceEpub(good,{wikisource:false})).title,'一段中文阅读');
  await assert.rejects(parseSourceEpub(epub({'META-INF/encryption.xml':declaration('body.xhtml')}),{wikisource:false}),/加密正文/);
  await assert.rejects(parseSourceEpub(epub({'META-INF/encryption.xml':declaration('font.otf','unknown'),'font.otf':'x'},font),{wikisource:false}),/加密正文/);
});
test('混淆字体与正文使用不同manifest标识但指向同一路径时仍拒绝',async()=>{
  const book=epub({
    'META-INF/encryption.xml':'<encryption><EncryptedData><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><CipherData><CipherReference URI="body.xhtml"/></CipherData></EncryptedData></encryption>',
    // Put the font alias first so a first-match ID check would accept it.
    'book.opf':'<package version="3.0"><metadata><title>同路径别名</title></metadata><manifest><item id="font" href="./body.xhtml" media-type="font/otf"/><item id="body" href="body.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="body"/></spine></package>'
  });
  await assert.rejects(parseSourceEpub(book,{wikisource:false}),/加密正文/);
});
test('不猜测多本压缩包，不递归解压，不接受外层路径穿越',async()=>{
  const options={sourceArchive:true,wikisource:false};
  await assert.rejects(parseSourceEpub(zip({'a.epub':epub(),'b.epub':epub()}),options),/恰好一本/);
  await assert.rejects(parseSourceEpub(zip({'nested.zip':zip({'a.epub':epub()})}),options),/恰好一本/);
  await assert.rejects(parseSourceEpub(zip({'../a.epub':epub()}),options),/不安全路径/);
});
test('外层ZIP虚报尺寸也不能绕过10MB实际展开上限',async()=>{
  await assert.rejects(parseSourceEpub(zip({'a.epub':Buffer.alloc(10*1024*1024+1,65)},{hideSize:true}),{sourceArchive:true,wikisource:false}),/10 MB/);
});
test('拒绝虚报中央目录数量，避免未检查的成员被解压库读取',async()=>{
  const bytes=zip({'a.epub':epub(),'../unchecked.txt':'bad'}),end=bytes.length-22;
  bytes.writeUInt16LE(1,end+8);bytes.writeUInt16LE(1,end+10);
  await assert.rejects(parseSourceEpub(bytes,{sourceArchive:true,wikisource:false}),/ZIP目录文件计数不一致/);
});
