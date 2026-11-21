// v185: only public offer data is used to prefill the EXISTING booking UI.
// No automatic POST, slot reservation, or bypass of customer authentication.
export const TOKEN_RE_V185=/^[A-Za-z0-9_-]{43}$/;
export function inviteLinkV185(barberId,token,origin) {
  if(!Number.isSafeInteger(barberId)||barberId<=0||barberId>2147483647 || !TOKEN_RE_V185.test(token||''))return '';
  const safeOrigin=typeof origin==='string'?origin:typeof window==='object'?window.location.origin:'';
  if(!/^https?:\/\/[A-Za-z0-9.:-]+$/.test(safeOrigin))return '';
  return `${safeOrigin}/barbers/${barberId}?tab=services&phone_invite=${encodeURIComponent(token)}`;
}
export function inviteSelectionV185(invite,barberId,validServices,dates,now=Date.now()) {
 if(!invite||invite.barberId!==barberId||!Number.isSafeInteger(invite.serviceId)||!Array.isArray(validServices)||!validServices.includes(invite.serviceId))return null;
 const ms=Date.parse(invite.bookingTime),exp=Date.parse(invite.expiresAt);
 if(!Number.isFinite(ms)||!Number.isFinite(exp)||exp<=now||ms<=now)return null;
 const local=new Date(ms+5*3600000).toISOString().slice(0,16),[date,time]=local.split('T');
 if(!Array.isArray(dates)||!dates.includes(date)||!/^\d{2}:[0-5]\d$/.test(time)||Number(time.slice(3))%5!==0)return null;
 return {date,time,serviceId:invite.serviceId};
}
