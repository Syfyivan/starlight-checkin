// Keep the startup path compatible with older Android WebViews (Chromium 80+).
// Use the same cryptographic source when randomUUID is not yet available.
export function requestId(source=globalThis.crypto){
  if(typeof source?.randomUUID==='function')return source.randomUUID();
  if(typeof source?.getRandomValues!=='function')throw new Error('安全连接尚未准备好，请重新打开小屋');
  const bytes=source.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join('-');
}

// Include JSON body reading in the timeout, and release the timer on every path.
export async function fetchJSON(url,options={},timeout=25000){
  const controller=new AbortController();let expired=false;
  const timer=setTimeout(()=>{expired=true;controller.abort();},timeout);
  try{
    const response=await fetch(url,{...options,signal:controller.signal});
    const data=await response.json();return {response,data};
  }catch(error){
    if(expired)throw new Error('连接有点慢，请检查网络后再试一次');
    throw error;
  }finally{clearTimeout(timer);}
}
