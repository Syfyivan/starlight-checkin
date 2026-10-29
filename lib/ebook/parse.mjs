// Adapted from Syfyivan/myEpubReader; runs in an isolated browser or server worker.
import JSZip from 'jszip';
import {textChapters} from '../../public/book-text.js';
import { xml, elements, textOf, resourcePath, extractChapter, normalizeText } from './text.mjs';
import { requireValue, DomainError } from './errors.mjs';

const LIMITS = { bytes: 10 * 1024 * 1024, files: 3000, expanded: 64 * 1024 * 1024, file: 8 * 1024 * 1024, chapters: 500 };

function centralDirectory(bytes, maxFileBytes=LIMITS.file) {
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),u16=n=>view.getUint16(n,true),u32=n=>view.getUint32(n,true);
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
    if (u32(i) === 0x06054b50 && i + 22 + u16(i + 20) === bytes.length) { end = i; break; }
  }
  requireValue(end >= 0, 'INVALID_ZIP', 'ZIP目录不存在');
  requireValue(u16(end + 4) === 0 && u16(end + 6) === 0, 'UNSUPPORTED_ZIP', '不支持分卷ZIP');
  const count = u16(end + 10);
  let position = u32(end + 16);
  requireValue(count > 0 && count <= LIMITS.files, 'ZIP_LIMIT', '归档文件数量超限');
  requireValue(u16(end+8)===count&&position+u32(end+12)===end,'INVALID_ZIP','ZIP目录范围或文件计数不一致');
  let total = 0;
  const names = new Set();
  for (let i = 0; i < count; i++) {
    requireValue(position + 46 <= end && u32(position) === 0x02014b50, 'INVALID_ZIP', 'ZIP目录损坏');
    const flags = u16(position + 8);
    const size = u32(position + 24);
    const nameLength = u16(position + 28);
    const extra = u16(position + 30);
    const comment = u16(position + 32);
    requireValue(!(flags & 1), 'ENCRYPTED_ZIP', '不支持加密书籍');
    requireValue(size <= maxFileBytes, 'ZIP_LIMIT', '单个资源解压大小超限');
    requireValue(position + 46 + nameLength + extra + comment <= end, 'INVALID_ZIP', 'ZIP目录越界');
    const name = new TextDecoder().decode(bytes.subarray(position+46,position+46+nameLength));
    requireValue(!name.startsWith('/') && !name.includes('\\') && !name.split('/').includes('..') && !name.includes('\0'), 'ZIP_PATH', '归档包含不安全路径');
    requireValue(!names.has(name), 'DUPLICATE_RESOURCE', '归档包含同名资源');
    names.add(name);
    total += size;
    requireValue(total <= LIMITS.expanded, 'ZIP_LIMIT', '书籍解压总大小超限');
    position += 46 + nameLength + extra + comment;
  }
  requireValue(position===end,'INVALID_ZIP','ZIP目录文件计数不一致');
  return { count, total };
}

export async function parseEpub(bytes, { signal, progress = () => {},wikisource=false,sourceArchive=false } = {}) {
  requireValue(bytes instanceof Uint8Array && bytes.length <= LIMITS.bytes, 'FILE_LIMIT', 'EPUB 最大 10 MB');
  // Some publishers distribute one EPUB inside a ZIP. Never recurse or expand
  // unrelated members; check both declared size and actual streamed output.
  if(sourceArchive){
    centralDirectory(bytes,LIMITS.bytes);
    const outer=await JSZip.loadAsync(bytes,{checkCRC32:false});
    // Some download names end in .zip although the root is already an EPUB.
    if(!outer.file('mimetype')||!outer.file('META-INF/container.xml')){
    const candidates=Object.values(outer.files).filter(f=>!f.dir&&!f.name.startsWith('__MACOSX/')&&/\.epub$/i.test(f.name));
    requireValue(candidates.length===1,'SOURCE_ARCHIVE','书源压缩包需要恰好一本 EPUB');
    bytes=await new Promise((resolve,reject)=>{
      const chunks=[];let size=0,stopped=false;
      const stream=candidates[0].internalStream('uint8array');
      stream.on('data',chunk=>{
        size+=chunk.length;
        if(size>LIMITS.bytes){stopped=true;stream.pause();reject(new DomainError('FILE_LIMIT','EPUB 最大 10 MB'));return;}
        chunks.push(chunk);
      }).on('error',reject).on('end',()=>{
        if(stopped)return;const result=new Uint8Array(size);let offset=0;
        for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}resolve(result);
      }).resume();
    });
    }
  }
  const inventory = centralDirectory(bytes);
  signal?.throwIfAborted();
  let zip;
  try { zip = await JSZip.loadAsync(bytes, { checkCRC32: false }); }
  catch { throw new DomainError('INVALID_ZIP', '无法解压书籍或校验失败'); }
  let extractedBytes=0;
  async function read(name) {
    const file=zip.file(name);requireValue(file,'MISSING_RESOURCE','资源不存在：'+name);
    // Bound actual decompressed output too; ZIP headers alone are untrusted.
    return new Promise((resolve,reject)=>{
      const chunks=[];let bytes=0,stopped=false;
      const stream=file.internalStream('uint8array');
      stream.on('data',chunk=>{bytes+=chunk.length;extractedBytes+=chunk.length;
        if(bytes>2*1024*1024||extractedBytes>8*1024*1024){stopped=true;stream.pause();reject(new DomainError('RESOURCE_LIMIT','正文太大，请拆分后再导入'));return;}
        chunks.push(chunk);
      }).on('error',reject).on('end',()=>{if(stopped)return;const result=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){result.set(chunk,offset);offset+=chunk.length;}try{resolve(new TextDecoder('utf-8',{fatal:true}).decode(result));}catch(e){reject(new DomainError('TEXT_ENCODING','章节不是 UTF-8 编码，请转换为 TXT 后导入'));}}).resume();
    });
  }
  requireValue((await read('mimetype')).trim() === 'application/epub+zip', 'INVALID_EPUB', '文件不是EPUB');
  const container = xml(await read('META-INF/container.xml'), 'container.xml');
  const root = elements(container, 'rootfile').find(r => r.attributes['@_media-type'] === 'application/oebps-package+xml');
  requireValue(root, 'MISSING_PACKAGE', '找不到OPF包文件');
  const opfPath = resourcePath('root', root.attributes['@_full-path']);
  const tree = xml(await read(opfPath), opfPath);
  const pkg = elements(tree, 'package')[0];
  requireValue(pkg, 'INVALID_PACKAGE', 'OPF缺少package');
  const version = String(pkg.attributes['@_version'] || '');
  requireValue(version.startsWith('2') || version.startsWith('3'), 'EPUB_VERSION', '仅支持EPUB 2和3');
  const metadata = elements(tree, 'metadata')[0]?.children || [];
  const field = name => normalizeText(textOf(elements(metadata, name).flatMap(n => n.children)));
  const manifestNodes = elements(elements(tree, 'manifest')[0]?.children, 'item', false);
  const manifest = manifestNodes.map(({ attributes: a }) => ({ id: a['@_id'], path: resourcePath(opfPath, a['@_href']), type: a['@_media-type'], properties: String(a['@_properties'] || '').split(/\s+/) }));
  const ids = new Set();
  const warnings = [];
  for (const item of manifest) {
    requireValue(item.id && !ids.has(item.id), 'MANIFEST_ID', '资源标识缺失或重复');
    ids.add(item.id);
    if (!zip.file(item.path)) warnings.push({ code: 'MISSING_RESOURCE', path: item.path });
  }
  const spine = elements(elements(tree, 'spine')[0]?.children, 'itemref', false);
  requireValue(spine.length > 0 && spine.length <= LIMITS.chapters, 'SPINE_LIMIT', '章节数量不合法');
  if(zip.file('META-INF/encryption.xml')){
    // The text reader never reads or decodes font files. Permit only the EPUB
    // standard's font-obfuscation declarations; encrypted text stays unsupported.
    let declarations;
    try{declarations=elements(xml(await read('META-INF/encryption.xml'),'encryption.xml'),'EncryptedData');}
    catch{throw new DomainError('ENCRYPTED_EPUB','无法核实书籍加密声明');}
    requireValue(declarations.length>0,'ENCRYPTED_EPUB','无法核实书籍加密声明');
    for(const declaration of declarations){
      const methods=elements(declaration.children,'EncryptionMethod'),refs=elements(declaration.children,'CipherReference');
      requireValue(methods.length===1&&methods[0].attributes['@_Algorithm']==='http://www.idpf.org/2008/embedding'&&refs.length===1,'ENCRYPTED_EPUB','暂不支持加密正文');
      const path=resourcePath('root',refs[0].attributes['@_URI']),item=manifest.find(m=>m.path===path);
      requireValue(item&&['font/otf','font/ttf','font/woff','font/woff2','application/vnd.ms-opentype','application/x-font-ttf','application/x-font-opentype','application/font-sfnt','application/font-woff'].includes(item.type)&&!spine.some(s=>s.attributes['@_idref']===item.id),'ENCRYPTED_EPUB','暂不支持加密正文');
    }
  }
  const chapters = [];
  for (let i = 0; i < spine.length; i++) {
    signal?.throwIfAborted();
    const item = manifest.find(m => m.id === spine[i].attributes['@_idref']);
    requireValue(item, 'SPINE_REFERENCE', '阅读顺序引用不存在的资源');
    if(wikisource&&item.id==='title')continue;
    requireValue(['application/xhtml+xml', 'text/html'].includes(item.type), 'CHAPTER_TYPE', '暂仅支持可重排XHTML章节');
    const document = await read(item.path);
    const extracted = extractChapter(document, item.path,{wikisource});
    if(wikisource)requireValue(!/(?:此文[档檔]未完成|原作[內内]容[還还]未[录錄]入)/.test(extracted.text.slice(0,1000)),'INCOMPLETE_SOURCE','这个版本尚未收齐正文，请选择其他版本');
    const pageTitle=wikisource?normalizeText(textOf(elements(xml(document,item.path),'title').flatMap(n=>n.children))):'';
    chapters.push({ path: item.path, ordinal: i, title: wikisource&&item.id==='about'?'来源与许可':pageTitle||extracted.paragraphs[0]?.text.slice(0, 100) || `第${i + 1}章`, text:extracted.text, anchors:extracted.anchors, linear: spine[i].attributes['@_linear'] !== 'no' });
    progress({ stage: 'chapters', completed: i + 1, total: spine.length });
  }
  const split=chapters.filter(c=>c.text.trim()).flatMap(c=>textChapters(c.text,c.title));
  const result={title:field('title')||'未命名书籍',author:elements(metadata,'creator').map(n=>normalizeText(textOf(n.children))).join('、'),chapters:split};
  requireValue(split.length>0&&split.length<=500,'BOOK_LIMIT','正文太多或没有可读文字');
  requireValue(new TextEncoder().encode(JSON.stringify(result)).length<=2*1024*1024,'BOOK_LIMIT','提取的正文超过 2 MB，请拆分导入');
  return result;
}
