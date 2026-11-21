# USTARA — Project Instructions

## 1. Working principles
- Before changing code, inspect the relevant existing implementation.
- Do not repeat completed investigations or tests without a concrete reason.
- Reuse existing architecture and conventions.
- Do not refactor unrelated files.
- Prefer one complete, focused implementation over many small changes.
- Explain important technical decisions and their consequences.
- Never assume a feature is implemented without checking the code.

## 2. Safety
- Never read, print, expose, or modify .env files.
- Never run database migrations, rollback, DROP, DELETE, TRUNCATE,
  or other database-changing operations without explicit user approval.
- Never connect to or modify the real database without explicit approval.
- Do not overwrite, discard, reset, stash, or commit existing user changes
  unless explicitly requested.
- Preserve all unrelated modifications.

## 3. Testing
- Run only tests relevant to the changes.
- Do not rerun tests that already passed unless code or dependencies
  affecting them have changed, or a concrete issue requires it.
- Do not claim tests passed unless they were actually executed.
- Clearly distinguish unit tests, integration tests, and manual checks.
- Do not create unnecessary tests that duplicate existing coverage.

## 4. Backend
- Backend uses Node.js, Express, and PostgreSQL.
- Follow the existing route/controller/service architecture.
- Use parameterized SQL queries.
- Keep database access consistent with the existing project.
- Do not introduce another database or ORM without approval.

## 5. Account identity
- One phone number must correspond to exactly one account.
- users is the canonical account.
- customers and barbers are role-specific profiles linked through user_id.
- JWT identity and profile identity must not be confused.
- Role and identity must be validated against the database.

## 6. Registration and security
- Customer and barber registration must use the approved OTP flow.
- Legacy registration endpoints must not bypass OTP.
- OTP expiration, attempt limits, resend limits, and administrative
  blocking must follow the existing approved implementation.
- Password policy: 8–128 characters, at least one letter and one digit.
- Do not weaken existing security controls for convenience.

## 7. Database migrations
- Never edit historical migrations unless explicitly approved.
- New schema changes require separate migrations.
- Inspect migration order and dependencies before proposing execution.
- Do not execute migrations without explicit approval.

## 8. Reporting
At the end of each task report:
1. What was inspected.
2. What was changed.
3. Which tests were actually run and their results.
4. What remains unverified.
5. Any risks or decisions requiring user approval.

Do not claim completion when important behavior remains unverified.

## Til talabi — majburiy

- Foydalanuvchi bilan barcha muloqot faqat o‘zbek tilida, lotin yozuvida olib borilsin.
- Barcha javoblar, izohlar, tahlillar, xatolik tushuntirishlari va yakuniy hisobotlar o‘zbekcha lotin yozuvida bo‘lsin.
- Qozoqcha, mo‘g‘ulcha, ruscha yoki boshqa tillarga o‘tma.
- Kirill yozuvidan foydalanma.
- Agar texnik terminning o‘zbekcha muqobili noaniq bo‘lsa, inglizcha texnik terminni saqla.
- Kod identifikatorlari, kutubxona nomlari, API nomlari va mavjud inglizcha kod izohlarini asossiz o‘zgartirma.
- Foydalanuvchi boshqa tilni aniq so‘rasagina ushbu talabdan istisno qilinadi.
- Javobni yuborishdan oldin uning tilini tekshir. Talabga mos bo‘lmagan matnni yuborma.
