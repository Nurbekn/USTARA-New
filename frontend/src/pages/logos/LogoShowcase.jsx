import { Link } from "react-router-dom";
import BrandLogo, { BrandSymbol, BrandWordmark } from "../../components/brand/BrandLogo";
import logoConcepts from "../../components/brand/concepts.json";
import "./LogoShowcase.css";

const asset = (name) => `${import.meta.env.BASE_URL}brand/${name}.svg`;

export default function LogoShowcase() {
  return (
    <main className="lg-page">
      <header className="lg-header">
        <Link to="/" className="lg-back">← Bosh sahifa</Link>
        <span>USTARA / BREND KONSEPSIYALARI</span>
        <h1>Bir platforma.<br />Olti xil xarakter.</h1>
        <p>Salon, massaj, makyaj, sartarosh va boshqa xizmatlarni birlashtiradigan bron ekotizimi. Har bir ramzni katta va kichik o‘lchamda solishtiring.</p>
        <div className="lg-palette" aria-label="Brend ranglari"><span><i />#60A5FA</span><span><i />#0B1120</span><span><i />#FFFFFF</span></div>
      </header>
      <section className="lg-grid" aria-label="Oltita logo konsepsiyasi">
        {logoConcepts.map((concept, index) => (
          <article className="lg-card" key={concept.id}>
            <div className="lg-card-heading"><span>0{index + 1} / {concept.direction}</span>{index === 0 && <span className="lg-current">Saytda qo‘llangan</span>}{index === 5 && <span className="lg-current">Yangi taklif</span>}</div>
            <div className="lg-preview lg-preview--dark" aria-label="Qora fondagi ko‘rinish">
              <BrandSymbol variant={concept.id} size={96} />
              <BrandLogo variant={concept.id} />
              <span className="lg-theme-label">QORA FON</span>
            </div>
            <div className="lg-preview lg-preview--light" aria-label="Oq fondagi ko‘rinish">
              <BrandSymbol variant={concept.id} size={96} />
              <BrandLogo variant={concept.id} />
              <span className="lg-theme-label">OQ FON</span>
            </div>
            <div className="lg-card-body">
              <h2>{concept.name}</h2><p>{concept.description}</p>
              <div className="lg-sizes" aria-label="Favicon o‘lchamlari">{[16, 24, 32].map((size) => <span key={size}><BrandSymbol variant={concept.id} size={size} compact={size <= 24} /><small>{size}px</small></span>)}<span className="lg-app-icon"><BrandSymbol variant={concept.id} size={36} compact /></span></div>
              <div className="lg-downloads"><a href={asset(concept.id)} download>Ikonka SVG ↓</a>{concept.faviconPaths && <a href={asset(`${concept.id}-favicon`)} download>Favicon SVG ↓</a>}<a href={asset(`${concept.id}-dark`)} download>Qora fon uchun ↓</a><a href={asset(`${concept.id}-light`)} download>Oq fon uchun ↓</a></div>
            </div>
          </article>
        ))}
      </section>
      <section className="lg-wordmark"><div><span>ALOHIDA YOZUV</span><h2>Ramzsiz ham tanish.</h2><p>Barcha variantlar uchun yagona “Ustara” yozuvi.</p></div><div><BrandWordmark /><a href={asset('wordmark-dark')} download>Yozuvni yuklab olish ↓</a></div></section>
      <p className="lg-note">SVG fayllar shaffof fonda. Qora va oq fon uchun yozuv ranglari alohida tayyorlangan.</p>
    </main>
  );
}
