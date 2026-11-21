# USTARA v83 — 12 amaliy yaxshilanish (4-bosqich)

**Manba:** `USTARA-4-Bosqich-Booking-Recovery-Race-Guards-v82.zip` (858 fayl). Qamrov: qarorlar **#98** (5 daqiqalik qoralama) va **#99** (bir sahifali booking). Ular **QISMAN** qoladi.

1. So‘nggi xizmat tanlovi olib tashlansa, shu sartaroshga tegishli draft tozalanadi.
2. Boshqa sartaroshga tegishli draftga tegilmaydi.
3. Draft faqat hozirgi xizmatlar katalogida bor xizmatlar bilan tiklanadi.
4. Draft sana faqat ekrandagi kelgusi 14 kun oralig‘ida bo‘lsa tiklanadi.
5. 20 tadan ortiq xizmat tanlash interfeysda cheklanadi.
6. Storage dagi faqat belgilangan 6 ta maydon qabul qilinadi; ortiqcha PII/JWT/quote qaytarilmaydi.
7. Noto‘g‘ri saqlangan JSON, massiv va primitive qiymatlar o‘chirib tashlanadi.
8. 2 KiB dan uzun shubhali storage qiymati parse qilinmaydi.
9. Draft yaratilgan vaqt uchun xavfsiz, butun, manfiy bo‘lmagan millisekundli qiymat talab qilinadi.
10. To‘g‘ri besh daqiqalik vaqt va haqiqiy sana formatlari tekshiriladi.
11. `sessionStorage` o‘qish/yozish taqiqlangan holatda false/null qaytariladi, muvaffaqiyat xabari soxtalashtirilmaydi.
12. 22 ta yangi test, `test:v83:unit` skripti va qayta tiklash mosligi tekshiruvi qo‘shildi.

## Tekshirilgan
- `node --test frontend/test/*.test.js`: **325 PASS, 0 FAIL** (v82: 303; v83: +22).
- `npm run test:v83:unit`: **28 PASS, 0 FAIL** (22 yangi + 6 eski).
- `node --check` bookingDraft.js: **PASS**; TypeScript parser bilan JSX sintaksisi: **0 parse error**.
- Backend `decisionCoverage.unit.test.js`: **3 PASS**, backend kodi v82 dan o‘zgarmagan.
- Backend offline audit: **185 qaror, 42 forward migratsiya — PASS**.
- `npm run build`: **BLOCKED**, `vite: not found` (muhitda npm paketlari o‘rnatilmagan).
- Real PostgreSQL/Chrome/Telegram/CI: **NOT_RUN**. **Production-ready emas.**

**Tushuntirish:** Draft hech qachon slotni band qilmaydi. Server bo‘sh slot, narx va bronni qaytadan tekshirishi shart. #98/#99 E2E yo‘qligi sababli yopilmadi.
