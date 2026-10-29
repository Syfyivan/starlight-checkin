importScripts('./vendor/ebook-parser.js');
self.onmessage=async({data})=>{try{const book=await StarlightEbooks.parseEpub(new Uint8Array(data));self.postMessage({book});}catch(e){self.postMessage({error:e.message||'这本书暂时解析不了，请换成 TXT 试试'});}};
