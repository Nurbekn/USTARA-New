import { Suspense } from "react";
import Loading from "../components/Loading";
import ContextGuideV166 from "../components/onboarding/ContextGuideV166";
import { getSession } from "../pages/auth/utils/session";
import SiteLanguageSelect from "../components/SiteLanguageSelect";
import { getSiteUi, readSiteLocale, siteLocalePath } from "../utils/siteLocale.js";
import { BrandSymbol } from "../components/brand/BrandLogo";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import AvailabilityBadge from "../pages/barber/components/AvailabilityBadge";
import VerifiedAvatar from "../components/VerifiedAvatar";
import { STATUS, useBarber } from "../pages/barber/data/store";
import "../pages/barber/barber.css";

// Inline icons keep the nav dependency-free and colorable via currentColor
const icon = (children) => (
  <svg
    viewBox="0 0 24 24"
    width="22"
    height="22"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    {children}
  </svg>
);

const NAV = [
  {
    to: "/barber",
    end: true,
    label: "Bosh",
    icon: icon(
      <>
        <path d="M3 11l9-8 9 8" />
        <path d="M5 10v10h14V10" />
      </>,
    ),
  },
  {
    to: "/barber/bookings",
    label: "Bronlar",
    badge: true,
    icon: icon(
      <>
        <rect x="4" y="5" width="16" height="15" rx="2" />
        <path d="M8 3v4M16 3v4M4 10h16" />
      </>,
    ),
  },
  {
    to: "/barber/queue",
    label: "Navbat",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>,
    ),
  },
  {
    to: "/barber/services",
    label: "Xizmatlar",
    icon: icon(
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <circle cx="9" cy="10" r="2" />
        <path d="M21 16l-5-5-9 9" />
      </>,
    ),
  },
  {
    to: "/barber/profile",
    label: "Profil",
    icon: icon(
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
      </>,
    ),
  },
];

export default function BarberLayout() {
  const { profile, bookings, status, error } = useBarber();
  const { pathname, search } = useLocation();
  const lang = readSiteLocale(search);
  const ui = getSiteUi(lang).barber;
  const pending = bookings.filter((b) => b.status === STATUS.PENDING).length;

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  }, [pathname]);

  return (
    <div lang={lang} className={`bx-app ${pathname.replace(/\/+$/, "") === "/barber/portfolio" ? "bx-app-portfolio" : ""}`}>
      <header className="bx-top">
        <Link to={siteLocalePath("/barber", lang)} className="bx-logo" aria-label={ui.homeLabel}>
          <BrandSymbol size={40} />
        </Link>
        <div className="bx-top-right">
          <SiteLanguageSelect />
          <Link to={siteLocalePath("/help?category=barber", lang)} aria-label={ui.helpLabel} style={{ color: 'inherit', fontSize: 14, marginRight: 12 }}>{ui.help}</Link>
          <AvailabilityBadge profile={profile} />
          <Link to={siteLocalePath("/barber/profile", lang)} aria-label={ui.profile}>
            <VerifiedAvatar verified={profile.verification_status === "approved"} photo={profile.avatarPhoto} id={profile.avatar} name={profile.firstName} size={36} />
          </Link>
        </div>
      </header>

      <ContextGuideV166 role="barber" pathname={pathname} lang={lang} accountId={getSession()?.accountId} key={getSession()?.accountId ?? "no-session"} />
      <main className="bx-main">
        {status === "loading" && <p className="bx-muted" role="status">{ui.loading}</p>}
        {status === "error" && <div className="bx-error" role="alert"><p>{error || ui.error}</p><button type="button" onClick={() => import("../pages/barber/data/store").then(({ refreshBarberData }) => refreshBarberData())}>{ui.retry}</button></div>}
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </main>

      <nav className="bx-nav" aria-label={ui.navLabel}>
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={siteLocalePath(item.to, lang)}
            end={item.end}
            className="bx-nav-item"
          >
            <span className="bx-nav-icon">
              {item.to === "/barber/profile" ? (
                <VerifiedAvatar verified={profile.verification_status === "approved"} photo={profile.avatarPhoto} name={profile.firstName} size={24} className="bx-nav-avatar" />
              ) : item.icon}
              {item.badge && pending > 0 && <i className="bx-dot">{pending}</i>}
            </span>
            {ui[({"/barber":"home","/barber/bookings":"bookings","/barber/queue":"queue","/barber/services":"services","/barber/profile":"profile"})[item.to]] || item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
