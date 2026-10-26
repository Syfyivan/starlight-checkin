// Accept a shared link or a formatted code without navigating to pasted URLs.
export function readInviteCode(value){
  let code=String(value||'').trim();
  if(/^https?:\/\//i.test(code)){
    try{code=new URLSearchParams(new URL(code).hash.slice(1)).get('join')||'';}catch{code='';}
  }
  code=code.replace(/[\s-]/g,'').toLowerCase();
  if(!/^[a-f0-9]{24}$/.test(code))throw new Error('粘贴完整的 24 位邀请码，或朋友发来的邀请链接就好。');
  return code;
}
