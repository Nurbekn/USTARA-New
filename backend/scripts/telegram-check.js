require('dotenv').config();
const { createTelegramApi } = require('../telegram/api');
async function main() {
  const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_BOT_USERNAME: username, TELEGRAM_UPDATE_MODE: mode }=process.env;
  if (!token || !username) { console.error('TELEGRAM_BOT_TOKEN yoki TELEGRAM_BOT_USERNAME sozlanmagan.'); process.exitCode=1; return; }
  const api=createTelegramApi(token);
  const me=await api('getMe');
  const info=await api('getWebhookInfo');
  const match=me?.is_bot && String(me.id)===token.split(':')[0] && String(me.username).toLowerCase()===username.toLowerCase();
  const webhook=!!info?.url;
  console.log('Bot nomi:',`@${me.username}`);
  console.log('Bot identifikatsiyasi:',match?'MOS':'MOS EMAS');
  console.log('Ishlash rejimi:',mode==='webhook'?'webhook':'polling');
  console.log('Webhook:',webhook?'faol':'yo‘q');
  if (!match || (mode!=='webhook'&&webhook)) { console.error('Bot sozlamalarida nomuvofiqlik bor.');process.exitCode=1; }
  else console.log('Telegram API aloqasi mavjud. Bu bot worker ishlayotganini isbotlamaydi.');
}
main().catch(error=>{
  const code=error?.code;
  // No raw errors: never risk logging bot tokens in URL.
  console.error(code===401?'Bot tokeni Telegram tomonidan rad etildi.':code===409?'Telegram botning boshqa polling/webhook ulanishi mavjud.':'Telegram API ulanishi/konfiguratsiyasida xato.');
  process.exitCode=1;
});
