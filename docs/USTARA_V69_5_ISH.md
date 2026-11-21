# USTARA v69 — registration/onboarding integriteti

Asos: v68 arxivi. 185 qarorlar va avvalgi SQL migratsiyalariga tegilmadi.

## Besh yaxshilanish
1. Pending registration holati yagona qat'iy validator bilan tekshiriladi (rol, telefon, specialty, OTP, deadline).
2. Cross-tab yuborilgan noto'g'ri va eskirgan registration snapshotlari rad etiladi; boshqa token joriy in-flight registratsiyani almashtirmaydi.
3. OTP resend/verify faqat OTP bosqichida ishlaydi; kechikkan javob verified bosqichini orqaga qaytarmaydi.
4. Ism va familiya Unicode whitespace va NFC bilan normallashtirilib yuboriladi; noto'g'ri input xatosiz qaytariladi.
5. Registration va OTP error qiymatlari null yoki noto'g'ri turda bo'lsa UI buzilmaydi; 6 ta yangi test qo'shildi.

## Sinovlar
- Frontend: 189/189 PASS, v69 6/6 PASS.
- Registration flow eski testlar: 16/16 PASS.
- Original CSV SHA-256: bc068b273558e8c692d84a2a00faddc23699d7d122a9bb21036c6642e7a4aa71
- SQL migratsiyalar: v68 bilan byte-for-byte bir xil.
- Haqiqiy backend, PostgreSQL, Chrome va Telegram integratsiya testlari: NOT_RUN.
- Production-ready: YO'Q.

## Cheklov
Bu sinovlar real browser cross-tab transportini tasdiqlamaydi. Server-side role authorization va haqiqiy foydalanuvchi onboarding E2E tekshiruvi keyingi bosqichlarda bajarilishi kerak.
