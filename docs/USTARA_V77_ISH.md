# USTARA — checkpoint v77 (2026-11-19)

**Manba:** `USTARA-4-Bosqich-Service-Archive-Booking-Safety-v76.zip` (828 fayl).
**Ish holati:** 4-bosqich; production-ready **YO‘Q**. Asl 185 qaror CSV va barcha SQL migratsiyalari o‘zgarmadi.

## v77 — bron narxi va davomiyligi tasdig‘i
1. Mijoz slotdan ko‘rgan `duration` qiymatini `expected_duration_minutes` sifatida yuboradi. Bu serverga davomiylikni o‘rnatmaydi; faqat tasdiqlash uchun.
2. Tranzaksiyada advisory lock + tanlangan xizmatlarga `FOR SHARE` olingach, server joriy duration’ni quote bilan solishtiradi.
3. Duration o‘zgarganda `409 duration_changed`, bron INSERTsiz ROLLBACK va mijozga qayta tasdiqlash xabari qaytadi.
4. Noto‘g‘ri duration quote (manfiy, kasr, string, cheksiz, 5 daqiqalik qadamga zid, 1200 dan katta) `400 invalid_expected_duration` bo‘ladi.
5. Joriy price quote `expected_total_price` bilan tekshirilishi saqlangan; narx faqat serverning xizmat qatorlaridan olinadi.
6. Eski `booking_services` migratsiyasi bo‘lmasa, mavjud quote’ni yashirincha e’tiborsiz qoldirib legacy bron yozilmaydi: `503 migration_required`.
7. Legacy yakka bron, yakka slot, multi-bron va multi-slot ID’lari PostgreSQL int4 chegarasida tekshiriladi.
8. PostgreSQL lock timeout (`55P03`) yoki statement timeout (`57014`) bron API’da maxfiy tafsilotsiz `409 booking_busy` ga aylanadi.
9. Slot/price response `Cache-Control: no-store` deb belgilanadi; server baribir commit oldidan qayta tekshiradi.
10. Frontend duration/servis unavailable xatolarida xabarni aniq beradi va slotlarni yangilaydi.
11. 24 ta yangi backend unit testi hamda 11 ta yangi frontend testi kiritildi (35 ta yangi test).

## Local evidence
- Frontend node tests: **278/278 PASS** (v76 267 + 11 yangi).
- Backend targeted suite: **85/85 PASS** (v77 yangi 24).
- Full backend Node unit suite: **628 PASS / 26 FAIL**; 26 ta FAIL ning barchasi ushbu muhitda o‘rnatilmagan npm paketlari (`express`, `pg`, `jsonwebtoken`, `bcrypt` va ularning importlari) sababli `MODULE_NOT_FOUND`. Ilovaning barcha testlari PASS deb da’vo qilinmaydi.
- 185 ta qaror: original CSV SHA-256 `bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71`.
- 42 forward migratsiya va avvalgi SQL fayllar byte-for-byte saqlangan.
- Real PostgreSQL race condition, Vite build, Chrome UI, Telegram va CI live sinovlari: **NOT RUN**.

## Keyingi v78 yo‘nalishi
- npm dependencies bilan to‘liq backend test suite, haqiqiy izolatsiyalangan PostgreSQL orqali arxivlash/narx o‘zgarishi/parallel bron race testlari.
- 185 qaror bo‘yicha hali tekshiruv talab qiladigan funksiyalarni navbatma-navbat yakunlash.
