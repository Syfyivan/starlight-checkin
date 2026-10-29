export class DomainError extends Error {constructor(code,message){super(message);this.code=code;}}
export function requireValue(ok,code,message){if(!ok)throw new DomainError(code,message);}
