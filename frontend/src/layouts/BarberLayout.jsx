import { Suspense } from "react";
import Loading from "../components/Loading";
import { BrandSymbol } from "../components/brand/BrandLogo";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useEffect } from "react";
import AvailabilityBadge from "../pages/barber/components/AvailabilityBadge";
import { Avatar } from "../components/Avatar";
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
    to: "/barber/schedule",
    label: "Jadval",
    icon: icon(
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </>,
    ),
  },
  {
    to: "/barber/portfolio",
    label: "Ishlarim",
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
  const { profile, bookings } = useBarber();
  const { pathname } = useLocation();
  const pending = bookings.filter((b) => b.status === STATUS.PENDING).length;

  useEffect(() => {
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "instant",
    });
  }, [pathname]);

  return (
    <div className={`bx-app ${pathname.replace(/\/+$/, "") === "/barber/portfolio" ? "bx-app-portfolio" : ""}`}>
      <header className="bx-top">
        <Link to="/barber" className="bx-logo" aria-label="Ustara — bosh sahifa">
          <BrandSymbol size={40} />
        </Link>
        <div className="bx-top-right">
          <AvailabilityBadge profile={profile} />
          <Link to="/barber/profile" aria-label="Profil">
            <Avatar photo={profile.avatarPhoto} id={profile.avatar} name={profile.firstName} size={36} />
          </Link>
        </div>
      </header>

      <main className="bx-main">
        <Suspense fallback={<Loading />}><Outlet /></Suspense>
      </main>

      <nav className="bx-nav" aria-label="Asosiy menyu">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className="bx-nav-item"
          >
            <span className="bx-nav-icon">
              {item.to === "/barber/profile" ? (
                <Avatar photo={profile.avatarPhoto} name={profile.firstName} size={24} className="bx-nav-avatar" />
              ) : item.icon}
              {item.badge && pending > 0 && <i className="bx-dot">{pending}</i>}
            </span>
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
