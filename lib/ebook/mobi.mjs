import {BOOK_LIMITS, textChapters} from '../../public/book-text.js';

function valid(condition, message='MOBI 文件结构不完整，请换一个版本') {
  if (!condition) throw new Error(message);
}

// MOBI text records may end with index entries and a repeated partial character.
function textRecord(record, flags) {
  let end = record.length;
  for (let entries = flags >>> 1; entries; entries >>>= 1) {
    if (!(entries & 1)) continue;
    let size = 0, shift = 0, byte;
    do {
      valid(shift < 28 && end > shift / 7);
      byte = record[end - 1 - shift / 7];
      size += (byte & 127) * 2 ** shift;
      shift += 7;
    } while (!(byte & 128));
    valid(size >= shift / 7 && size <= end);
    end -= size;
  }
  if (flags & 1) {
    valid(end > 0);
    end -= 1 + (record[end - 1] & 3);
    valid(end >= 0);
  }
  return record.subarray(0, end);
}

function unpack(record, output, start) {
  let at = start;
  function put(byte) {
    valid(at < output.length);
    output[at++] = byte;
  }
  for (let i=0; i<record.length;) {
    const code = record[i++];
    if (code >= 1 && code <= 8) {
      valid(i + code <= record.length);
      for (let n=0; n<code; n++) put(record[i++]);
    } else if (code < 128) {
      put(code);
    } else if (code >= 192) {
      put(32);
      put(code ^ 128);
    } else {
      valid(i < record.length);
      const pair = ((code & 63) << 8) | record[i++];
      const distance = pair >>> 3;
      valid(distance > 0 && distance <= at - start);
      for (let n=0; n<(pair & 7)+3; n++) put(output[at-distance]);
    }
  }
  return at;
}

function plainText(html) {
  const entities = {nbsp:' ', amp:'&', lt:'<', gt:'>', quot:'"', apos:"'", hellip:'…', mdash:'—', ldquo:'“', rdquo:'”', lsquo:'‘', rsquo:'’'};
  return html.replace(/<!--[\s\S]*?-->|<(head|style|script)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
    .replace(/<\/?(?:p|br|div|h[1-6]|li|blockquote|mbp:pagebreak)\b[^>]*>/gi,'\n')
    .replace(/<[^<>]+>/g,'')
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(original, ref)=>{
      if (!ref.startsWith('#')) return entities[ref.toLowerCase()] ?? original;
      const point = ref[1].toLowerCase()==='x' ? parseInt(ref.slice(2),16) : Number(ref.slice(1));
      return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : '';
    }).replace(/\n\s*\n/g,'\n');
}

export function parseMobi(bytes, filename) {
  valid(bytes.length >= 86 && bytes.length <= 10*1024*1024, 'MOBI 最大 10 MB，请选择完整的单本文件');
  const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16 = at=>view.getUint16(at), u32 = at=>view.getUint32(at);
  const ascii = (at,n)=>String.fromCharCode(...bytes.subarray(at,at+n));
  valid(ascii(60,8)==='BOOKMOBI');
  const count = u16(76), tableEnd = 78 + 8*count;
  valid(count >= 2 && tableEnd <= bytes.length);
  const offsets = Array.from({length:count},(_,i)=>u32(78+8*i));
  offsets.push(bytes.length);
  valid(offsets[0]>=tableEnd && offsets.every((v,i)=>!i || v>=offsets[i-1]));
  const h = offsets[0], headerEnd = offsets[1];
  valid(headerEnd-h>=108 && ascii(h+16,4)==='MOBI');
  const headerSize = u32(h+20);
  valid(headerSize >= 92 && h+16+headerSize <= headerEnd);
  valid(!u16(h+12),'此 MOBI 有加密保护，请选择可导入的 EPUB 或 TXT');
  const compression = u16(h);
  valid(u32(h+104)<8 && (compression===1 || compression===2),'暂不支持这种 MOBI 编码，请选择 EPUB 或 TXT');
  const length = u32(h+4), records = u16(h+8), flags = headerSize>=228 ? u16(h+242) : 0;
  valid(length>0 && length<=8*1024*1024 && records>0 && records<count,'MOBI 正文缺失或过大，请选择小一点的版本');
  const encoding = {65001:'utf-8',1252:'windows-1252'}[u32(h+28)];
  valid(encoding,'暂不支持这种 MOBI 字符编码，请选择 EPUB 或 TXT');
  const decoder = new TextDecoder(encoding,{fatal:true});
  const output = new Uint8Array(length);
  let position = 0;
  for (let i=1; i<=records; i++) {
    const record = textRecord(bytes.subarray(offsets[i],offsets[i+1]),flags);
    if (compression===2) position = unpack(record,output,position);
    else {
      valid(position+record.length<=length);
      output.set(record,position);
      position+=record.length;
    }
  }
  valid(position===length);
  const titleAt = h+u32(h+84), titleSize = u32(h+88);
  const title = titleSize && titleAt+titleSize<=headerEnd ? decoder.decode(bytes.subarray(titleAt,titleAt+titleSize)) : '';
  const chapters = textChapters(plainText(decoder.decode(output)));
  const book = {title:(title.trim() || filename.replace(/\.mobi$/i,'')).slice(0,160),chapters};
  valid(chapters.length && chapters.length<=BOOK_LIMITS.chapters && new TextEncoder().encode(JSON.stringify(book)).length<=BOOK_LIMITS.bytes,'没有可读文字或正文超过 2 MB，请换个版本');
  return book;
}
