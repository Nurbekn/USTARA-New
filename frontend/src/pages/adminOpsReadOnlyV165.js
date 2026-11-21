// v165: strict, presentation-only validation of operator status responses.
const STATUS=new Set(['ok','attention']);
const CHANNEL=new Set(['queue','smart_booking']);
const CASE=new Set(['pending','processing','sending','sent','failed','cancelled','uncertain']);
const nonnegative=x=>Number.isSafeInteger(x)&&x>=0;
export const opsReadOnlyLocaleV165=Object.freeze({
 uz:{system:'Tizim nazorati',outbox:'Telegram xabarlar navbati',intro:'Faqat ko‘rish. Bu yerda serverni qayta ishga tushirish, xabar yuborish yoki rollback amalga oshirilmaydi.',ok:'Ogohlantirish yo‘q',attention:'Operator tekshiruvi kerak',unknown:'Holatni tasdiqlab bo‘lmadi',disabled:'Bu kuzatuv sizning akkauntingiz uchun hali yoqilmagan.',database:'Ma’lumotlar bazasi',reachable:'So‘rovga javob berdi',alerts:'Tekshiruv talab qiladigan holatlar',checked:'Tekshirildi',refresh:'Holatni qayta tekshirish',empty:'Hozircha qo‘shimcha ogohlantirish yo‘q',status:'Holat',channel:'Yo‘nalish',count:'Soni',due:'Kechikkan',stale:'Eskirgan lease',pending:'Kutilmoqda',processing:'Jarayonda',sending:'Yuborilmoqda',sent:'Yuborildi',failed:'Muvaffaqiyatsiz',cancelled:'Bekor',uncertain:'Noma’lum natija',queue:'Navbat',smart_booking:'Smart Booking',notVerified:'Bu natija to‘liq production tekshiruvi emas.'},
 ru:{system:'Контроль системы',outbox:'Очередь Telegram',intro:'Только просмотр: без отправки сообщений, перезапуска и отката.',ok:'Нет предупреждений',attention:'Требуется проверка оператора',unknown:'Не удалось подтвердить состояние',disabled:'Этот просмотр пока недоступен вашему аккаунту.',database:'База данных',reachable:'Ответила на запрос',alerts:'События для проверки',checked:'Проверено',refresh:'Повторить проверку',empty:'Дополнительных предупреждений нет',status:'Статус',channel:'Канал',count:'Количество',due:'Просрочено',stale:'Истёкшая аренда',pending:'В ожидании',processing:'В обработке',sending:'Отправка',sent:'Отправлено',failed:'Ошибка',cancelled:'Отменено',uncertain:'Неизвестный результат',queue:'Очередь',smart_booking:'Smart Booking',notVerified:'Это не полная проверка готовности к запуску.'},
 en:{system:'System Control',outbox:'Telegram delivery queue',intro:'Read-only. No message retries, server restarts or rollback actions.',ok:'No alerts',attention:'Operator review needed',unknown:'Health cannot be verified',disabled:'This read-only view is not enabled for this account yet.',database:'Database',reachable:'Responded to query',alerts:'Items requiring review',checked:'Checked',refresh:'Check again',empty:'No additional alerts currently',status:'Status',channel:'Channel',count:'Count',due:'Overdue',stale:'Stale lease',pending:'Pending',processing:'Processing',sending:'Sending',sent:'Sent',failed:'Failed',cancelled:'Cancelled',uncertain:'Uncertain',queue:'Queue',smart_booking:'Smart Booking',notVerified:'This is not a complete production readiness assessment.'},
});
export function validateOpsReadOnlyV165(value,kind){
 if(!value || typeof value!=='object' || Array.isArray(value)||!STATUS.has(value.status)
  ||typeof value.checkedAt!=='string'||!Number.isFinite(Date.parse(value.checkedAt))
  ||value.automaticResend!==false)return false;
 const delivery=value.telegramDelivery;
 if(!delivery || delivery.status!==value.status || !Array.isArray(delivery.alerts)
  ||delivery.alerts.length>20)return false;
 if(delivery.alerts.some(item=>!CHANNEL.has(item.channel)||!CASE.has(item.status)
  ||![item.count,item.overdue_pending,item.stale_lease].every(nonnegative)))return false;
 if(kind==='telegram') {
  if(!delivery.summary || typeof delivery.summary!=='object')return false;
  for(const channel of ['queue','smart_booking']){
   const statuses=delivery.summary[channel];
   if(!statuses || typeof statuses!=='object')return false;
   for(const [status,data] of Object.entries(statuses)){
    if(!CASE.has(status)||!data || !['total','due','overdue_pending','stale_lease'].every(k=>nonnegative(data[k])))return false;
   }
  }
  return true;
 }
 return kind==='system' && value.database?.status==='reachable'
  && value.featureFlags?.adminReadOnlyOperations==='enabled'
  && value.automatedRollback===false
  && nonnegative(value.monitoring?.alertCount)
  && value.monitoring.alertCount===delivery.alerts.length;
}
