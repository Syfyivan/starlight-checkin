// Shared by the local importer and the server. Only plain text is kept.
export const BOOK_LIMITS={bytes:2*1024*1024,chapters:500,chapter:24000};
export const cleanBookText=value=>String(value||'').normalize('NFC').replace(/\r\n?/g,'\n').replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g,'').trim();
export function textChapters(text,title='正文'){
  const lines=cleanBookText(text).split('\n'),chapters=[];let name=title,chunk='';
  const flush=()=>{if(chunk.trim())chapters.push({title:name.slice(0,120),text:chunk.trim()});chunk='';};
  for(const line of lines){
    if(/^(?:#{1,4}\s+.{1,80}|第[一二三四五六七八九十百千零\d]+[章回卷节部].{0,70}|chapter\s+[\divxlc]+.*)$/i.test(line.trim())){flush();name=line.replace(/^#+\s*/,'').trim();}
    for(let at=0;at<Math.max(1,line.length);at+=BOOK_LIMITS.chapter){const piece=line.slice(at,at+BOOK_LIMITS.chapter);if(chunk.length+piece.length+1>BOOK_LIMITS.chapter)flush();chunk+=piece+'\n';}
  }
  flush();return chapters;
}
