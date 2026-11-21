// #151: these are submission receipts only, not an Admin review or resolution timeline.
const REASONS = Object.freeze(['spam', 'inappropriate', 'misleading', 'other']);
export const socialReportReasonOptionsV177 = REASONS;
export function normalizeReportReceiptsV177(payload) {
  if (!payload || !Array.isArray(payload.reports) || payload.moderationStatusAvailable !== false || payload.reports.length > 50) {
    throw new Error('Shikoyat qaydlari serverdan tasdiqlanmadi.');
  }
  return payload.reports.map(item => {
    if (!Number.isSafeInteger(Number(item?.id)) || Number(item.id) < 1 ||
        !Number.isSafeInteger(Number(item?.postId)) || Number(item.postId) < 1 ||
        !REASONS.includes(item.reason) || !Number.isFinite(Date.parse(item.createdAt))) {
      throw new Error('Shikoyat qaydi noto‘g‘ri.');
    }
    return { id: Number(item.id), postId: Number(item.postId), reason: item.reason, createdAt: item.createdAt };
  });
}
export const socialReportReceiptsTextV177 = Object.freeze({
  uz: { title:'Mening shikoyatlarim',open:'Shikoyatlarim',close:'Yopish',loading:'Shikoyatlar yuklanmoqda…',reload:'Yangilash',empty:'Hozircha shikoyat qaydlari yo‘q.',error:'Shikoyatlarni yuklab bo‘lmadi.',receipt:'Qabul qilingan shikoyat',post:'Post',note:'Bu faqat server qabul qilgan shikoyatlar ro‘yxati. Moderatsiya qarori yoki muammo hal bo‘lganini bildirmaydi. O‘chirilgan post bilan bog‘liq qayd ro‘yxatdan yo‘qolishi mumkin.', reasons: {spam:'Spam',inappropriate:'Nomaqbul kontent',misleading:'Chalg‘ituvchi kontent',other:'Boshqa sabab'} },
  ru: { title:'Мои жалобы',open:'Мои жалобы',close:'Закрыть',loading:'Загрузка жалоб…',reload:'Обновить',empty:'Жалоб пока нет.',error:'Не удалось загрузить жалобы.',receipt:'Принятая жалоба',post:'Публикация',note:'Это только квитанции о получении жалоб сервером, не решения модерации. Запись может исчезнуть при удалении публикации.',reasons:{spam:'Спам',inappropriate:'Неприемлемый контент',misleading:'Вводящий в заблуждение контент',other:'Другая причина'} },
  en: { title:'My reports',open:'My reports',close:'Close',loading:'Loading reports…',reload:'Refresh',empty:'No report receipts yet.',error:'Unable to load reports.',receipt:'Received report',post:'Post',note:'These are server submission receipts, not moderation decisions or resolutions. A receipt may disappear if its post is deleted.',reasons:{spam:'Spam',inappropriate:'Inappropriate content',misleading:'Misleading content',other:'Other'} },
});
