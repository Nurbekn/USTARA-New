// QR destinations are generated server-side. Supply only the supported
// frontend mount path and a public, allowlisted locale; never pass token/session.
export const SUPPORTED_QR_BASES=Object.freeze(['/', '/USTARA-New/']);
export const SUPPORTED_QR_LANGUAGES=Object.freeze(['uz','ru','en']);
export function qrSiteDestination(origin,basePath,lang){
 if(typeof origin!=='string'||origin.length>240||
    !/^https?:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(origin)||
    !SUPPORTED_QR_BASES.includes(basePath)||
    !SUPPORTED_QR_LANGUAGES.includes(lang))
   throw new Error('QR sayt manzili yoki tili noto‘g‘ri.');
 return {origin,base_path:basePath,lang};
}
