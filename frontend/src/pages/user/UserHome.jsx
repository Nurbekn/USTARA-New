import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext } from "react-router-dom";
import { customerCoreLocale, customerCoreUi } from "./coreLocale.js";
import { siteLocalePath } from "../../utils/siteLocale.js";
import ArrowIcon from "../../components/ArrowIcon";
import Icon from "../../components/Icon";
import { Avatar } from "../../components/Avatar";
import { getSession, subscribeSession } from "../auth/utils/session";
import { request } from "../../api/client";
import { loadExploreCatalog } from "./explore/catalog.js";
import { loadSocial } from "./social/model.js";
import { loadCustomerBookings } from "./bookings/model.js";
import { activeBookings, homeBarberSections, homeSessionIdentity, verifiedHomeFollowing, verifiedHomePromotions, canBookBarber } from "./explore/homeModel.js";
import "./UserHome.css";
const BarbersMap = lazy(() => import("./BarbersMap"));

const STYLES = ["Fade", "Textured crop", "Classic side part"];
function StyleGallery({ lang, ui }) {
  const [open, setOpen] = useState(false);
  const views = [ui.sideFront, ui.sideSide, ui.sideBack];
  const [style, setStyle] = useState(0);
  const [view, setView] = useState(0);
  const pos = (index) => `${index * 50}%`;
  const changeView = (step) => setView(current => (current + step + views.length) % views.length);
  return <section className={`uh-styles${open ? " is-open" : ""}`} aria-label={ui.hairstyles} style={{ "--uh-gallery-url": `url("${import.meta.env.BASE_URL}images/haircut-views.webp")` }}>
    <button className="uh-style-toggle" type="button" aria-expanded={open} aria-controls="uh-style-gallery" onClick={() => setOpen(value => !value)}>
      <span className="uh-style-toggle-icon"><Icon name="scissors" size={24}/></span>
      <span className="uh-style-toggle-copy"><strong>{ui.hairstyles}</strong><span>{ui.hairstyleDesc}</span></span>
      <span className="uh-style-toggle-arrow"><Icon name="chevronRight" size={20}/></span>
    </button>
    <div id="uh-style-gallery" hidden={!open}>
      {open && <div className="uh-style-content">
        <div className="uh-style-choice" role="group" aria-label={ui.chooseHairstyle}>{STYLES.map((name,index) => <button type="button" key={name} aria-pressed={style === index} onClick={() => { setStyle(index); setView(0); }}><span className="uh-style-preview" style={{backgroundPosition: `${pos(0)} ${pos(index)}`}}/><span>{name}</span></button>)}</div>
        <div className="uh-style-main">
          <div className="uh-style-stage">
            <span className="uh-style-stage-label">{String(style + 1).padStart(2, "0")} / {ui.styleLabel}</span>
            <div key={`${style}-${view}`} className="uh-style-model" style={{"--style-angle": `${[0, -9, 9][view]}deg`}}>
              <div className="uh-style-picture" role="img" aria-label={`${STYLES[style]} — ${views[view]}`} style={{ backgroundPosition: `${pos(view)} ${pos(style)}` }}/>
            </div>
            <div className="uh-style-pedestal" aria-hidden="true"/>
            <div className="uh-style-rotate"><button type="button" aria-label={ui.previousView} onClick={() => changeView(-1)}><Icon name="chevronRight" size={18}/></button><span aria-live="polite">{views[view]}  {lang === "uz" ? "ko‘rinish" : ""}</span><button type="button" aria-label={ui.nextView} onClick={() => changeView(1)}><Icon name="chevronRight" size={18}/></button></div>
          </div>
          <div className="uh-style-actions">
            <span className="uh-style-eyebrow">{ui.newStyle}</span>
            <strong>{STYLES[style]}</strong>
            <p>{ui.styleHint}</p>
            <div role="group" aria-label={ui.styleViews}>{views.map((name,i) => <button type="button" key={name} aria-pressed={view === i} onClick={() => setView(i)}>{name}</button>)}</div>
            <Link className="uh-style-link" to={siteLocalePath("/user/explore?type=barbers", lang)}>{ui.selectBarber} <ArrowIcon/></Link>
          </div>
        </div>
      </div>}
    </div>
  </section>;
}
export default function UserHome() {
  const navigate = useNavigate();
  const lang = customerCoreLocale(useLocation().search);
  const ui = customerCoreUi(lang).home;
  const { profile } = useOutletContext();
  const [mapOpen, setMapOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [timeNow, setTimeNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setTimeNow(Date.now()), 30000); return () => clearInterval(timer); }, []);
  const emptyHome = () => ({ status: "loading", barbers: [], following: [], bookings: [], promotionIds: [], error: "", issues: [] });
  const [state, setState] = useState(emptyHome);
  const [sessionIdentity, setSessionIdentity] = useState(() => homeSessionIdentity(getSession()));
  useEffect(() => subscribeSession(() => {
    const next = homeSessionIdentity(getSession());
    setSessionIdentity(previous => previous === next ? previous : next);
  }), []);
  useEffect(() => {
    const controller = new AbortController();
    const currentSession = getSession();
    if (!sessionIdentity || homeSessionIdentity(currentSession) !== sessionIdentity) {
      setState({ ...emptyHome(), status: "error", error: "Akkauntga qayta kiring." });
      return () => controller.abort();
    }
    setState(emptyHome()); // Do not retain another account's cards during a retry.
    setMapOpen(false);
    Promise.allSettled([
      loadExploreCatalog({ signal: controller.signal, token: currentSession.token }),
      loadSocial({ signal: controller.signal }),
      loadCustomerBookings({ signal: controller.signal }),
      request("GET", "/api/promotions", { signal: controller.signal }),
    ]).then(([directory,social,bookings,promotions]) => {
      if (controller.signal.aborted || homeSessionIdentity(getSession()) !== sessionIdentity) return;
      const issues = [];
      const barbers = directory.status === 'fulfilled' ? directory.value.barbers : [];
      let following = [], promotionIds = [];
      if (social.status === 'fulfilled') {
        try { following = verifiedHomeFollowing(social.value?.following, barbers); }
        catch { issues.push('Kuzatuvlar tekshirilmadi.'); }
      } else issues.push('Kuzatuvlar yuklanmadi.');
      if (promotions.status === 'fulfilled') {
        try { promotionIds = verifiedHomePromotions(promotions.value, barbers); }
        catch { issues.push('Reklamalar tekshirilmadi.'); }
      } else issues.push('Reklamalar yuklanmadi.');
      if (bookings.status !== 'fulfilled' || !Array.isArray(bookings.value))
        issues.push('Bronlar yuklanmadi.');
      setState({
        status: directory.status === 'fulfilled' ? 'ready' : 'error',
        barbers, following,
        bookings: bookings.status === 'fulfilled' && Array.isArray(bookings.value) ? bookings.value : [],
        promotionIds,
        error: directory.status === 'rejected' ? 'Sartaroshlar yuklanmadi.' : '',
        issues,
      });
    });
    return () => controller.abort();
  }, [attempt, sessionIdentity]);
  // Render-time guard: do not show old-account cards in the frame before useEffect cleanup.
  const visibleState = homeSessionIdentity(getSession()) === sessionIdentity && sessionIdentity ? state : emptyHome();
  const sections = useMemo(() => homeBarberSections(visibleState.barbers, visibleState.following, profile.location), [visibleState.barbers, visibleState.following, profile.location]);
  const ordered = sections.all;
  const featured = ordered.filter(b => visibleState.promotionIds.includes(b.id));
  const upcoming = activeBookings(visibleState.bookings, timeNow).slice(0, 3);
  function search(event) { event.preventDefault(); const params = new URLSearchParams({type:'barbers'}); if(query.trim())params.set('q',query.trim());navigate(siteLocalePath(`/user/explore?${params}`, lang)); }
  return <div className="uh-home">
    <form className="uh-search" role="search" onSubmit={search}><label className="uh-sr-only" htmlFor="uh-search-input">{ui.search}</label><Icon name="search" size={20}/><input id="uh-search-input" type="search" maxLength={160} placeholder={ui.searchPlaceholder} value={query} onChange={e => setQuery(e.target.value)}/><button type="submit" aria-label={ui.searchButton}><ArrowIcon/></button></form>
    {upcoming.length > 0 && <section className="uh-booking-strip" aria-label={ui.upcomingRegion}>{upcoming.map(upcoming => <Link key={upcoming.id} className="uh-upcoming" to={siteLocalePath(`/user/bookings?booking=${upcoming.id}`, lang)}><span>{ui.upcoming}</span><strong>{[upcoming.barber?.first_name,upcoming.barber?.last_name].filter(Boolean).join(' ')}</strong><time dateTime={upcoming.startsAt}>{new Date(upcoming.startsAt).toLocaleString('en-GB',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit',timeZone:'Asia/Tashkent'})}</time><ArrowIcon/></Link>)}</section>}
    {visibleState.issues?.length > 0 && <div className="uh-partial-error" role="alert"><span>{visibleState.issues.join(" ")}</span><button type="button" onClick={() => setAttempt(n => n + 1)}>{ui.retry}</button></div>}
    {visibleState.status === 'ready' && sections.topFollowing.length > 0 &&
      <section className="uh-follow-section" aria-labelledby="uh-follow-title">
        <header className="uh-section-heading"><h2 id="uh-follow-title">{ui.following}</h2><span className="uh-follow-count">{sections.topFollowing.length} {ui.followCount}</span></header>
        <div className="uh-barber-grid uh-barbers-compact">{sections.topFollowing.map(barber =>
          <article className="uh-barber-card" key={barber.id}>
            <Link className="uh-ad-identity" to={siteLocalePath(`/user/barbers/${barber.id}`, lang)}>
              <Avatar photo={barber.avatarPhoto} name={[barber.first_name, barber.last_name].filter(Boolean).join(' ')} size={48}/>
              <div><h2>{[barber.first_name, barber.last_name].filter(Boolean).join(' ') || 'Sartarosh'}</h2>
                <p className="uh-barber-area">{barber.address || barber.specialty || ''}</p></div>
              <span className="uh-followed" aria-label={ui.followingTag}><Icon name="check" size={18}/></span>
            </Link>
            <div className="uh-card-actions"><Link to={siteLocalePath(`/user/barbers/${barber.id}`, lang)}>{ui.profile}</Link>
              {canBookBarber(barber) ? <Link className="uh-book-action" to={siteLocalePath(`/user/barbers/${barber.id}?tab=services`, lang)}>{ui.book} <ArrowIcon/></Link>
                : <span className="uh-services-unavailable">{ui.unavailable}</span>}</div>
          </article>)}
        </div>
      </section>}
    {featured.length > 0 && <section className="uh-featured" aria-label={ui.ad}><div className="uh-section-heading"><h2>{ui.suggested}</h2><span className="uh-sponsored-label">{ui.ad}</span></div><div className="uh-barber-grid">{featured.map(barber => <Link className="uh-barber-card" key={barber.id} to={siteLocalePath(`/user/barbers/${barber.id}`, lang)}><div className="uh-ad-identity"><Avatar photo={barber.avatarPhoto} name={`${barber.first_name} ${barber.last_name}`} size={58}/><div><h2>{[barber.first_name,barber.last_name].filter(Boolean).join(' ')}</h2><p className="uh-barber-area">{barber.specialty || 'Sartarosh'}</p></div></div><span className="uh-ad-cta">{ui.viewProfile} <ArrowIcon/></span></Link>)}</div></section>}
    <StyleGallery lang={lang} ui={ui}/>
    <button className="uh-map-link" type="button" aria-expanded={mapOpen} aria-controls="uh-map" disabled={visibleState.status !== 'ready' || !ordered.length} onClick={() => setMapOpen(value => !value)}><Icon name="pin" size={20}/>{mapOpen ? ui.mapHide : ui.mapShow}<ArrowIcon/></button>
    {mapOpen && visibleState.status === 'ready' && <div id="uh-map"><Suspense fallback={<p role="status">{ui.mapLoading}</p>}><BarbersMap barbers={ordered} userLocation={profile.location}/></Suspense></div>}
    <section className="uh-barbers" aria-labelledby="uh-barbers-title" aria-busy={visibleState.status === 'loading'}><header className="uh-section-heading"><h2 id="uh-barbers-title">{sections.topFollowing.length ? ui.other : ui.barbers}</h2><Link to={siteLocalePath("/user/explore?type=barbers", lang)}>{ui.all} <ArrowIcon/></Link></header>
      {visibleState.status === 'loading' ? <p role="status">{ui.loading}</p> : visibleState.status === 'error' ? <div role="alert"><p>{visibleState.error}</p><button type="button" onClick={() => setAttempt(n => n+1)}>{ui.retry}</button></div> : !ordered.length ? <div className="uh-empty"><Icon name="search" size={28}/><p>{ui.empty}</p></div> : !sections.rest.length ? <p className="uh-all-followed">{ui.allFollowed}</p> : <div className={`uh-barber-grid ${sections.rest.length <= 3 ? 'uh-barbers-detailed' : 'uh-barbers-compact'}`}>{sections.rest.map(barber => <article className="uh-barber-card" key={barber.id}><Link className="uh-ad-identity" to={siteLocalePath(`/user/barbers/${barber.id}`, lang)}><Avatar photo={barber.avatarPhoto} name={[barber.first_name,barber.last_name].filter(Boolean).join(' ')} size={sections.rest.length <= 3 ? 64 : 44}/><div><h2>{[barber.first_name,barber.last_name].filter(Boolean).join(' ') || 'Sartarosh'}</h2>{typeof barber.rating === 'number' && Number.isFinite(barber.rating) && <span className="uh-rating">★ {barber.rating.toFixed(1)}</span>}<p className="uh-barber-area">{barber.address || barber.specialty || ''}</p></div>{visibleState.following.includes(`barber:${barber.id}`) && <span className="uh-followed" aria-label={ui.followingTag}><Icon name="check" size={18}/></span>}</Link>{sections.rest.length <= 3 && <><p className="uh-services-summary">{barber.services?.slice(0,3).map(service => service.name).join(' · ')}</p><div className="uh-card-actions"><Link to={siteLocalePath(`/user/barbers/${barber.id}`, lang)}>{ui.profile}</Link>{canBookBarber(barber)
          ? <Link className="uh-book-action" to={siteLocalePath(`/user/barbers/${barber.id}?tab=services`, lang)}>{ui.book} <ArrowIcon/></Link>
          : <span className="uh-services-unavailable">{ui.unavailable}</span>}</div></>}</article>)}</div>}
    </section>

  </div>;
}
