// Keep an account-bound action attached to the token that initiated it.
// Stale results from a previous login must never update a new user's screen.
export async function executeAccountAction({token,currentToken,action,onSuccess,onFailure,refresh,onComplete}){
 if(!token||currentToken()!==token)return false;
 try{
  const result=await action(token);
  if(currentToken()!==token)return false;
  if(onSuccess)await onSuccess(result);
  if(currentToken()!==token)return false;
  if(refresh)await refresh();
  return currentToken()===token;
 }catch(error){
  if(currentToken()!==token)return false;
  if(onFailure)onFailure(error);
  if(refresh)try{await refresh();}catch{/* preserve the operation error */}
  return false;
 }finally{
  if(currentToken()===token && onComplete)onComplete();
 }
}
