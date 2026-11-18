import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {BookSource} from '../lib/book-source.mjs';
import {simplify} from '../public/vendor/book-display.js';

test('简体书库不打包旧书影，古诗文的章节和正文已按简体保存',()=>{
 const base=new URL('../lib/editions/',import.meta.url);
 assert.equal(existsSync(new URL('jane-eyre.pages',base)),false);
 for(const {id} of JSON.parse(readFileSync(new URL('classics/index.json',base)))){
   const chapters=JSON.parse(gunzipSync(readFileSync(new URL('classics/'+id+'.json.gz',base))));
   for(const {title,text} of chapters){
     assert.ok(simplify(title)===title && simplify(text)===text,id);
   }
 }
});

test('繁体或未核实字形的旧书目不能通过编号或缓存取回',async()=>{
 const source=new BookSource({get(){throw Error('不应读取旧缓存');}},{fetcher:()=>{throw Error('不应访问旧书源');}});
 for(const id of [23839,'ws:6','oa:dc-lunyu','oa:dc-lienvzhuan-hant','oa:hk-9789882379749','ed:jane-eyre']){
   await assert.rejects(source.download(id),e=>e.status===404);
 }
 assert.ok((await source.searchAll('')).books.some(b=>b.id==='ed:classic-lunyu'));
 assert.ok((await source.searchAll('論語')).books.some(b=>b.id==='ed:classic-lunyu'));
});
