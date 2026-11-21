import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { profileName } from "../../../utils/profileName.js";
import BarberPublicBadgesV162 from "./BarberPublicBadgesV162.jsx";
import VerifiedAvatar from "../../../components/VerifiedAvatar";
import Sheet from "../../../components/Sheet";
import { formatDate } from "../../../utils/format";
import ArrowIcon from "../../../components/ArrowIcon";
import Icon from "../../../components/Icon";
import PageLoading from "../../../components/Loading";
import { getSession } from "../../auth/utils/session";
import { loadBarberProfile } from "./publicProfile.js";
import { publicProfileTab, publicProfileTabLink, publicPostAriaLabel } from "./profileNavigation.js";
import InlineBooking from "./InlineBooking";
import PublicQueueSummary from "./PublicQueueSummary";
import ProfileIssueReport from "./ProfileIssueReport";
import PublicProfileShare from "./PublicProfileShare.jsx";
import PublishedShopLinkV172 from "../../shops/PublishedShopLinkV172.jsx";
import "./BarberPublicProfile.css";
import { readSiteLocale, siteLocalePath, siteLocaleSwitchUrl } from "../../../utils/siteLocale.js";
import { publicProfileUi } from "./publicProfileLocale.js";
import { publicBarberMapLinksV175, publicNavigationTextV175 } from "./publicNavigationV175.js";
import { publicBarberPhoneHrefV178 } from "./publicPhoneV178.js";

const TABS = [
  { id: "posts", label: "Postlar", icon: "grid" },
  { id: "services", label: "Xizmatlar", icon: "socialScissors" },
  { id: "hours", label: "Ish vaqti", icon: "clock" },
  { id: "reviews", label: "Sharhlar", icon: "star" },
];

function ProfileMedia({ media, thumbnail = false, alt, ui = publicProfileUi() }) {
  const [failed, setFailed] = useState(!media?.url);
  return <div className={`bpv-media${thumbnail ? ' is-thumb' : ''}`}>
    {failed ? <span className="bpv-media-placeholder"><Icon name={media?.type === 'video' ? 'grid' : 'camera'} size={28}/><span>{media?.type === 'video' ? ui.videoFailed : ui.imageFailed}</span></span> : media.type === 'video' ? <video src={media.url} controls={!thumbnail} muted={thumbnail} playsInline preload={thumbnail ? "none" : "metadata"} onError={() => setFailed(true)}/> : <img src={media.url} alt={media.alt || alt} loading={thumbnail ? 'lazy' : 'eager'} decoding="async" onError={() => setFailed(true)}/>}
    {thumbnail && !failed && media?.type === 'video' && <span className="bpv-video-mark" aria-hidden="true">▷</span>}
  </div>;
}
function ProfileContent({ barber, details, backTo, onRetry }) {
  const location = useLocation();
  const navigate = useNavigate();
  const lang = readSiteLocale(location.search);
  const ui = publicProfileUi(lang);
  const tab = publicProfileTab(location.search);
  const bookingLink = publicProfileTabLink(location.search, "services");
  function selectTab(nextTab) {
    if (nextTab === tab) return;
    navigate(publicProfileTabLink(location.search, nextTab), { state: location.state });
  }
  const [aboutOpen, setAboutOpen] = useState(false);
  const [post, setPost] = useState(null);
  const [mediaIndex, setMediaIndex] = useState(0);
  const mapLinks = publicBarberMapLinksV175(barber);
  const barberPhoneHref = publicBarberPhoneHrefV178(barber.phone);
  const navigationText = publicNavigationTextV175(lang);
  const name = profileName(barber) || ui.defaultName;
  const error = details.errors?.[tab];
  const needsLogin = typeof error === "string" && error.includes("tizimga kiring");
  return <div className="bpv-page">
    <div className="bpv-topbar"><Link to={backTo} aria-label={ui.back}><ArrowIcon direction="left"/></Link><h1>{name}</h1></div>
    <header className="bpv-profile-head">
      <div className="bpv-profile-row"><VerifiedAvatar verified photo={barber.avatar_url} name={name} size={76}/>
        <dl className="bpv-stats"><div><dt>{details.errors?.posts ? '—' : details.posts.length}</dt><dd>{ui.post}</dd></div><div><dt>{details.services.length}</dt><dd>{ui.service}</dd></div><div><dt className="bpv-rating-number"><Icon name="star" size={16} filled/>{!details.errors?.reviews && details.reviewSummary.count ? details.reviewSummary.average.toFixed(1) : '—'}</dt><dd>{details.errors?.reviews ? ui.rating : `${details.reviewSummary.count} ${ui.review}`}</dd></div></dl>
      </div>
      <div className="bpv-bio"><p className="bpv-category"><span className="bpv-approved"><Icon name="check" size={14}/>{ui.verified}</span>{barber.specialty || 'Sartarosh'}</p>
        <BarberPublicBadgesV162 barberId={barber.id} lang={lang} />
        {barber.salon_name && <p className="bpv-business">{barber.salon_name}</p>}
        {barber.address && <details className="bpv-address"><summary><Icon name="pin" size={16}/><span>{barber.address}</span><Icon name="chevronRight" size={14}/></summary></details>}
        <div className="bpv-bio-tools">{barberPhoneHref && <a className="bpv-map-link" href={barberPhoneHref}><Icon name="phone" size={16}/>{ui.callBarber}: {barber.phone}</a>}{mapLinks.length > 0 && <details className="bpv-navigation-v175"><summary className="bpv-map-link"><Icon name="pin" size={16}/>{navigationText.open}</summary><div className="bpv-navigation-options-v175" role="group" aria-label={navigationText.open}>{mapLinks.map(link => <a className="bpv-navigation-choice-v175" key={link.name} href={link.href} target="_blank" rel="noopener noreferrer">{link.name} <Icon name="external" size={13}/></a>)}</div><p className="bpv-navigation-hint-v175">{navigationText.hint}</p></details>}
          {barber.bio && <button type="button" className="bpv-about-toggle" aria-expanded={aboutOpen} aria-controls="bpv-about" onClick={() => setAboutOpen(value => !value)}>{ui.about}</button>}
        </div>
        {aboutOpen && <p className="bpv-about-text" id="bpv-about">{barber.bio}</p>}
        {Array.isArray(barber.certificates) && barber.certificates.length > 0 && <section className="bpv-certificates-v171" aria-label={({ uz: "Sertifikatlar", ru: "Сертификаты", en: "Certificates" })[lang]}>
          <strong>{({ uz: "Sertifikatlar", ru: "Сертификаты", en: "Certificates" })[lang]}</strong>
          <p className="bpv-about-text">{({ uz: "Sartarosh kiritgan ma’lumotlar — USTARA tomonidan tasdiqlanmagan.", ru: "Указаны барбером, не проверены USTARA.", en: "Self-reported by the barber; not verified by USTARA." })[lang]}</p>
          <ul>{barber.certificates.map((c, i) => <li key={`${c.title}-${i}`}>{c.title} — {c.issuer} ({c.year})</li>)}</ul>
        </section>}
        <PublishedShopLinkV172 barberId={barber.id} />
        <PublicProfileShare barber={barber} />
        {getSession()?.role === "customer" && <Link className="bpv-chat-link" to={siteLocalePath(`/user/chat?barber=${barber.id}`,lang)}>{({uz:"Xabar yozish",ru:"Написать",en:"Message"})[lang]||"Xabar yozish"}</Link>}
        <Link to={siteLocalePath("/help?topic=booking", lang)} className="bpv-help-link">{ui.help}</Link>
      </div>
      <div className="bpv-booking-actions">
        {details.services.length > 0 ? <Link className="bpv-booking-jump" to={bookingLink} state={location.state}>
          <Icon name="socialCalendar" size={19}/> {ui.book} <ArrowIcon direction="right"/>
        </Link> : <p className="bpv-booking-unavailable" role="status">{ui.noService}</p>}
        <p className="bpv-booking-hint">{ui.bookingHint}</p>
      </div>
    </header>
    <ProfileIssueReport barberId={barber.id} lang={lang} />
    <PublicQueueSummary barberId={barber.id} lang={lang} />
    <div className="bpv-tabs" role="group" aria-label={ui.tabs}>{TABS.map(item => <button type="button" key={item.id} aria-pressed={tab === item.id} aria-controls="bpv-content" onClick={() => selectTab(item.id)}><Icon name={item.icon} size={18}/><span>{ui[item.id]}</span></button>)}</div>
    <section className="bpv-content" id="bpv-content" tabIndex={-1} aria-label={ui[tab]}>
      {error ? <div className="bpv-notice" role="alert"><p>{lang === "uz" ? error : needsLogin ? ui.loginRequired : ui.error}</p>{needsLogin
        ? <Link className="bpv-retry" to={siteLocalePath("/login", lang)}>{ui.login}</Link>
        : <button type="button" className="bpv-retry" onClick={onRetry}>{ui.retry}</button>}</div> : <>
        {tab === 'posts' && (details.posts.length ? <div className="bpv-posts">{details.posts.map(item => <button type="button" className="bpv-post" key={item.id} aria-label={publicPostAriaLabel(item)} onClick={() => { setPost(item); setMediaIndex(0); }}><ProfileMedia key={`${item.id}-${item.media[0]?.url || "empty"}`} thumbnail ui={ui} media={item.media[0]} alt={`${name} ${ui.post}`}/>{item.featured === true && <span className="bpv-featured-mark" aria-label={lang === 'ru' ? 'Избранная работа' : lang === 'en' ? 'Featured work' : 'Tanlangan ish'}>★</span>}{item.media.length > 1 && <span className="bpv-media-count">{item.media.length}</span>}</button>)}</div> : <p className="bpv-notice">{ui.noPosts}</p>)}
        {tab === 'services' && <InlineBooking barber={barber} details={details} bookingsPath="/user/bookings"/>}
        {tab === 'hours' && (details.hours.length ? <div className="bpv-schedule"><p className="bpv-timezone">{ui.timezone}</p>{[1,2,3,4,5,6,0].map(day => { const hours = details.hours.find(item => item.day_of_week === day);return <div className={`bpv-hours-row${hours ? '' : ' is-off'}`} key={day}><span>{ui.days[day]}</span><strong>{hours ? `${hours.start_time} – ${hours.end_time}` : ui.off}</strong></div>; })}</div> : <p className="bpv-notice">{ui.noHours}</p>)}
        {tab === 'reviews' && <div className="bpv-reviews">{details.reviews.length ? details.reviews.map(review => <article className="bpv-review" key={review.id}><strong>{review.customer || ui.customer}</strong><span className="bpv-review-stars"><Icon name="star" size={15} filled/>{review.rating}/5</span><p>{review.text || ui.noText}</p>{review.reply && <div><b>{ui.reply}</b><p>{review.reply}</p></div>}</article>) : <p className="bpv-notice">{ui.noReviews}</p>}</div>}
      </>}
    </section>
    <Sheet open={!!post} title={ui.postTitle} className="bpv-post-modal" onClose={() => setPost(null)}>{post && <div className="bpv-post-detail"><div className="bpv-post-author"><VerifiedAvatar verified photo={barber.avatar_url} name={name} size={34}/><strong>{name}</strong></div><ProfileMedia key={`${post.id}-${mediaIndex}`} ui={ui} media={post.media[mediaIndex]} alt={`${name} ${ui.post}`}/>{post.media.length > 1 && <div className="bpv-media-switch" role="group" aria-label={ui.postImages}>{post.media.map((item,index) => <button type="button" key={index} aria-pressed={index === mediaIndex} onClick={() => setMediaIndex(index)}>{index + 1}</button>)}</div>}{post.caption && <p>{post.caption}</p>}{post.createdAt && <time dateTime={post.createdAt}>{formatDate(post.createdAt)}</time>}</div>}</Sheet>
  </div>;
}

export default function BarberPublicProfile() {
  const { id } = useParams();
  const location = useLocation();
  const lang = readSiteLocale(location.search);
  const ui = publicProfileUi(lang);
  useOutletContext(); // Optional for guest route, where no customer layout is mounted.
  const customerRoute = location.pathname.startsWith("/user/");
  const [request, setRequest] = useState({ id: null, status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    loadBarberProfile(id, { token: customerRoute && getSession()?.role === "customer" ? getSession()?.token : undefined, signal: controller.signal })
      .then((data) => { if (active) setRequest({ id, status: "ready", ...data }); })
      .catch((error) => {
        if (active) setRequest({ id, status: error.status === 404 && error.resource !== "services" ? "not_found" : "error", message: error.status === 401 ? ui.loginRequired : ui.error });
      });
    return () => { active = false; controller.abort(); };
  }, [id, attempt, customerRoute, lang]);
  const isCustomerRoute = location.pathname.startsWith('/user/');
  const baseExplore = siteLocalePath(isCustomerRoute ? '/user/explore?type=barbers' : '/explore?type=barbers', lang);
  const backTo = typeof location.state?.from === 'string'
    && (/^\/user\/explore(?:\?|$)/.test(location.state.from) && isCustomerRoute
      || /^\/explore(?:\?|$)/.test(location.state.from) && !isCustomerRoute)
    ? siteLocaleSwitchUrl({ pathname: location.state.from.split('?')[0], search: location.state.from.includes('?') ? '?' + location.state.from.split('?').slice(1).join('?') : '' }, lang) : baseExplore;
  const current = request.id === id ? request : { status: "loading" };
  if (current.status === "loading") return <div className="bpv-page" aria-busy="true"><Link className="ex-back" to={backTo}><ArrowIcon direction="left" /> {ui.back}</Link><PageLoading label={ui.loading} /></div>;
  if (current.status === "error") return <div className="bpv-page bpv-empty" role="alert"><h1>{ui.loadFailed}</h1><p>{current.message}</p><button className="ex-action" type="button" onClick={() => { setRequest({ id, status: "loading" }); setAttempt((value) => value + 1); }}>{ui.retry}</button><Link to={backTo}>{ui.back}</Link></div>;
  if (current.status === "not_found" || !current.barber || !current.details) return <div className="bpv-page bpv-empty"><h1>{ui.notFound}</h1><p>{ui.notFoundHint}</p><Link to={backTo}>{ui.back}</Link></div>;
  return <>{!customerRoute && <p className="bpv-guest-note" role="note">{ui.guest}</p>}<ProfileContent key={id} barber={current.barber} details={current.details} backTo={backTo} onRetry={() => { setRequest({ id, status: "loading" }); setAttempt(value => value + 1); }} /></>;
}
