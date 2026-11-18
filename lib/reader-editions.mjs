import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {requireThat} from './store.mjs';

const data=name=>JSON.parse(readFileSync(new URL('./editions/'+name,import.meta.url),'utf8'));
const stories=data('childrens-stories.json');
const aliases=['简爱','簡愛','孤女飄零記','Jane Eyre','Charlotte Brontë'];
const storyName='全球非洲故事书';
const catalog=stories.books.map(s=>({id:'ed:story-'+s.id,title:s.title,author:s.author+' 著，'+s.translator+' 译',language:'中文',provider:storyName,format:'简体中文 · 儿童故事文字版',source_url:'https://github.com/global-asp/global-asp/blob/'+stories.revision+'/zh/'+encodeURIComponent(s.file)}));
const classicsName='中华古诗文数据库';
const classicsRevision='b8594f81a89752241442f2ce267d6f66f96704ee';
const classics=data('classics/index.json').map(s=>({
 id:'ed:classic-'+s.id,title:s.title,author:s.author,language:'中文',provider:classicsName,format:'中文文字版',
 source_url:'https://github.com/chinese-poetry/chinese-poetry/blob/'+classicsRevision+'/'+s.path.split('/').map(encodeURIComponent).join('/')
}));
const classicsLicense=readFileSync(new URL('./editions/classics/LICENSE.txt',import.meta.url),'utf8');
const official=[
 {title:'简·爱',author:'夏洛蒂·勃朗特 著，李继宏 译',aliases,reader:'https://read.douban.com/reader/ebook/125166031/'},
 {title:'小海蒂',author:'约翰娜·斯比丽 著',aliases:['海蒂','Heidi','约翰娜·施皮里'],reader:'https://read.douban.com/reader/ebook/9006101/'}
];
export function editionSearch(q,fold){
 const key=fold(q),match=values=>values.some(v=>fold(v).includes(key));
 if(!key)return {books:[],external:[]};
 const browse=['儿童故事','儿童读物','非洲故事',storyName].some(v=>fold(v)===key);
 const books=catalog.filter(b=>browse||match([b.title,b.author]));
 const browseClassics=['古诗文','国学经典',classicsName].some(v=>fold(v)===key);
 books.push(...classics.filter(b=>browseClassics||match([b.title,b.author])));
 const external=official.filter(b=>match([b.title,b.author,...b.aliases])).map(({title,author,reader})=>({title,author,url:reader}));
 return {books,external};
}
export function editionBook(id){
 const classic=classics.find(b=>b.id===id);
 if(classic){
  const file=new URL('./editions/classics/'+id.slice('ed:classic-'.length)+'.json.gz',import.meta.url);
  const content=JSON.parse(gunzipSync(readFileSync(file),{maxOutputLength:2*1024*1024}));
  content.push({title:'来源与许可',text:classicsName+'\n'+classic.source_url+'\n'+classicsLicense});
  return {source:{url:classic.source_url,name:classicsName},book:{title:classic.title,author:classic.author,chapters:content}};
 }
 const i=catalog.findIndex(b=>b.id===id);requireThat(i>=0,'请选择已收录的中文版本',404);
 const b=catalog[i],s=stories.books[i];
 return {source:{name:storyName,url:b.source_url},book:{title:b.title,author:b.author,chapters:[
  {title:b.title,text:s.paragraphs.join('\n\n')},
  {title:'来源与许可',text:['作者：'+s.author,'译者：'+s.translator,s.illustrator?'原版插画：'+s.illustrator:'','本版保留中文故事全文，按文字排版。','Global African Storybook Project',b.source_url,'CC BY · '+s.license].filter(Boolean).join('\n')}
 ]}};
}
