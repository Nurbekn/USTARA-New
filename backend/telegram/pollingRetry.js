'use strict';
const {setTimeout:delay}=require('node:timers/promises');
const {MAX_AUTOMATIC_DELAY_SECONDS}=require('../services/telegramRetryPolicy');
// An invalid or excessive Telegram flood-wait MUST NOT become a short retry.
// For non-429 transient failures use a bounded 5-second backoff.
function pollingRetryDelaySeconds(error){
 if(Number(error?.code)!==429)return 5;
 const seconds=error.retryAfter;
 return Number.isSafeInteger(seconds)&&seconds>=1&&seconds<=MAX_AUTOMATIC_DELAY_SECONDS?seconds:null;
}
async function pauseAfterTelegramError(error,signal){
 const seconds=pollingRetryDelaySeconds(error);
 if(seconds===null)
  throw Object.assign(new Error('Operator review required for Telegram retry'),{code:'telegram_retry_requires_review'});
 await delay(seconds*1000,undefined,{signal});
}
module.exports={pollingRetryDelaySeconds,pauseAfterTelegramError};
