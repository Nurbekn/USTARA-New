// Local sequence gate: ignore stale refreshes, even for the same logged-in account.
// This helper never stores or exposes a token or private queue payload.
export function createLatestRequestGate(){
 let sequence=0;
 return {
  next(){return ++sequence;},
  isLatest(requestId){return Number.isSafeInteger(requestId)&&requestId>0&&requestId===sequence;},
  invalidate(){sequence++;},
 };
}
