import { useEffect, useState } from "react";
import { Avatar } from "../components/Avatar";
import { getSession } from "../pages/auth/utils/session";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import "./UserLayout.css";
import { readCustomerProfile, saveCustomerProfile } from "../pages/user/data/profile";

const navigation = [
  { to: "/user", label: "Bosh sahifa", icon: "home", end: true },
  { to: "/user/explore", label: "Qidiruv", icon: "explore" },
  { to: "/user/bookings", label: "Bronlar", icon: "bookings" },
  { to: "/user/social", label: "Lenta", icon: "social" },
  { to: "/user/profile", label: "Profil", icon: "profile" },
];

function UserIcon({ name }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7" /><path d="M5 9v12h5v-7h4v7h5V9" /></>,
    explore: <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>,
    bookings: <><rect x="4" y="5" width="16" height="16" rx="3" /><path d="M8 3v4m8-4v4M4 11h16m-12 5h3" /></>,
    social: <><path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z" /><path d="M8 10h8m-8 4h5" /></>,
    profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21v-2a8 5 0 0 1 16 0v2" /></>,
    bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></>,
  };

  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export default function UserLayout() {
  const { pathname } = useLocation();
  const [profile, setProfileState] = useState(() => {
    const session = getSession();
    return {
      firstName: "", lastName: "", birthDate: "",
      avatar: null, avatarPhoto: "", address: "", location: null,
      ...readCustomerProfile(session?.phone),
      phone: session?.role === "customer" ? session.phone || "" : "",
    };
  });

  function setProfile(next) {
    const updated = { ...next, phone: profile.phone };
    saveCustomerProfile(profile.phone, updated);
    setProfileState(updated);
  }

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <div className="uc-app">
      <a className="uc-skip-link" href="#uc-content">Kontentga o‘tish</a>
      <header className="uc-header">
        <div className="uc-header-inner">
          <Link to="/user" className="uc-logo" aria-label="USTARA — bosh sahifa">
            USTARA<span className="uc-logo-dot">.</span>
          </Link>
          <details className="uc-notifications" key={pathname}>
            <summary className="uc-notification-trigger" aria-label="Bildirishnomalar">
              <UserIcon name="bell" />
            </summary>
            <div className="uc-notification-panel">
              <h2 className="uc-notification-title">Bildirishnomalar</h2>
              <p className="uc-description">Bildirishnomalar funksiyasi tez orada qo‘shiladi.</p>
            </div>
          </details>
        </div>
      </header>

      <main id="uc-content" className="uc-main" tabIndex={-1}>
        <Outlet context={{ profile, setProfile }} />
      </main>

      <nav className="uc-nav" aria-label="Mijoz navigatsiyasi">
        <div className="uc-nav-inner">
          {navigation.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => `uc-nav-item${isActive ? " uc-nav-item-active" : ""}`}>
              {icon === "profile" ? (
                <Avatar photo={profile.avatarPhoto} name={profile.firstName} size={24} className="uc-nav-avatar" />
              ) : <UserIcon name={icon} />}
              <span className="uc-nav-label">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
