// Adapted from the user-owned Syfyivan/myEpubReader server/core/text.mjs.
import { XMLParser, XMLValidator } from 'fast-xml-parser';
import { requireValue, DomainError } from './errors.mjs';

const parser = new XMLParser({ preserveOrder: true, ignoreAttributes: false, removeNSPrefix: true, trimValues: false, parseTagValue: false, processEntities: true, htmlEntities: true });
const blocks = new Set(['p', 'div', 'section', 'article', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'tr', 'figcaption']);
const ignored = new Set(['script', 'style', 'head', 'iframe', 'object', 'embed', 'noscript']);

export function xml(source, label) {
  requireValue(!/<!ENTITY\s/i.test(source), 'XML_ENTITY', `${label}不支持自定义实体`);
  requireValue(source.length<=2*1024*1024,'XML_LIMIT','章节太大啦');
  let depth=0,count=0;for(const m of source.matchAll(/<\/?[a-zA-Z][^>]*>/g)){if(m[0].startsWith('</'))depth--;else if(!m[0].endsWith('/>'))depth++;requireValue(depth<=100&&++count<=100000,'XML_LIMIT','章节结构过于复杂');}
  const valid = XMLValidator.validate(source, { allowBooleanAttributes: true });
  requireValue(valid === true, 'INVALID_XML', `${label}不是有效XML`, valid === true ? null : valid.err);
  return parser.parse(source);
}

export function elements(nodes, name, deep = true) {
  const found = [];
  for (const node of nodes || []) {
    for (const [key, children] of Object.entries(node)) {
      if (key === name) found.push({ children, attributes: node[':@'] || {} });
      if (deep && Array.isArray(children)) found.push(...elements(children, name, true));
    }
  }
  return found;
}

export function textOf(nodes) {
  let result = '';
  for (const node of nodes || []) {
    if (node['#text'] !== undefined) result += String(node['#text']);
    for (const [key, children] of Object.entries(node)) {
      if (Array.isArray(children) && !ignored.has(key)) result += textOf(children);
    }
  }
  return result;
}

export function resourcePath(base, href) {
  requireValue(typeof href === 'string' && href.length > 0, 'INVALID_PATH', '资源路径为空');
  requireValue(!/^[a-z][a-z\d+.-]*:/i.test(href) && !href.startsWith('//'), 'EXTERNAL_RESOURCE', '不加载远程资源');
  let decoded;
  try { decoded = decodeURIComponent(href.split(/[?#]/)[0]); }
  catch { throw new DomainError('INVALID_PATH', '资源路径编码无效'); }
  requireValue(!decoded.includes('\\') && !decoded.includes('\0') && !decoded.startsWith('/'), 'INVALID_PATH', '资源路径无效');
  const parts=base.split('/').slice(0,-1);
  for(const part of decoded.split('/')){if(part==='..'){requireValue(parts.length>0,'PATH_ESCAPE','资源路径越过书籍根目录');parts.pop();}else if(part&&part!=='.')parts.push(part);}
  const result=parts.join('/');
  requireValue(result !== '..' && !result.startsWith('../'), 'PATH_ESCAPE', '资源路径越过书籍根目录');
  return result;
}

export function normalizeText(value) {
  return String(value).replace(/\r\n?/g, '\n').replace(/[\t\u00a0 ]+/g, ' ').replace(/ *\n */g, '\n').trim();
}

export function extractChapter(source, chapterPath,{wikisource=false}={}) {
  const tree = xml(source, chapterPath);
  const roots = elements(tree, 'body');
  requireValue(roots.length > 0, 'MISSING_BODY', `章节缺少正文：${chapterPath}`);
  let text = '';
  const runs = [];
  const anchors = {};
  const images = [];
  const links = [];
  const boundary = () => {
    if (text && !text.endsWith('\n')) text += '\n';
  };
  function walk(nodes, route) {
    nodes.forEach((node, index) => {
      const position = `${route}/${index}`;
      if (node['#text'] !== undefined) {
        const raw = String(node['#text']);
        const normalized = raw.replace(/[\s\u00a0]+/g, ' ');
        const value = text.endsWith('\n') || !text ? normalized.trimStart() : normalized;
        if (value) {
          runs.push({ path: position, start: text.length, end: text.length + value.length, rawLength: raw.length });
          text += value;
        }
      }
      for (const [tag, children] of Object.entries(node)) {
        if (!Array.isArray(children) || ignored.has(tag)) continue;
        const attrs = node[':@'] || {};
        if(wikisource&&String(attrs['@_class']||'').split(/\s+/).some(c=>['ws-header','ws-noexport','noprint','sistersitebox','sister-wikipedia','mw-editsection','navbox','wst-header'].includes(c)))continue;
        if (blocks.has(tag)) boundary();
        if (attrs['@_id']) anchors[attrs['@_id']] = text.length;
        if (tag === 'br') boundary();
        if (tag === 'img' && attrs['@_src']) {
          try { images.push({ path: resourcePath(chapterPath, attrs['@_src']), alt: attrs['@_alt'] || '', offset: text.length }); }
          catch { /* External resources are intentionally not fetched. */ }
        }
        if (tag === 'a' && attrs['@_href']) links.push({ href: attrs['@_href'], start: text.length, label: textOf(children) });
        walk(children, `${position}/${tag}`);
        if (blocks.has(tag)) boundary();
      }
    });
  }
  walk(roots[0].children, 'body');
  text = text.trimEnd();
  const paragraphs = [];
  let offset = 0;
  for (const value of text.split('\n')) {
    if (value.trim()) paragraphs.push({ start: offset, end: offset + value.length, text: value });
    offset += value.length + 1;
  }
  return { text, runs: runs.filter(r => r.start < text.length).map(r => ({ ...r, end: Math.min(r.end, text.length) })), anchors, images, links, paragraphs };
}
