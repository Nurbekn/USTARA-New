export const shopGalleryUiV173={
 uz:{title:'Sartaroshxona galereyasi',note:'Portfoliodagi eng yaxshi 8 tagacha rasmli postni tanlang. Rasmlar sizning Ilhom postlaringizdan olinadi.',loading:'Rasmlar yuklanmoqda…',selected:'Tanlangan',empty:'Avval portfolioga rasmli post joylang.',imageAlt:'Portfolio rasmi',author:'Muallif',up:'Yuqoriga ko‘tarish',down:'Pastga tushirish',save:'Galereyani saqlash',saving:'Saqlanmoqda…',saved:'Galereya saqlandi.',refresh:'Serverdan qayta tekshirish',unknown:'Natija noma’lum yoki shop yangilangan. Qayta yubormang, avval server holatini tekshiring.'},
 ru:{title:'Галерея салона',note:'Выберите до 8 фото-публикаций из собственного портфолио.',loading:'Загрузка фотографий…',selected:'Выбрано',empty:'Сначала добавьте пост с фото в портфолио.',imageAlt:'Фото портфолио',author:'Автор',up:'Выше',down:'Ниже',save:'Сохранить галерею',saving:'Сохранение…',saved:'Галерея сохранена.',refresh:'Проверить сервер',unknown:'Результат неизвестен или профиль изменился. Сначала проверьте сервер.'},
 en:{title:'Shop gallery',note:'Select up to 8 image posts from your own portfolio.',loading:'Loading images…',selected:'Selected',empty:'Add an image post to your portfolio first.',imageAlt:'Portfolio photo',author:'Author',up:'Move up',down:'Move down',save:'Save gallery',saving:'Saving…',saved:'Gallery saved.',refresh:'Refresh from server',unknown:'Result unknown or profile changed. Check server state before saving again.'}
};
export const shopGalleryTextV173=lang=>shopGalleryUiV173[lang]||shopGalleryUiV173.uz;
export function selectionV173(ids,id,checked){
 if(checked)return ids.includes(id)||ids.length>=8?ids:[...ids,id];
 return ids.filter(p=>p!==id);
}
export function moveGalleryPostV173(ids,id,direction){
 const at=ids.indexOf(id),next=at+direction;
 if(at<0||next<0||next>=ids.length)return ids;
 const copy=ids.slice();[copy[at],copy[next]]=[copy[next],copy[at]];return copy;
}
