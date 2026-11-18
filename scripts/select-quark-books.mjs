import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {isSimplifiedEdition} from '../lib/quark-books.mjs';
import {simplify} from '../public/vendor/book-display.js';

const MiB=1024*1024;
const fold=text=>simplify(text.normalize('NFKC')).toLowerCase();
const compact=text=>text.replace(/[\s_·•・]+/gu,'');
const aliases=new Map([['孤女飘零记','简爱'],['海蒂','小海蒂']]);

function identity(name){
  const stem=fold(name.replace(/\.[^.]+$/,'')).replace(/_/g,' ');
  const withoutScript=stem.replace(/\((?:(?:中文)?简体(?:中文)?(?:版|字版)?|zh[- ]hans|simplified[\s-]+chinese)\)/g,'');
  const [label,credit='']=withoutScript.split(/\s+(?:--?|by)\s+/i,2);
  // Volume tags and subtitles describe distinct contents. Strip only recognizable
  // catalog/format annotations, not arbitrary text inside parentheses.
  const title=label.replace(/^【精排】/,'').replace(/(?<=[^\d])\d{5,8}$/,'')
    .replace(/\((?:[^()]*(?:书系|文集|丛书|名著精选|译文经典|经典译林)|简体版|繁体版|精排版|插图版)\)/g,'')
    .replace(/中文[简繁]体|单行排版|\bv\d+\.\d+\b/g,'')
    .replace(/\s+(?:\[(?:英|美|德|日|法)\]).*$/,'').trim();
  const key=compact(title.replace(/\((?:译者[:：][^()]+|[\p{L}·]{2,16}[译譯](?:本)?)\)/gu,''))||compact(stem);
  const authorCredit=credit.includes('著')?credit.split('著')[0]:/译(?:本)?$/.test(credit)?'':credit;
  const author=compact(authorCredit.replace(/^(?:\([^)]{1,4}\)|\[[^\]]{1,4}\]|【[^】]{1,4}】)/,'')
    .replace(/\([^)]*\)?\s*$/,''));
  return {key:aliases.get(key)||key,author};
}

function pick(rows){
  // First keep the smallest usable file. Additional copies must meet progressively
  // smaller limits; try a different format among candidates of the same size tier.
  const sorted=rows.slice().sort((a,b)=>a[2]-b[2] || a[0].localeCompare(b[0],'zh-CN') || a[1].localeCompare(b[1],'zh-CN'));
  const selected=[sorted.shift()];
  const ext=row=>row[0].split('.').pop().toLowerCase();
  const translator=row=>fold(row[0]).match(/(?:译者[:：]([^()，,]+)|([\p{L}·]{2,16})译(?:本)?[)）])/u)?.slice(1).find(Boolean)||'';
  const signature=row=>[ext(row),row[2],translator(row)].join(':');
  for(const limit of [5*MiB,MiB]){
    if(selected.some(row=>row[2]>limit))break;
    const choices=sorted.filter(row=>row[2]<=limit && !selected.some(other=>signature(other)===signature(row)));
    if(!choices.length)break;
    // Prefer the small tier when possible so a medium alternate cannot displace
    // the third genuinely small edition.
    const small=choices.filter(row=>row[2]<=MiB);
    const pool=small.length?small:choices;
    const differentTranslation=pool.find(row=>translator(row) && selected.every(other=>translator(row)!==translator(other)));
    selected.push(differentTranslation || pool.find(row=>selected.every(other=>ext(other)!==ext(row))) || pool[0]);
  }
  return selected;
}

export function selectQuarkBooks(rows){
  const byTitle=new Map();
  for(const row of rows){
    if(!isSimplifiedEdition(row[0]))continue;
    const {key,author}=identity(row[0]);
    if(!byTitle.has(key))byTitle.set(key,new Map());
    const groups=byTitle.get(key);
    if(!groups.has(author))groups.set(author,[]);
    groups.get(author).push(row);
  }
  const files=[];
  let works=0;
  for(const [key,groups] of byTitle){
    const base=key.replace(/\(\d+\)$/u,'');
    const unclearVolume=base!==key && byTitle.has(base);
    const authors=[...groups.keys()].filter(Boolean);
    // A missing credit can join a single known author. If the title refers to
    // several authors, keep their files separate and flag the unknown credit.
    const editions=authors.length<=1 ? [[...groups.values()].flat()] : [...groups.values()];
    for(const edition of editions){
      works++;
      let note=unclearVolume?'文件名带序号 · 分卷待核':'';
      if(authors.length>1)note=groups.get('')===edition?'同名书 · 作者待核':'同名书 · 请核对作者';
      for(const row of pick(edition)){
        const [name,folder,size,parentId]=row;
        const file=[name,folder,size];
        if(note || parentId)file.push(note);
        if(parentId)file.push(parentId);
        files.push(file);
      }
    }
  }
  return {works,files};
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  process.stdout.write(JSON.stringify(selectQuarkBooks(JSON.parse(readFileSync(0,'utf8')))));
}
