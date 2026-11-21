'use strict';
// Read-only Admin operations rollout. 0 = disabled; 100 = all active admins.
// A stable bucket makes partial rollouts reproducible across API instances.
const crypto = require('node:crypto');
function parseRollout(value) {
  if(value===undefined || value===null || value==='') return 100;
  if(typeof value!=='string' || !/^(?:0|[1-9]\d?|100)$/.test(value)) return 0;
  return Number(value);
}
function enabledForAdmin(adminId, env=process.env) {
  if(!Number.isSafeInteger(adminId)||adminId<=0) return false;
  const percentage=parseRollout(env.USTARA_ADMIN_READONLY_ROLLOUT);
  if(percentage===0)return false;
  if(percentage===100)return true;
  // no secret returned to clients; salt is a non-sensitive per-install setting
  const seed=String(env.USTARA_ADMIN_ROLLOUT_SEED || 'ustara-v165-admin-operations');
  const digest=crypto.createHash('sha256').update(`${seed}:${adminId}`).digest();
  return digest.readUInt32BE(0) % 100 < percentage;
}
module.exports={parseRollout,enabledForAdmin};
