# USTARA v101 — test runbook

```bash
cd USTARA-New/frontend
npm run test:v101:unit
npm run test:unit
npm ci && npm run build  # bu muhitda npm paketlari yo‘q: bajarilmagan
```

Stagingda qo‘lda tekshirish: mijoz sifatida login → mavjud kelgusi bronni bekor qilish → server tasdig‘idan keyin muqobil panel, shu barber/xizmatlar bo‘yicha bo‘sh vaqtlar → yangi bronni tanlash tugmasi → yangi taklif narxi va slot qayta tasdiqlanishi. Keyin internet uzilishi, xizmat o‘chirilishi, boshqa tabda logout va parallel band qilish holatlarini sinang.

**Qoida:** alternativa ko‘rinishi booking commit degani emas. PostgreSQL/Chrome integratsiya testlari mavjud muhitda tasdiqlanmagan; production uchun alohida test bazasi va browser kerak.
