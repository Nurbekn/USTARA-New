export const BADGE_TYPES=Object.freeze(['identity_checked','experience_checked','portfolio_checked']);
const copy={
 uz:{title:'Dalil bilan beriladigan belgilar',description:'Faqat tasdiqlangan sartaroshlarga. Dalil sababi 20–500 belgi. Belgilar avtomatik malaka sertifikati emas.',grant:'Berish',revoke:'Bekor qilish',reason:'Tekshiruv dalili yoki bekor qilish sababi (20–500 belgi):',next:'Keyingi',previous:'Oldingi',labels:['Shaxs','Tajriba','Portfolio'],active:'Faol',revoked:'Bekor qilingan',page:'Sahifa'},
 ru:{title:'Проверки с подтверждением',description:'Только подтверждённым барберам. Причина и доказательства: 20–500 символов. Значки не являются сертификатами.',grant:'Выдать',revoke:'Отозвать',reason:'Основание проверки или отзыва (20–500 символов):',next:'Далее',previous:'Назад',labels:['Личность','Опыт','Портфолио'],active:'Активно',revoked:'Отозвано',page:'Страница'},
 en:{title:'Evidence-backed badges',description:'Approved barbers only. Record evidence or withdrawal reason (20–500 characters). Badges do not certify skill.',grant:'Grant',revoke:'Revoke',reason:'Verification evidence or withdrawal reason (20–500 characters):',next:'Next',previous:'Previous',labels:['Identity','Experience','Portfolio'],active:'Active',revoked:'Revoked',page:'Page'},
};
export const badgeAdminCopyV162=lang=>copy[lang]||copy.uz;
export function checkedAdminBadgePageV162(data){
 if(!data||!Array.isArray(data.barbers)||data.barbers.length>50||!Number.isInteger(data.page)||data.page<1||data.page>100||typeof data.hasNext!=='boolean')return false;
 return data.barbers.every(b=>Number.isSafeInteger(b.id)&&b.id>0&&b.verification_status==='approved'&&Array.isArray(b.badges)
  && b.badges.length<=3&&b.badges.every(item=>item&&BADGE_TYPES.includes(item.type)
   && ['active','revoked'].includes(item.state)&&Number.isSafeInteger(item.revision)&&item.revision>=1));
}
