'use strict';
// Shared Node-only build configuration policy. This is NOT bundled into React.
const crypto = require('node:crypto');
function validateProductionApiBaseUrl(raw) {
  const invalid = () => { throw new Error('v57: HTTPS public API origin required; NOT PASS'); };
  if (typeof raw !== 'string' || raw.length<12 || raw.length>220 || raw!==raw.trim()) invalid();
  let value;
  try { value=new URL(raw); } catch { invalid(); }
  const host=value.hostname.toLowerCase();
  // Require a public DNS hostname. No loopback, literal IPs, local suffixes,
  // credentials, URL parameters, paths or other ambiguous build-time URLs.
  const labels=host.split('.');
  if (value.protocol!=='https:' || value.username || value.password ||
      value.pathname!=='/' || value.search || value.hash ||
      labels.length<2 || labels.some(x=>!(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))) ||
      !/^[a-z][a-z0-9-]*$/.test(labels.at(-1)) ||
      ['local','localhost','internal','test','invalid','example','lan','onion'].includes(labels.at(-1)) ||
      host.endsWith('.home.arpa') || host==='localhost') invalid();
  const canonical = value.origin;
  if (raw!==canonical && raw!==canonical+'/') invalid();
  return canonical;
}
function apiBaseSha256(raw) {
  return crypto.createHash('sha256').update(validateProductionApiBaseUrl(raw)).digest('hex');
}
module.exports={validateProductionApiBaseUrl,apiBaseSha256};
