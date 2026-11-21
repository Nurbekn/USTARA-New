# Login brute-force himoyasi

## Aniqlangan sabab va tuzatish

Oldingi frontend har bir noto‘g‘ri parol uchun avval `/api/customers/login`,
keyin `/api/barbers/login` ga murojaat qilgan. Ikkalasi ham ayni canonical
telefon hisoblagichini oshirgan: bitta bosish ikki xatoga teng bo‘lgan.
Frontend endi faqat `POST /api/auth/login` yuboradi. Backend rolni `users` dan
oladi, parolni bir marta tekshiradi va tegishli customer/barber profilini qaytaradi.
Eski endpointlar saqlanadi va ayni account himoyasidan foydalanadi.

Oldingi public IP hisoblagichi turli telefonlarning xatolarini jamlagan.
`trust proxy=false` va `req.socket.remoteAddress` sabab proxy ortidagi barcha
mijozlar ham bitta IP sifatida hisoblanishi mumkin. Shu IP dagi o‘nta xato boshqa
telefonlarning to‘g‘ri loginini ham bloklagan. Bu holat umumiy Wi-Fi/NAT da ham
mavjud. Public source kaliti endi `SHA256(JSON.stringify([canonicalPhone, ip]))`:
bir telefonning xatolari boshqa telefonning hisoblagichiga qo‘shilmaydi.
Production tarmog‘i va bazadagi ayni blok yozuvi tekshirilmagan; sabab kod va
izolyatsiyalangan PostgreSQL/Chrome regression testlarida tasdiqlangan.

## Amaldagi qoidalar

- Public account kaliti: canonical E.164 telefonning SHA-256 xeshi. Barcha IP lar,
  umumiy va eski login endpointlari shu hisoblagichdan foydalanadi.
- Ketma-ket beshta noto‘g‘ri parol 1 daqiqalik blok beradi. Keyingi beshtaliklar
  3 va ko‘pi bilan 5 daqiqalik blok beradi. IP ni almashtirish yordam bermaydi.
- Public source hisoblagichi telefon/IP juftligiga tegishli. Avvalgi 10 xato,
  15 daqiqalik oyna, 1/3/5 daqiqalik cheklov va 24 soat tinchlikdan keyingi
  source penalty tiklanishi saqlangan. Account limiti oldinroq ishga tushadi.
- Admin namespace, singleton account va faollik tekshiruvi saqlangan.
  Admin account limiti ham 5 xato va 1/3/5 daqiqa; IP limiti 10 xato va
  1/3/5 daqiqa. Admin login nomini almashtirish account limitini chetlab o‘tmaydi.
- Blok davridagi so‘rov blokni uzaytirmaydi. Muddati tugagach urinish mumkin.
  Muvaffaqiyatli login shu account hisoblagichi va penalty darajasini tozalaydi.
- Topilmagan telefon ham xato hisoblagichi va dummy bcrypt tekshiruvidan o‘tadi.
  Xato javobi telefon mavjudligini oshkor qilmaydi. DB/tranzaksiya xatosida
  himoya chetlab o‘tilmaydi: umumiy 503 qaytariladi.
- OTP, ro‘yxatdan o‘tish va administrator bloklari o‘zgartirilmaydi. Umumiy
  login route OTP middleware dan oldin ulangan; loginning alohida durable
  himoyasi bor, OTP ning umumiy IP budjeti login uchun ishlatilmaydi.

## HTTP va frontend

Limitga yetkazgan so‘rovning o‘zi ham 429 oladi. Javobda `code=login_throttled`,
`retryAfter` butun soniyalarda va xuddi shu qiymatli `Retry-After` header bor.
`sendLogin` ning mavjud header mexanizmi saqlangan va haqiqiy HTTP da sinalgan.
CORS `Retry-After` ni brauzerga ochadi. Barcha login javoblari `Cache-Control:
no-store` ishlatadi. JWT `id` — canonical user, `profileId` — tegishli profil.

Frontend ikki rolni ketma-ket sinamaydi va 401/429 dan keyin avtomatik qayta
so‘rov yubormaydi. Mavjud `submitting` ref bir render ichidagi takroriy bosishni
ham to‘xtatadi. 429 dan keyin soniyali muddat asosida `daqiqalar:soniyalar`
hisoblagichi ko‘rinadi; shu telefon uchun submit vaqtincha o‘chiriladi.
Admin formasida ham qayta bosish himoyasi va jonli kutish hisoblagichi bor. Boshqa
telefonni kiritib kirish mumkin. Muddati tugaganda tugma qayta faollashadi.
Backend har bir urinishni mustaqil tekshiradi; frontend soati himoya mezoni emas.

## Tranzaksiyalar va joriy qilish

Source qatori, keyin account qatori `ON CONFLICT` va `FOR UPDATE` bilan
bloklanadi. Parol tekshiruvi, JWT yaratish va hisoblagich yangilanishi bitta
tranzaksiyada; muvaffaqiyat faqat COMMIT dan keyin qaytariladi. Vaqt PostgreSQL
`clock_timestamp()` dan olinadi. Lock/statement timeout 3/5 soniya.
Kalitlar xeshlangan; limiter jadvalida parol, OTP, token yoki ochiq telefon/IP yo‘q.

Besh urinish uchun `20261123_security_login_policy.sql` alohida migratsiyasi
backenddan oldin bajarilishi kerak. Oldingi CHECK `failed_count<3` bo‘lgan;
yangisi `failed_count<5`. Migratsiya eski jadval imzosini tekshiradi, faqat shu
CHECK ni almashtiradi, katalog imzosini yangilaydi va o‘z markerini yozadi.
Yozuvlar o‘chirilmaydi, eski penalty=4 saqlanadi; backend uni 5 daqiqalik maksimumga
moslaydi. Tarixiy migratsiyalar tahrirlanmagan. Bootstrap va uning marker
tekshiruvi yangi migratsiyani ham qamrab oladi. Haqiqiy bazada migratsiya
bajarish uchun alohida ruxsat talab qilinadi; bu vazifada u hali olinmagan.
Eski public IP yozuvlari yangi juftlik kaliti bilan mos kelmaydi va endi boshqa
telefonlarni bloklamaydi; ular avtomatik o‘chirilmaydi. Account va source bloklari saqlanadi, ammo samarali muddat
`min(blocked_until, last_failed_at + yangi_penalty_muddati)` bo‘yicha olinadi.
Shu sabab eski 60 daqiqalik blok oxirgi xatodan ko‘pi bilan 5 daqiqada tugaydi;
har bir so‘rovda yangi 5 daqiqa qo‘shilmaydi. Haqiqiy bazadagi bloklar qo‘lda tozalanmagan.
Frontend va backendni birgalikda joriy qilish kerak: yangi frontendga
`/api/auth/login` endpointi zarur.

`trust proxy=false` saqlanadi, soxta `X-Forwarded-For` ishonchli deb olinmaydi.
Endi public IP bo‘yicha barcha telefonlarga umumiy taqiq yo‘q; bitta accountga
hujum barcha IP lar bo‘yicha cheklanadi. Ko‘p turli telefonlarga tarqatilgan
trafik va umumiy CPU/ulanish hajmi uchun boshqariladigan edge request/connection
limitlari kerak. Bu ishda production proxy/edge sozlamalari o‘zgartirilmagan.

## Bajarilgan tekshiruvlar — 2026-11-17, yangi 5 urinish siyosati

- Backend login unit: 13 test o‘tdi. 5-xato, 1/3/5 daqiqa, admin himoyasi,
  parallel urinishlar va eski account/source bloklarini qisqartirish tekshirildi.
- PostgreSQL 18.6 integration: 7 ssenariy o‘tdi. Account hisoblagichining 4 gacha
  saqlanishi, 5-xatoda 429/Retry-After, 12 parallel so‘rovda 4 ta 401 va 8 ta 429,
  boshqa telefon mustaqilligi, adminning 1/3/5/5 daqiqalik bosqichlari hamda eski
  blokdan 38 daqiqa qolgan yozuvning yangi qoida bo‘yicha tugashi tekshirildi.
- Chrome E2E: mobil customer, desktop barber va admin — 3 ssenariy o‘tdi.
  Bitta bosish bitta so‘rov, 5-xatoda blok, jonli hisoblagich va muddat tugagach
  muvaffaqiyatli kirish tekshirildi. Dashboardning boshqa API lari testga kirmaydi.
  Chrome profilini tozalashdagi fayl bandligi va test yordamchisining reload
  kutishi tuzatildi; yakuniy E2E natijasi tozalash bilan birga muvaffaqiyatli.
- Yangi migratsiya, uning qayta bajarilishi va eski login migratsiyasining yangi
  imzo bilan qayta tekshiruvi alohida test bazasida o‘tdi.
- Yangi bo‘sh `ustara_bootstrap_test_login_policy` sxemasida to‘liq yangilangan
  bootstrap va yakuniy katalog/marker tekshiruvi o‘tdi. Dastlab `test_login_policy`
  nomi guard tomonidan migratsiyalardan oldin rad etildi; bo‘sh sxema nomi
  ruxsat etilgan shaklga moslandi, guard o‘zgartirilmadi.
- Bootstrap rejasining unit testlari, frontend ESLint va production build o‘tdi.
- Mavjud keng API/local-auth testlaridagi eski 3 urinish va umumiy public IP
  assertionlari yangi qoidaga moslandi. Bu keng to‘plamlar qayta bajarilmadi;
  o‘zgargan fayllarning sintaksisi tekshirildi. Login uchun yuqoridagi alohida
  PostgreSQL/E2E to‘plamlari bajarildi. Frontend login utili o‘zgarmagani uchun
  oldingi muvaffaqiyatli unit tekshiruvi takrorlanmadi.

Barcha DB tekshiruvlari faqat avval ruxsat berilgan yangi
`/tmp/ustara-login-rate-20261117/` klasteridagi `ustara_test_db` da,
`ustara_login_test` roli bilan bajarildi. Haqiqiy bazaga ulanilmadi va `.env`
o‘qilmadi. Vite testida `envDir:false`, `configFile:false`; buildda `envDir:false`.
Test bazasi klasteri yakunda to‘xtatildi.

Qayta bajarish uchun alohida tayyorlangan lokal test bazasi, yangi migratsiya,
`NODE_ENV=test`, `USTARA_LOGIN_WRITE_TESTS=I_AUTHORIZE_TEST_DATA`,
`USTARA_TEST_DATABASE_URL` va E2E uchun `USTARA_LOGIN_E2E=1` talab qilinadi:

```sh
node --test --test-concurrency=1 --test-reporter=spec backend/test/login.postgres.integration.test.js backend/test/login.browser.e2e.test.js
```

Test roli `ustara_login_test` bo‘lishi va superuser bo‘lmasligi tekshiriladi.
Admin singleton testi sabab bir test bazasida bu ikki to‘plam ketma-ket bajariladi.
Oddiy ishga tushirishda DB testlari ruxsatsiz ulanmaydi, SKIP qilinadi.

## Administrator kirishi va joriy qilish

Telefonli `/login` formasi customer/barber uchun. Administrator `/admin`
sahifasidagi alohida login va parol orqali kiradi; `/api/admin/login` faqat
mavjud admin konfiguratsiyasi hamda faol `admin_accounts` singletonini qabul qiladi.
Telefonli sahifaga admin credential yuborish admin sessiyasini yaratmaydi.
Haqiqiy admin credentiallari ushbu ishda o‘qilmagan va tekshirilmagan.

Avval yangi migratsiyani tasdiqlangan bazada bajarish, keyin backend va frontendni
birgalikda yangilash kerak. Eski backend writerlari to‘xtatilishi kerak. Eski
CHECK bilan yangi backend to‘rtinchi xatoni saqlay olmaydi; bu holat generic 503
bilan yopiladi, himoya chetlab o‘tilmaydi. Eski brauzer kutish holatini yangilash
uchun sahifani qayta yuklash kerak. Production joriy qilinishi hali bajarilmagan.
