
import { Link } from "react-router-dom";
import "./Footer.css";

function Footer() {
  return (
    <footer className="footer" id="contact">
      <div className="footer-main container">
        <div className="footer-brand">
          <Link to="/" className="footer-logo">
            <span className="footer-logo-icon">U</span>
            <span>USTARA<span className="footer-logo-dot">.</span></span>
          </Link>

          <p>
            O'zingizga mos sartaroshni toping.
            Navbatingizni oldindan band qiling.
            Vaqtingizni tejab, uslubingizni yangilang.
          </p>
        </div>

        <div className="footer-column">
          <h3>Platforma</h3>
          <Link to="/barbers">Sartaroshlar</Link>
          <a href="/#how-it-works">Qanday ishlaydi?</a>
          <a href="/#about">Biz haqimizda</a>
        </div>

        <div className="footer-column">
          <h3>Hisob</h3>
          <Link to="/login">Kirish</Link>
          <Link to="/signup">Ro'yxatdan o'tish</Link>
        </div>

        <div className="footer-column">
          <h3>Bog'lanish</h3>
          <a
            href="https://t.me/web_dev2305"
            target="_blank"
            rel="noreferrer"
          >
            Telegram
          </a>
          <a href="mailto:mirzayevnurbek23@gmail.com">
            Email yuborish
          </a>
          <a href="tel:+998332582331">
            +998 33 258 23 31
          </a>
        </div>
      </div>

      <div className="footer-bottom">
        <div className="container footer-bottom-inner">
          <p>© 2026 Ustara. Barcha huquqlar himoyalangan.</p>
          <span>Sartarosh tanlashning qulay usuli.</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
