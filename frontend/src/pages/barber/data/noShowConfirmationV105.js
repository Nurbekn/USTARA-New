// #152 — explicit no-show confirmation, tied to the currently observed call.
// Only the backend is authoritative: it checks actor/entry ownership, state and date.
import {finishIntent} from './queueMutationIntentV94.js';

export const NO_SHOW_CONFIRM_MAX_AGE_MS = 30_000;
const validDay = value => {
  if(typeof value!=='string'||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(value))return false;
  const date=new Date(`${value}T12:00:00Z`);
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
};
const validCallTime = value => typeof value==='string' &&
  /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value));
const observedCall = entry => {
  const intent=finishIntent(entry,'missed');
  if(!intent||entry?.status!=='called'||!validDay(entry.queue_date)||!validCallTime(entry.called_at))return null;
  return {id:intent.id,status:'called',queueDate:entry.queue_date,calledAt:entry.called_at};
};
export function createNoShowConfirmation(entry,session,epoch,now=Date.now()) {
  if(session?.role!=='barber'||typeof session.token!=='string'||!session.token
    ||!Number.isSafeInteger(epoch)||epoch<0||!Number.isFinite(now)||now<0)return null;
  const observed=observedCall(entry);
  return observed?{...observed,token:session.token,epoch,createdAt:now}:null;
}
export function confirmNoShow(pending,entry,session,epoch,now=Date.now()) {
  if(!pending||!Number.isFinite(now)||now<pending.createdAt
    ||now-pending.createdAt>NO_SHOW_CONFIRM_MAX_AGE_MS
    ||!Number.isSafeInteger(epoch)||pending.epoch!==epoch
    ||session?.role!=='barber'||typeof session.token!=='string'||!session.token
    ||pending.token!==session.token)return null;
  const observed=observedCall(entry);
  if(!observed||observed.id!==pending.id||observed.status!==pending.status
    ||observed.queueDate!==pending.queueDate||observed.calledAt!==pending.calledAt)return null;
  return finishIntent(entry,'missed');
}
export function keepNoShowConfirmation(pending,active) {
  if(!pending||!Array.isArray(active))return null;
  return active.some(entry=>{
    const observed=observedCall(entry);
    return observed&&observed.id===pending.id&&observed.status===pending.status
      &&observed.queueDate===pending.queueDate&&observed.calledAt===pending.calledAt;
  })?pending:null;
}
