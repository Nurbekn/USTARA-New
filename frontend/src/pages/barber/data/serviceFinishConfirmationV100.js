// #157: an explicit two-choice confirmation before irrevocably completing service.
// Client checks improve UX; the API still enforces ownership and status in PostgreSQL.
import {finishIntent} from './queueMutationIntentV94.js';

export const SERVICE_FINISH_CONFIRM_MAX_AGE_MS = 30_000;

export function createServiceFinishConfirmation(entry,session,epoch,now=Date.now()) {
  if(session?.role!=='barber'||typeof session.token!=='string'||!session.token
     || !Number.isSafeInteger(epoch)||epoch<0 || !Number.isFinite(now)||now<0) return null;
  const intent=finishIntent(entry,'served');
  if(!intent || entry.status!=='in_service')return null;
  return {id:intent.id,status:'in_service',token:session.token,epoch,createdAt:now};
}

export function confirmServiceFinish(pending,entry,session,epoch,now=Date.now()) {
  if(!pending || !Number.isFinite(now)||now<pending.createdAt
     || now-pending.createdAt>SERVICE_FINISH_CONFIRM_MAX_AGE_MS
     || !Number.isSafeInteger(epoch) || pending.epoch!==epoch
     || session?.role!=='barber' || !session.token || pending.token!==session.token)
    return null;
  const intent=finishIntent(entry,'served');
  return intent&&entry.status===pending.status&&intent.id===pending.id ? intent : null;
}

export function keepServiceFinishConfirmation(pending,active) {
  if(!pending)return null;
  if(!Array.isArray(active))return null;
  return active.some(row=>row.status==='in_service'
    && finishIntent(row,'served')?.id===pending.id) ? pending : null;
}
