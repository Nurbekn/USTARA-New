# USTARA v105 — 8 ta xavfsizlik va foydalanish yaxshilanishi

Mavzu: #152 — **Safe No-Show tasdiqlash**. Ushbu versiyada yangi SQL migratsiya yoki server API shartnomasi yo‘q.

- `Kelmadi` bosilishi faqat tasdiq oynasini ochadi.
- `Ha` va `Yo‘q` alohida; `Yo‘q` mutatsiya yubormaydi.
- Faqat `called` statusga ruxsat; boshqa navbat holatlariga yo‘q.
- Tasdiq 30 sekundda eskiradi.
- Ochiq tasdiq akkaunt, sessiya epoch va tokeniga bog‘langan.
- ID, navbat kuni yoki `called_at` almashsa tasdiq bekor bo‘ladi.
- Xato ma’lumot yuklanishi, boshqa amal yoki akkaunt almashganda tasdiq tozalanadi.
- Backendning ruxsat/status/bugungi sana/transaction safety mantiqlari 16 ta yangi unit test bilan tekshirildi.

**Cheklov:** mijoz UI sidagi tasdiq backend avtorizatsiyasining o‘rnini bosmaydi. PostgreSQL va haqiqiy brauzer testlari hali bajarilmadi. 185 qaror va 44 migratsiya original holatda.
