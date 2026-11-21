/* USTARA v151: public, dependency-free locale for the first loading screen.
   This runs before the React bundle. Never put URL data into HTML or attributes. */
(() => {
  'use strict';
  const copy = Object.freeze({
    uz: Object.freeze({title:'Ustara — Sartarosh bron qilish', description:"Ustara — o‘zingizga mos sartaroshni toping va navbatni oldindan band qiling.", status:'Yuklanmoqda…', detail:'Iltimos, biroz kuting'}),
    ru: Object.freeze({title:'USTARA — Запись к барберу', description:'Найдите барбера и забронируйте удобное время на USTARA.', status:'Загрузка…', detail:'Пожалуйста, подождите'}),
    en: Object.freeze({title:'USTARA — Barber booking', description:'Find a barber and book an appointment with USTARA.', status:'Loading…', detail:'Please wait'}),
  });
  const languages = new URLSearchParams(location.search).getAll('lang');
  const requested = languages.length === 1 ? languages[0] : 'uz';
  const lang = Object.hasOwn(copy, requested) ? requested : 'uz';
  const text = copy[lang];
  document.documentElement.lang = lang;
  document.title = text.title;
  const desc = document.querySelector('meta[name="description"]');
  if (desc) desc.setAttribute('content', text.description);
  const status = document.getElementById('ustara-boot-status');
  const detail = document.getElementById('ustara-boot-detail');
  if (status) status.textContent = text.status;
  if (detail) detail.textContent = text.detail;
})();
