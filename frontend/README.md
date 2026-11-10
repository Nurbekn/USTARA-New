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

Private route groups use `RequireSession`. Authentication is currently a frontend
**test flow**: OTP is `12345`, no SMS is sent, and local browser records can be
modified. This does not provide production authentication. Real sessions, roles,
record ownership and mutations must be verified by the backend on every API request.

## Backend integration points

- `pages/auth/utils/session.js`: test session persistence, account lookup and logout.
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
The workflow creates `404.html` as the SPA route fallback. Keep the PNG landing
image: it is the fallback for the two responsive WebP variants, not an unused asset.
