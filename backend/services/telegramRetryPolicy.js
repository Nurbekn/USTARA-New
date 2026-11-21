'use strict';
// Telegram 429 is a known non-delivery. Honor Retry-After without shortening it.
// Delays beyond 30 days need operator review rather than an unsafe early replay.
const MAX_AUTOMATIC_DELAY_SECONDS=30*24*60*60;
function telegramRetryDelay(attempt,retryAfter=0){
 const n=Number(attempt);
 if(!Number.isSafeInteger(n)||n<1)return null;
 const base=Math.min(600,5*2**Math.min(20,n-1));
 const claimed=Number(retryAfter);
 if(!Number.isFinite(claimed)||claimed<0)return null;
 const required=Math.ceil(claimed);
 const delay=Math.max(base,required);
 return Number.isSafeInteger(delay)&&delay<=MAX_AUTOMATIC_DELAY_SECONDS?delay:null;
}
// Preserve the fact that a Telegram retry request is too large: no 60s clamp.
function readTelegramRetryAfter(raw){
 if(raw===undefined||raw===null)return 5;
 // A malformed *present* cooldown is not evidence of a safe short retry.
 // Escalate to operator review rather than risking an early replay.
 if(typeof raw!=='number' || !Number.isFinite(raw) || raw<=0)return MAX_AUTOMATIC_DELAY_SECONDS+1;
 return raw>MAX_AUTOMATIC_DELAY_SECONDS?MAX_AUTOMATIC_DELAY_SECONDS+1:Math.ceil(raw);
}
module.exports={MAX_AUTOMATIC_DELAY_SECONDS,telegramRetryDelay,readTelegramRetryAfter};
