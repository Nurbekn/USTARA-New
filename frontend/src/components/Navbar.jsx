import BrandLogo from "./brand/BrandLogo";
import SiteLanguageSelect from "./SiteLanguageSelect";
import { getSiteUi, readSiteLocale, siteLocalePath } from "../utils/siteLocale.js";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const lang = readSiteLocale(location.search);
  const ui = getSiteUi(lang).public;

  function goToSection(sectionId) {
    setMenuOpen(false);

    if (location.pathname !== "/") {
      navigate(siteLocalePath("/", lang));
      setTimeout(() => {
        document.getElementById(sectionId)?.scrollIntoView({
          behavior: "smooth",
        });
      }, 100);
      return;
    }

    document.getElementById(sectionId)?.scrollIntoView({
      behavior: "smooth",
    });
  }

  function closeMenu() {
    setMenuOpen(false);
  }

  return (
    <header className="navbar">
      <div className="navbar-inner container">
        <Link to={siteLocalePath("/", lang)} className="navbar-logo" onClick={closeMenu}>
          <BrandLogo />
        </Link>

        {/* Phones: sign-up stays visible, right in front of the burger */}
        <div className="navbar-right">
          <SiteLanguageSelect />
          <Link
            to={siteLocalePath("/signup", lang)}
            className="navbar-signup navbar-signup--top"
            aria-label={ui.signup}
            onClick={closeMenu}
          >
            {ui.start}
          </Link>

          <button
            className="navbar-menu-toggle"
            type="button"
            aria-label={menuOpen ? ui.menuClose : ui.menuOpen}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <div className={`navbar-menu ${menuOpen ? "is-open" : ""}`}>
          <nav className="navbar-links" aria-label={ui.mainNav}>
            <button type="button" onClick={() => goToSection("how-it-works")}>
              {ui.how}
            </button>

            <button type="button" onClick={() => goToSection("about")}>
              {ui.about}
            </button>

            <button type="button" onClick={() => goToSection("contact")}>
              {ui.contact}
            </button>

            <Link to={siteLocalePath("/help", lang)} onClick={closeMenu}>{ui.help}</Link>
          </nav>

          <div className="navbar-actions">
            <Link to={siteLocalePath("/login", lang)} className="navbar-login" onClick={closeMenu}>
              {ui.signIn}
            </Link>

            <Link to={siteLocalePath("/signup", lang)} className="navbar-signup navbar-signup--menu" onClick={closeMenu}>
              {ui.start} 
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
