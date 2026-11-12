import BrandLogo from "./brand/BrandLogo";
import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import "./Navbar.css";

function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();

  function goToSection(sectionId) {
    setMenuOpen(false);

    if (location.pathname !== "/") {
      navigate("/");
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
        <Link to="/" className="navbar-logo" onClick={closeMenu}>
          <BrandLogo />
        </Link>

        {/* Phones: sign-up stays visible, right in front of the burger */}
        <div className="navbar-right">
          <Link
            to="/signup"
            className="navbar-signup navbar-signup--top"
            aria-label="Ro'yxatdan o'tish"
            onClick={closeMenu}
          >
            Boshlash
          </Link>

          <button
            className="navbar-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Menyuni yopish" : "Menyuni ochish"}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span />
            <span />
            <span />
          </button>
        </div>

        <div className={`navbar-menu ${menuOpen ? "is-open" : ""}`}>
          <nav className="navbar-links" aria-label="Asosiy navigatsiya">
            <button type="button" onClick={() => goToSection("how-it-works")}>
              Qanday ishlaydi?
            </button>

            <button type="button" onClick={() => goToSection("about")}>
              Biz haqimizda
            </button>

            <button type="button" onClick={() => goToSection("contact")}>
              Bog'lanish
            </button>
          </nav>

          <div className="navbar-actions">
            <Link to="/login" className="navbar-login" onClick={closeMenu}>
              Kirish
            </Link>

            <Link to="/signup" className="navbar-signup navbar-signup--menu" onClick={closeMenu}>
              Boshlash 
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}

export default Navbar;
