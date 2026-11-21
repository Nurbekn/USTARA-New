// Private walk-in UI helpers. The backend remains the authority on prices and timing.
export const MAX_MANUAL_SERVICES=20;
export function toggleManualService(ids,serviceId,checked){
 if(!Array.isArray(ids)||!Number.isSafeInteger(serviceId)||serviceId<=0)return Array.isArray(ids)?ids:[];
 if(!checked)return ids.filter(id=>id!==serviceId);
 if(ids.includes(serviceId)||ids.length>=MAX_MANUAL_SERVICES)return ids;
 return [...ids,serviceId];
}
export function secondsRemaining(deadline,now=Date.now()){
 const expires=Date.parse(deadline);
 return Number.isFinite(expires)&&Number.isFinite(now)?Math.max(0,Math.ceil((expires-now)/1000)):0;
}

// UI-only countdown guard. Server/database remain authoritative at action time.
export function offerActionState(offer,now=Date.now()){
 if(!offer||typeof offer!=='object')return 'inactive';
 if(offer.status==='pending')return secondsRemaining(offer.expires_at,now)>0?'pending':'expired';
 if(offer.status==='accepted')return secondsRemaining(offer.confirmation_deadline,now)>0?'accepted':'expired';
 return 'inactive';
}
