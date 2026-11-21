// A lightweight, token-free epoch gate for requests that outlive a login/logout.
// Invalidate on session change; no old request may repopulate private data.
export function createSessionRequestEpoch(){
 let epoch=0;
 return {
  capture(){return epoch;},
  isCurrent(snapshot){return Number.isSafeInteger(snapshot)&&snapshot===epoch;},
  invalidate(){epoch++;return epoch;},
 };
}
