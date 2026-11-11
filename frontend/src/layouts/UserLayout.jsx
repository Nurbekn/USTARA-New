import Icon from "../components/Icon";
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
              <Icon strokeWidth={1.8} name="bell" />
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
              ) : <Icon strokeWidth={1.8} name={icon} />}
              <span className="uc-nav-label">{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
