// Project Gutenberg grants catalog metadata to the public domain.
// Downloads from the mirror listed at https://www.gutenberg.org/MIRRORS.ALL.
import {readFileSync,writeFileSync} from 'node:fs';
export function csvRows(text){const rows=[];let row=[],cell='',quote=false;for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(cell);cell='';}else if(c==='\n'&&!quote){row.push(cell.replace(/\r$/,''));rows.push(row);row=[];cell='';}else cell+=c;}if(cell||row.length){row.push(cell);rows.push(row);}return rows;}
const csv=process.argv[2]?readFileSync(process.argv[2],'utf8'):await (await fetch('https://gutenberg.pglaf.org/cache/epub/feeds/pg_catalog.csv',{signal:AbortSignal.timeout(60000)})).text();
const [head,...rows]=csvRows(csv),english=/^(Austen, Jane|Carroll, Lewis|Alcott, Louisa|Montgomery, L. M.|Burnett, Frances|Doyle, Arthur|Twain, Mark|Stevenson, Robert|Wells, H. G.|Verne, Jules|Dickens, Charles|Andersen, H. C.|Grimm, Jacob|Grimm, Wilhelm|Baum, L. Frank|Defoe, Daniel|Darwin, Charles|Dickinson, Emily|Potter, Beatrix|Grahame, Kenneth|Shelley, Mary)/;
const books=rows.map(r=>Object.fromEntries(head.map((h,i)=>[h,r[i]]))).filter(r=>{
 if(r.Type!=='Text'||!['zh','en'].includes(r.Language)||/Erotic|Pornograph|Sexual|金瓶|肉蒲|春宮|春宫|肉禪|肉禅/i.test(r.Title+' '+r.Subjects))return false;
 if(r.Language==='en'&&!english.test(r.Authors))return false;
 // Conservative author-date filter; the provider's rights record is checked again before importing.
 return r.Authors.split('; ').every(a=>/BCE|B\.C\./.test(a)||/active [1-9](?:th|st|nd|rd) century/.test(a)||/active 1[0-8]\d\d/.test(a)||(/-(\d{3,4})\??(?:\s*\[.*\])?$/.test(a)&&Number(a.match(/-(\d{3,4})\??(?:\s*\[.*\])?$/)[1])<=1950)||/^(Anonymous|Unknown)$/.test(a)&&/三字|千字|詩經|诗经|孝經|孝经/.test(r.Title));
 }).map(r=>({id:Number(r['Text#']),title:r.Title,author:r.Authors,language:r.Language==='zh'?'中文':'英文'}));
writeFileSync(new URL('../lib/book-catalog.json',import.meta.url),JSON.stringify({updated:new Date().toISOString().slice(0,10),source:'https://www.gutenberg.org/ebooks/offline_catalogs.html',books},null,1)+'\n');
console.log('Catalog:',books.length,'books;',books.filter(b=>b.language==='中文').length,'Chinese');
