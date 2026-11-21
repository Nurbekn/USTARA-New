'use strict';
// A QR must point at the actual SPA mount path. Never accept arbitrary
// redirected paths, hosts, encodings or untrusted request URL fragments.
const BASE_PATHS=Object.freeze(['/', '/USTARA-New/']);
const LANGUAGES=Object.freeze(['uz','ru','en']);
function validBasePath(value){
 if(value===undefined)return '/'; // backwards-compatible local/dev callers
 if(typeof value!=='string'||!BASE_PATHS.includes(value))
  throw Object.assign(new Error('QR sayt yo‘li noto‘g‘ri.'),{status:400,code:'invalid_base_path'});
 return value;
}
function validLanguage(value){
 if(value===undefined)return null;
 if(typeof value!=='string'||!LANGUAGES.includes(value))
  throw Object.assign(new Error('QR tili noto‘g‘ri.'),{status:400,code:'invalid_lang'});
 return value;
}
function publicQueueLink(origin,token,{base_path,lang}={}){
 const prefix=validBasePath(base_path),locale=validLanguage(lang);
 // origin is already authenticated against CORS_ALLOWED_ORIGINS by publicOrigin.
 // Independently restrict our own inputs so this helper cannot become an open redirect.
 if(typeof origin!=='string'||!/^https?:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(origin)||
    typeof token!=='string'||!/^[a-f0-9]{48}$/.test(token))
  throw Object.assign(new Error('QR havolasi noto‘g‘ri.'),{status:400,code:'invalid_qr_link'});
 return `${origin}${prefix}queue/check-in/${token}${locale?`?lang=${locale}`:''}`;
}
module.exports={BASE_PATHS,LANGUAGES,validBasePath,validLanguage,publicQueueLink};
