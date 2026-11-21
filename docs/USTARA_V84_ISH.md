# USTARA v84 — bajarilgan ishlar

1. API input: int4 chegarasidagi sartarosh/xizmat ID, takroriy xizmatdan va noto‘g‘ri kalendar kundan himoya.
2. Quote output: 5 daqiqalik vaqtlar, 1200 daqiqagacha duration, 24:00 faqat yakun, kunlik 288 slot chegarasi.
3. Band/bo‘sh slot izchilligi: `candidates` va `slots` haqiqiy intersectioni, takrorlarni rad etish, yopiq kun/paused jadvalni bloklash.
4. Mijoz ko‘radigan server narxi, aktivlik flagi va xizmatlar tartibini aniq validatsiya qilish.
5. 37 yangi regressiya testi + jami frontend 362/362 PASS; 185 qaror va 42 SQL migratsiya offline audit, qaydlar va checkpoint.

**Scope:** faqat frontend availability adapter va uning testlari; backend SQL o‘zgarmadi. `npm run build` — `vite: not found`, real PG/Chrome NOT_RUN.
