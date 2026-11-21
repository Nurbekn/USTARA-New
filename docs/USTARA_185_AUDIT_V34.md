# USTARA — 185 qaror auditi v34

**Asos:** `docs/USTARA_185_NAZORAT.csv`. Eski qaror matnlari va statuslar saqlangan.

| Holat | Soni |
|---|---:|
| Tekshiruv kerak | 131 |
| Qisman bajarilgan | 46 |
| Bekor qilingan yoki keyinga qoldirilgan | 7 |
| Ochiq masala | 1 (#175) |
| **Jami** | **185** |

v34 da **#135 — akkauntni vaqtincha faolsizlantirish** daliliga faqat `FOR UPDATE OF c,u` bilan Smart Booking confirm/manual claim/revoke himoyasi va 4 mock unit testi qo‘shildi. Holati **qisman** bo‘lib qoladi, chunki ikki ulanishli real PostgreSQL testi va mobil/browser E2E yo‘q.

**#175 — sartaroshxona yopilganda butunlay o‘chirish** ochiq: shop modeli va ma'lumotni o‘chirish siyosati aniqlanmagan. Buni taxmin qilib implementatsiya qilinmadi.

Boshqa 183 ta qarorning asl matni, statusi va dalili o‘zgarmadi. Reyestrning raqamlar yaxlitligi offline PASS. Ushbu audit production/E2E tekshiruv emas; `fully_verified` soni bu reyestrdan hisoblanmaydi.
