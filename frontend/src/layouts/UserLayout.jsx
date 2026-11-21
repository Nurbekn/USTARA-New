import { Suspense, useState, useRef } from "react";
import SiteLanguageSelect from "../components/SiteLanguageSelect";
import { getSiteUi, readSiteLocale, siteLocalePath } from "../utils/siteLocale.js";
import { loadCustomerBookings } from "../pages/user/bookings/model";
import { buildSmartNotificationCenterV174, smartNotificationTextV174 } from "../pages/user/bookings/smartNotificationCenterV174.js";
import Loading from "../components/Loading";
import ContextGuideV166 from "../components/onboarding/ContextGuideV166";
import { BrandSymbol } from "../components/brand/BrandLogo";
import Icon from "../components/Icon";
import { useEffect } from "react";
import { loadCustomerProfile } from "../pages/user/data/profile";
import { Avatar } from "../components/Avatar";
import { getSession, subscribeSession } from "../pages/auth/utils/session";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import "./UserLayout.css";

const navigation = [
  // Decision #60: keep the user-approved five tabs and their order.
  { to: "/user", label: "Asosiy", icon: "home", end: true },
  { to: "/user/explore?type=barbers", label: "Sartaroshlar", icon: "explore" },
  { to: "/user/social", label: "Ilhom", icon: "social" },
  { to: "/user/bookings", label: "Bronlar", icon: "bookings" },
  { to: "/user/profile", label: "Profil", icon: "profile" },
];

export default function UserLayout() {
  const { pathname, search } = useLocation();
  const lang = readSiteLocale(search);
  const ui = getSiteUi(lang).customer;
  const session = getSession();
  const [serverProfile, setServerProfile] = useState(null);
  const notificationsRef = useRef(null);
  const notificationsController = useRef(null);
  const [bookingInbox, setBookingInbox] = useState({ status: "idle", items: [] });
  const [inboxFilter, setInboxFilter] = useState('all');
  // Account switches revoke the old in-memory snapshot immediately, even if
  // the layout remains mounted. Never cache another customer's notices.
  const inboxIdentity = useRef({ token: session?.token, accountId: session?.accountId, profileId: session?.profileId });
  useEffect(() => subscribeSession(() => {
    const now = getSession();
    const old = inboxIdentity.current;
    if (old.token !== now?.token || old.accountId !== now?.accountId || old.profileId !== now?.profileId) {
      notificationsController.current?.abort();
      notificationsRef.current && (notificationsRef.current.open = false);
      inboxIdentity.current = { token: now?.token, accountId: now?.accountId, profileId: now?.profileId };
      setBookingInbox({ status: 'idle', items: [] });
      setInboxFilter('all');
    }
  }), []);
  async function refreshBookingInbox() {
    const source = getSession();
    if (source?.role !== 'customer') { setBookingInbox({ status: 'idle', items: [] }); return; }
    notificationsController.current?.abort();
    const controller = new AbortController();
    notificationsController.current = controller;
    setBookingInbox({ status: "loading", items: [] });
    try {
      const bookings = await loadCustomerBookings({ signal: controller.signal });
      const current = getSession();
      if (!controller.signal.aborted && current?.token === source.token && current?.accountId === source.accountId && current?.profileId === source.profileId)
        setBookingInbox({ status: "ready", items: bookings });
    } catch {
      const current = getSession();
      if (!controller.signal.aborted && current?.token === source.token && current?.accountId === source.accountId && current?.profileId === source.profileId)
        setBookingInbox({ status: "error", items: [] });
    }
  }
  function openBookingInbox(event) {
    if (event.currentTarget.open) refreshBookingInbox();
    else { notificationsController.current?.abort(); setBookingInbox({ status:'idle', items:[] }); }
  }
  useEffect(() => () => notificationsController.current?.abort(), []);
  const smartInbox = buildSmartNotificationCenterV174(bookingInbox.items, { filter:inboxFilter, lang });
  const smartCopy = smartNotificationTextV174(lang);
  useEffect(() => { const controller = new AbortController(); loadCustomerProfile({signal:controller.signal}).then(setServerProfile).catch(() => {}); return () => controller.abort(); }, [pathname]);
  useEffect(() => { const close = (event) => { if (notificationsRef.current && !notificationsRef.current.contains(event.target)) notificationsRef.current.open = false; }; document.addEventListener("pointerdown", close); return () => document.removeEventListener("pointerdown", close); }, []);
  const profile = {
    firstName: session?.profile?.first_name || "",
    lastName: session?.profile?.last_name || "",
    avatar: null, avatarPhoto: "", address: "", location: null,
    phone: session?.role === "customer" ? session.phone || "" : "",
    ...serverProfile,
  };

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return (
    <div className="uc-app" lang={lang}>
      <a className="uc-skip-link" href="#uc-content">{ui.skip}</a>
      <header className="uc-header">
        <div className="uc-header-inner">
          <Link to={siteLocalePath("/user", lang)} className="uc-logo" aria-label={ui.homeLabel}>
            <BrandSymbol size={40} />
          </Link>
          <SiteLanguageSelect className="uc-language" />
          <Link to={siteLocalePath("/help", lang)} aria-label={ui.help} title={ui.help} className="uc-help-link" style={{ color: 'inherit', fontSize: 14, marginLeft: 'auto', marginRight: 12 }}>{ui.help}</Link>
          <details className="uc-notifications" key={pathname} ref={notificationsRef} onToggle={openBookingInbox}>
            <summary className="uc-notification-trigger" aria-label={ui.notifications}>
              <Icon strokeWidth={1.8} name="bell" />
            </summary>
            <div className="uc-notification-panel">
              <h2 className="uc-notification-title">{ui.notifications}</h2>
              <p className="uc-inbox-subtitle">{smartCopy.explanation}</p>
              <div className="uc-inbox-filters" role="group" aria-label={ui.notifications}>
                {(['all','active','history']).map((kind) => <button type="button" key={kind} aria-pressed={inboxFilter === kind} onClick={() => setInboxFilter(kind)}>{smartCopy[kind]} <span>{smartInbox.counts[kind]}</span></button>)}
              </div>
              <button className="uc-inbox-refresh" type="button" onClick={refreshBookingInbox} disabled={bookingInbox.status === 'loading'}>{smartCopy.refresh}</button>
              {bookingInbox.status === "loading" && <p className="uc-description" role="status">{ui.loading}</p>}
              {bookingInbox.status === "error" && <p className="uc-description" role="alert">{ui.error}</p>}
              {bookingInbox.status === "ready" && (smartInbox.items.length
                ? <ul className="uc-inbox-items">{smartInbox.items.map((item) => <li key={item.id}><Link to={siteLocalePath(item.url, lang)} onClick={() => { if (notificationsRef.current) notificationsRef.current.open = false; }}><strong>{item.title}</strong><span>{item.detail}</span></Link></li>)}</ul>
                : <p className="uc-description">{smartCopy.emptyFilter}</p>)}
              {bookingInbox.status === "ready" && smartInbox.truncated && <p className="uc-description">{smartCopy.limited}</p>}
              <Link className="uc-inbox-footer" to={siteLocalePath("/user/bookings", lang)} onClick={() => { if (notificationsRef.current) notificationsRef.current.open = false; }}>{ui.allBookings}</Link>
            </div>
          </details>
        </div>
      </header>

      <ContextGuideV166 role="customer" pathname={pathname} lang={lang} accountId={session?.accountId} key={session?.accountId ?? "no-session"} />
      <main id="uc-content" className="uc-main" tabIndex={-1}>
        <Suspense fallback={<Loading />}><Outlet context={{ profile }} /></Suspense>
      </main>

      <nav className="uc-nav" aria-label={ui.navLabel}>
        <div className="uc-nav-inner">
          {navigation.map(({ to, label, icon, end }) => (
            <NavLink key={to} to={siteLocalePath(to, lang)} end={end} className={({ isActive }) => `uc-nav-item${isActive ? " uc-nav-item-active" : ""}`}>
              {icon === "profile" ? (
                <Avatar photo={profile.avatarPhoto} name={profile.firstName} size={24} className="uc-nav-avatar" />
              ) : <Icon strokeWidth={1.8} name={icon} />}
              <span className="uc-nav-label">{ui[({home:"home", explore:"barbers", social:"inspiration", bookings:"bookings", profile:"profile"})[icon]] || label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
