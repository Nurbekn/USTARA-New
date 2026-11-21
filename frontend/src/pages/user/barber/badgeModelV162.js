// #46–#48: public descriptions of checks, not quality or certification promises.
export const BADGE_TYPES_V162=Object.freeze(['identity_checked','experience_checked','portfolio_checked']);
const labels={
 uz:{identity_checked:'Shaxsiy ma’lumot tekshirilgan',experience_checked:'Tajriba dalili tekshirilgan',portfolio_checked:'Portfolio dalili tekshirilgan'},
 ru:{identity_checked:'Личные данные проверены',experience_checked:'Опыт подтверждён документами',portfolio_checked:'Портфолио проверено'},
 en:{identity_checked:'Identity evidence checked',experience_checked:'Experience evidence checked',portfolio_checked:'Portfolio evidence checked'},
};
export function badgeLabelsV162(lang){return labels[lang]||labels.uz;}
export function publicBadgesV162(response,expectedBarberId){
 if(!response||response.barberId!==expectedBarberId||!Array.isArray(response.badges)||response.badges.length>3)throw Error('Invalid public badges');
 if(response.badges.some(t=>!BADGE_TYPES_V162.includes(t))||new Set(response.badges).size!==response.badges.length)throw Error('Invalid badge types');
 return BADGE_TYPES_V162.filter(t=>response.badges.includes(t));
}
