# USTARA frontend

React + Vite frontend for the public website, customer cabinet and barber cabinet.

## Development

```sh
npm ci
npm run dev
npm run lint
npm run build
npm run preview
```

Vite uses `/USTARA-New/` as its base path for GitHub Pages. Use the local URL
printed by Vite. `node_modules/` and `dist/` are generated and ignored by Git.

## Source layout

```text
src/
  App.jsx                 Route definitions
  main.jsx                Application entry point
  index.css               Shared colors, typography and base styles
  mobile.css              Mobile browser adjustments
  components/             Components shared across features
    Avatar.jsx            Barber avatars and avatar picker
    Sheet.jsx             Accessible shared modal / bottom sheet
    LocationPicker.jsx    Address search, map and GPS selection
  layouts/                Public, customer and barber layout shells
    UserLayout.css        Customer shell and shared customer theme
  utils/media/            Shared image validation and preparation
  pages/
    auth/                 Signup, login, OTP and session guard
    home/                 Public landing page
    barber/               Barber screens, feature components and data
    user/
      components/         Customer icons, avatar and nearby-barber section
      UserHome.css        Customer home styles
      bookings/           Booking cards, API boundary and status helpers
      explore/            Catalog filtering, API boundary and result cards
      social/             Social API boundary, post cards and composer
public/images/            Public landing image and responsive WebP variants
.vscode/                  Workspace editor settings
```

Keep shared UI in `components/`, layout shells in `layouts/`, and business logic
and feature-only components beside the corresponding page. Avoid importing
customer UI from the barber feature or placing empty route stubs in `pages/`.

## Routing and authentication

- Public: `/`, `/barbers` (current public directory placeholder).
- Auth: `/signup`, `/signup/usta`, `/login`, `/otp`.
- Customer: `/user`, `/user/explore`, `/user/bookings`, `/user/social`, `/user/profile`.
- Barber: `/barber` and its feature routes, `/barber/setup`, `/barber/pending`.

Private route groups use `RequireSession`. Signup uses the backend OTP registration
flow. The shared `/login` sends `{phone, password}` to `/api/customers/login`,
trying `/api/barbers/login` only after HTTP 401. Other failures stop immediately.
The successful backend profile and JWT supply the role, users account ID and
separate profile ID. Customer login opens `/user`; barber login opens `/barber`.
Barber verification status is retained; backend APIs remain responsible for
account restrictions and authorization. Login currently has no separate blocked
account check on the backend. No browser password record authenticates login.

JWT and session metadata are stored in sessionStorage, restored on refresh and
checked for expiry and matching role/account/profile IDs. JWT decoding is for UI
consistency, not signature verification. Login profiles initialize the existing
UI caches; these caches do not create backend accounts. Logout removes the tab's
JWT, session metadata and pending registration. There is no backend logout or
revocation endpoint: copied JWTs remain usable until expiry or a password reset
advances the backend account session version.
Password reset uses `/api/auth/password-reset/{start,resend,verify,complete}`
with in-memory challenge/reset tokens, a three-minute OTP/cooldown and five-minute
reset authorization. It no longer uses local passwords or a fixed test code.
A successful reset revokes older public JWTs through backend session-version
checks. See `backend/PASSWORD_RESET.md` for migration and SMS-adapter requirements. API requests must verify sessions and ownership server-side.

Both signup forms include a local image CAPTCHA before continuing to OTP. Codes
expire after two minutes and refresh after an incorrect answer. This is part of
the frontend test flow, not production bot protection. Before enabling real SMS,
replace it with a provider CAPTCHA and verify its token on the backend before
every SMS send and resend; browser-only validation can be bypassed.

## Backend integration points

- `pages/auth/utils/session.js`: backend tab-session persistence, expiry and logout.
- `pages/auth/utils/login.js`: customer/barber login requests and response validation.
- `pages/user/explore/catalog.js`: empty catalog loader and search/filter helpers.
- `pages/user/bookings/model.js`: booking loader, cancellation adapter and statuses.
- `pages/user/social/model.js`: feed loader and publish/comment/report adapters.
- `pages/barber/data/`: existing barber state and media persistence.

Customer loaders start empty. Post publishing and other server-dependent mutations
must not claim success until the API confirms them. Social reaction overrides are
temporary frontend state. The existing barber preview store contains demo data;
it is separate from the customer loaders.

## Hosting

The repository workflow builds `frontend/` and publishes `dist/` to GitHub Pages.
Set the GitHub repository variable `VITE_API_BASE_URL` to the deployed backend's
HTTPS origin (for example, `https://api.example.com`) before enabling deployment.
The workflow fails clearly when this value is missing instead of publishing a
site whose API requests point back to GitHub Pages. Local development defaults to
`http://localhost:5000`; set `VITE_API_BASE_URL` when using a remote backend.
The workflow creates `404.html` as the SPA route fallback. Keep the PNG landing
image: it is the fallback for the two responsive WebP variants, not an unused asset.
