import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {BookSource} from '../lib/book-source.mjs';

test('网盘书目按简繁书名检索，小文件优先，独立于站内正文',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'reading-index-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'quark-books.json.gz');
  const catalog={share:'https://pan.quark.cn/s/example',files:[['故事練習(簡體版).mobi','文学',100000],['故事练习(简体版).txt','精选',9000],['故事练习(繁体版).epub','文学',100],['故事练习.txt','文学',10]]};
  writeFileSync(file,gzipSync(JSON.stringify(catalog)));
  const source=new BookSource(null,{quarkIndexPath:file});
  const result=await source.searchAll('故事練習');
  assert.deepEqual(result.quark.map(b=>b.format),['TXT','MOBI']);
  assert.equal(result.books.length,0);assert.equal(result.external.length,0);
  assert.match(result.message,/夸克/);
  assert.ok(!(await source.searchAll('')).quark?.length);
  assert.deepEqual((await new BookSource(null).searchAll('故事练习')).quark,[]);
});

test('夸克跳转使用选中版本的父目录，旧索引和无效目录回到合集',async t=>{
  const {selectQuarkBooks}=await import('../scripts/select-quark-books.mjs');
  const folder='a'.repeat(32),share='https://pan.quark.cn/s/example';
  const rows=[['儿女英雄传(简体版).mobi','中国',100000,folder],
    ['同名书(简体版).txt','文学',100],['测试书(简体版).txt','其他',100,'../bad']];
  const dir=mkdtempSync(join(tmpdir(),'reading-index-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const file=join(dir,'index.gz');
  writeFileSync(file,gzipSync(JSON.stringify({share,...selectQuarkBooks(rows)})));
  const source=new BookSource(null,{quarkIndexPath:file});
  const [book]=(await source.searchAll('儿女英雄传')).quark;
  assert.equal(book.url,share+'#/list/share/'+folder);
  assert.equal(book.name,rows[0][0]);assert.equal(book.folderLink,true);
  for(const title of ['同名书','测试书']){
    const [entry]=(await source.searchAll(title)).quark;
    assert.equal(entry.url,share);assert.equal(entry.folderLink,false);
  }
});

test('每本书按文件大小选一到三个来源，保留分卷、译本和同名作者的区别',async()=>{
  const {selectQuarkBooks}=await import('../scripts/select-quark-books.mjs');
  const MiB=1024*1024;
  const select=(names)=>selectQuarkBooks(names.map(([name,size])=>[name.replace(/^(.*?)(?= - |\.[^.]+$)/,'$1(简体版)'),'文学',size]));
  const variants=size=>[['旧書.mobi',size],['旧书.epub',size+1],['旧书(精排版).mobi',size+2],['旧书.txt',size+3]];
  assert.equal(select(variants(4000)).files.length,3);
  assert.equal(select(variants(2*MiB)).files.length,2);
  assert.equal(select(variants(6*MiB)).files.length,1);
  assert.equal(select([['孤女飄零記.mobi',9*MiB],['简·爱.epub',8*MiB]]).files[0][0],'简·爱(简体版).epub');
  const vols=select([['书名（上册）.mobi',8*MiB],['书名（下册）.mobi',8*MiB]]);
  assert.equal(vols.works,2);assert.equal(vols.files.length,2);
  const names=select([['同名 - 甲作者.epub',8*MiB],['同名 - 乙作者.mobi',9*MiB]]);
  assert.equal(names.works,2);assert.ok(names.files.every(r=>r[3].includes('核对作者')));
  const translations=select([['旧书(甲某译).mobi',8000],['旧书(乙某译).mobi',8000]]);
  assert.equal(translations.works,1);assert.equal(translations.files.length,2);
});

test('简体版本先于大小筛选，混排和字形不明的条目不进入书目',async()=>{
  const {selectQuarkBooks}=await import('../scripts/select-quark-books.mjs');
  const rows=['故事(繁体版).txt','故事(简繁对照)(简体版).txt','故事.txt','故事(简体版).txt']
    .map((name,i)=>[name,'文学',i+1]);
  assert.deepEqual(selectQuarkBooks(rows).files,[rows[3]]);
  const attached=['圣经（和合本）中文简体 v2.0.mobi','国学',9000];
  assert.deepEqual(selectQuarkBooks([attached]).files,[attached]);
  const source=new BookSource(null);
  for(const title of ['简爱','孤女飄零記']){
    const result=await source.searchAll(title);
    assert.ok(!result.books.some(b=>b.id==='ed:jane-eyre'));
    assert.ok(result.external.some(b=>b.title==='简·爱'));
  }
  await assert.rejects(source.download('ed:jane-eyre'),/已收录/);
});
test('有单本分享时返回单本入口，其他版本继续打开所在目录',async t=>{
  const dir=mkdtempSync(join(tmpdir(),'reading-single-share-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const path=join(dir,'index.gz'),share='https://pan.quark.cn/s/series',folder='c'.repeat(32);
  const rows=[
    ['小屋故事(简体版).mobi','故事',50000,'',folder,'https://pan.quark.cn/s/book'],
    ['小屋故事(简体版).epub','故事',30000,'',folder],
    ['小屋故事(简体版).txt','故事',20000,'',folder,'https://example.com/book']
  ];
  writeFileSync(path,gzipSync(JSON.stringify({share,files:rows})));
  const source=new BookSource(null,{quarkIndexPath:path});
  const found=(await source.searchAll('小屋故事')).quark;
  assert.equal(found.length,3);
  for(const book of found){
    assert.equal(book.fileLink,book.format==='MOBI');
    assert.equal(book.url,book.fileLink?'https://pan.quark.cn/s/book':share+'#/list/share/'+folder);
  }
});
