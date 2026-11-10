import { useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import ArrowIcon from "../../components/ArrowIcon";
import VerifiedBadge from "../../components/VerifiedBadge";
import UserIcon from "./components/UserIcon";
import { sampleBarbers, sampleBarberDetails, sampleHairstyles, sampleHairAtlas } from "../home/sampleData";
import "./UserHome.css";

const VIEWS = ["Oldidan", "Yonidan", "Orqadan"];
const atlasPosition = (row, column) => `${column * 50}% ${row * 50}%`;
const money = (price) => new Intl.NumberFormat("uz-UZ").format(price);

export default function UserHome() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [styleId, setStyleId] = useState(sampleHairstyles[0].id);
  const [view, setView] = useState(0);
  const pointerStart = useRef(null);
  const selectedStyle = sampleHairstyles.find((style) => style.id === styleId);

  function search(event) {
    event.preventDefault();
    const params = new URLSearchParams({ demo: "1", type: "barbers" });
    if (query.trim()) params.set("q", query.trim());
    navigate(`/user/explore?${params}`);
  }

  function changeView(offset) {
    setView((current) => (current + offset + VIEWS.length) % VIEWS.length);
  }

  return (
    <div className="uh-home">
      <form className="uh-search" role="search" onSubmit={search}>
        <label className="uh-sr-only" htmlFor="uh-search-input">Usta yoki xizmat qidirish</label>
        <UserIcon name="search" size={20} />
        <input id="uh-search-input" type="search" placeholder="Usta yoki xizmat izlang" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button type="submit" aria-label="Qidirish"><ArrowIcon /></button>
      </form>

      <section className="uh-barbers" aria-labelledby="uh-barbers-title">
        <header className="uh-section-heading">
          <h1 id="uh-barbers-title">Siz uchun ustalar</h1>
        </header>
        <div className="uh-barber-grid">
          {sampleBarbers.map((barber) => (
            <Link key={barber.id} className="uh-barber-card" to={`/user/barbers/${barber.id}?demo=1`} state={{ from: "/user" }} aria-label={`${barber.name} profilini ochish`}>
              <div className="uh-ad-label"><span>Reklama</span>{barber.available && <span className="uh-availability">Bo‘sh vaqt bor</span>}</div>
              <div className="uh-ad-identity">
                {barber.avatarPhoto && <img className="uh-barber-portrait" src={barber.avatarPhoto} alt={barber.name} width="64" height="64" loading="lazy" />}
                <div><h2>{barber.name}<VerifiedBadge verification={barber.verification} /></h2><p className="uh-barber-area">{barber.salonName} · {barber.area}</p></div>
              </div>
              <p className="uh-ad-offer">{sampleBarberDetails[barber.id].services.map((service) => service.name).join(' · ')}</p>
              <div className="uh-ad-meta"><p className="uh-barber-rating"><UserIcon name="star" size={14} /><strong>{barber.rating.toFixed(1)}</strong><span>({barber.reviewCount} sharh)</span></p><p className="uh-barber-price">{money(barber.startingPrice)} <span>so‘mdan</span></p></div>
              <span className="uh-ad-cta">Profilni ko‘rish <ArrowIcon /></span>
            </Link>
          ))}
        </div>
        <Link className="uh-all-barbers" to="/user/explore?demo=1&type=barbers">Barcha ustalarni ko‘rish <ArrowIcon /></Link>
      </section>

      <details className="uh-style-disclosure">
        <summary><UserIcon name="scissors" size={20} /><span><strong>Soch stillari</strong><small>Uslubni old, yon va orqa tomondan ko‘ring</small></span><span className="uh-disclosure-mark" aria-hidden="true" /></summary>
        <div className="uh-style-content">
          <div className="uh-style-options" role="group" aria-label="Soch stilini tanlang">
            {sampleHairstyles.map((style) => (
              <button type="button" key={style.id} className="uh-style-option" aria-pressed={style.id === styleId} aria-controls="uh-style-preview" onClick={() => { setStyleId(style.id); setView(0); }}>
                <span className="uh-style-thumbnail" style={{ backgroundImage: `url(${sampleHairAtlas})`, backgroundPosition: atlasPosition(style.row, 0) }} />
                <span>{style.name}</span>
              </button>
            ))}
          </div>
          <div className="uh-style-viewer" id="uh-style-preview">
            <div className="uh-view-stage" onPointerDown={(event) => {
              pointerStart.current = { x: event.clientX, y: event.clientY };
              event.currentTarget.setPointerCapture(event.pointerId);
            }} onPointerCancel={() => { pointerStart.current = null; }} onPointerUp={(event) => {
              const start = pointerStart.current;
              pointerStart.current = null;
              if (!start) return;
              const dx = event.clientX - start.x;
              const dy = event.clientY - start.y;
              if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) changeView(dx < 0 ? 1 : -1);
            }}>
              <div className="uh-view-photo" role="img" aria-label={`${selectedStyle.name} — ${VIEWS[view].toLowerCase()} ko‘rinish`} style={{ backgroundImage: `url(${sampleHairAtlas})`, backgroundPosition: atlasPosition(selectedStyle.row, view) }} />
              <button type="button" className="uh-view-arrow uh-view-prev" aria-label="Oldingi ko‘rinish" onClick={() => changeView(-1)}><ArrowIcon direction="left" /></button>
              <button type="button" className="uh-view-arrow uh-view-next" aria-label="Keyingi ko‘rinish" onClick={() => changeView(1)}><ArrowIcon /></button>
              <span className="uh-view-counter" aria-hidden="true">{view + 1} / {VIEWS.length}</span>
            </div>
            <div className="uh-view-info">
              <h2>{selectedStyle.name}</h2>
              <p>{selectedStyle.description}</p>
              <div className="uh-view-tabs" role="group" aria-label="Ko‘rish tomoni">
                {VIEWS.map((label, index) => <button type="button" key={label} aria-pressed={view === index} onClick={() => setView(index)}>{label}</button>)}
              </div>
              <p className="uh-view-label" role="status" aria-live="polite">{selectedStyle.name} · {VIEWS[view]} ko‘rinish</p>
              <Link className="uh-style-link" to={`/user/explore?demo=1&type=barbers&service=${selectedStyle.serviceId}`}>Shu uslubdagi ustalar <ArrowIcon /></Link>
              <p className="uh-sample-note">Tasvirlar uslubni ko‘rsatish uchun yaratilgan.</p>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
