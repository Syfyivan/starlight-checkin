import * as OpenCC from 'opencc-js/t2cn';
const converter=OpenCC.Converter({from:'t',to:'cn'});
export const simplify=text=>converter(String(text));
