importScripts('./vendor/ebook-parser.js');
self.onmessage=async({data})=>{
  try{
    const bytes=new Uint8Array(data.buffer??data);
    const book=/\.mobi$/i.test(data.name||'')
      ? StarlightEbooks.parseMobi(bytes,data.name)
      : await StarlightEbooks.parseEpub(bytes);
    self.postMessage({book});
  }catch(e){self.postMessage({error:e.message||'这本书暂时解析不了，请换成 TXT 试试'});}
};
