import BrandLogo from "./brand/BrandLogo";
import { getSiteUi, readSiteLocale, siteLocalePath } from "../utils/siteLocale.js";

import { Link, useLocation } from "react-router-dom";
import "./Footer.css";

function Footer() {
  const lang = readSiteLocale(useLocation().search);
  const ui = getSiteUi(lang);
  return (
    <footer className="footer" id="contact">
      <div className="footer-main container">
        <div className="footer-brand">
          <Link to={siteLocalePath("/", lang)} className="footer-logo">
            <BrandLogo />
          </Link>

          <p>{ui.footer.description}</p>
        </div>

        <div className="footer-column">
          <h3>{ui.footer.platform}</h3>
          <Link to={siteLocalePath("/barbers", lang)}>{ui.footer.barbers}</Link>
          <Link to={siteLocalePath("/logos", lang)}>{ui.footer.brands}</Link>
          <Link to={siteLocalePath("/#how-it-works", lang)}>{ui.public.how}</Link>
          <Link to={siteLocalePath("/#about", lang)}>{ui.public.about}</Link>
        </div>

        <div className="footer-column">
          <h3>{ui.footer.account}</h3>
          <Link to={siteLocalePath("/login", lang)}>{ui.public.signIn}</Link>
          <Link to={siteLocalePath("/signup", lang)}>{ui.footer.signup}</Link>
        </div>

        <div className="footer-column">
          <h3>{ui.public.contact}</h3>
          <a
            href="https://t.me/web_dev2305"
            target="_blank"
            rel="noreferrer"
          >
            Telegram
          </a>
          <a href="mailto:mirzayevnurbek23@gmail.com">
            {ui.footer.email}
          </a>
          <a href="tel:+998332582331">
            +998 33 258 23 31
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <p>© 2026 Ustara. {ui.footer.rights}</p>
          <span>{ui.footer.motto}</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
