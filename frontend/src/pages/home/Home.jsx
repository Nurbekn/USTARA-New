import { Link } from "react-router-dom";
import "./Home.css";

// ---------- Small inline icons (currentColor, no extra files) ----------
const ICONS = {
  pin: (
    <>
      <path d="M12 21s7-6.2 7-11.5A7 7 0 0 0 5 9.5C5 14.8 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </>
  ),
  image: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="9" cy="10" r="2" />
      <path d="m21 16-5-5-9 9" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9a6 6 0 1 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  cash: (
    <>
      <rect x="3" y="6" width="18" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
    </>
  ),
  check: <path d="m5 12 5 5 9-10" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6" cy="6" r="3" />
      <circle cx="6" cy="18" r="3" />
      <path d="M8.5 8 20 18M8.5 16 20 6" />
    </>
  ),
  chart: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
};

function Icon({ name, size = 22 }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {ICONS[name]}
    </svg>
  );
}

// ---------- Content ----------
const PERKS = [
  {
    icon: "pin",
    title: "Yaqin atrofda",
    text: "GPS orqali sizga eng yaqin ustalar",
  },
  {
    icon: "image",
    title: "Ish namunalari",
    text: "Sartarosh olgan soch rasmlarini ko'ring",
  },
  {
    icon: "bell",
    title: "Telegram eslatma",
    text: "Navbatingizdan oldin eslatamiz",
  },
  {
    icon: "cash",
    title: "Naqd to'lov",
    text: "Xizmatdan keyin joyida to'laysiz",
  },
];

const STEPS = [
  {
    icon: "scissors",
    title: "Sartaroshni tanlang",
    text: "Yaqin ustalar ro'yxatidan ishlari va sharhlariga qarab tanlang.",
  },
  {
    icon: "clock",
    title: "Vaqtni belgilang",
    text: "Xizmatni tanlang, bo'sh vaqtlar avtomatik ko'rinadi.",
  },
  {
    icon: "check",
    title: "Tasdiqlang",
    text: "Sartarosh bronni tasdiqlaydi, eslatma ham keladi.",
  },
];

const BARBER_POINTS = [
  {
    icon: "image",
    text: "Olgan soch rasmlaringizni joylang, mijozlar o'zi topadi",
  },
  {
    icon: "bell",
    text: "Bronlarni qabul qiling yoki rad eting",
  },
  { icon: "chart", text: "Kunlik, haftalik va yillik daromadni kuzating" },
];

function Home() {
  return (
    <div className="hm">
      {/* ================= HERO ================= */}
      <section className="hm-hero container">
        <div className="hm-hero-text">
          <span className="hm-pill">
            <i aria-hidden="true" />
            Sartarosh tanlashning yangi usuli
          </span>

          <h1>
            Yangi uslub.
            <br />
            <span>O'z vaqtingizda.</span>
          </h1>

          <p className="hm-lead">
            Yaqin atrofdagi sartaroshni toping, bo'sh vaqtni tanlang va navbatni
            oldindan band qiling. Kutib o'tirish shart emas.
          </p>

          <div className="hm-actions">
            <Link to="/signup" className="hm-btn hm-btn-primary">
              Sartarosh topish
              <span aria-hidden="true">→</span>
            </Link>
            <a href="#how-it-works" className="hm-btn hm-btn-ghost">
              Qanday ishlaydi?
            </a>
          </div>
        </div>

        <div className="hm-hero-visual">
          <div className="hm-photo">
            <img
              src="/images/fade.png"
              srcSet="/images/fade-640.webp 640w, /images/fade-1200.webp 1200w"
              sizes="(min-width: 900px) 520px, 100vw"
              width="1200"
              height="800"
              alt="Zamonaviy fade soch turmagi"
              fetchPriority="high"
              decoding="async"
            />
            <div className="hm-photo-shade" />
            <p className="hm-photo-caption">
              <small>SIZNING USLUBINGIZ</small>
              O'zingizga yarashgan ko'rinish
            </p>
          </div>
        </div>
      </section>

      {/* ================= PERKS ================= */}
      <section className="hm-perks container" aria-label="Afzalliklar">
        {PERKS.map((perk) => (
          <article key={perk.title} className="hm-perk">
            <span className="hm-icon">
              <Icon name={perk.icon} />
            </span>
            <h3>{perk.title}</h3>
            <p>{perk.text}</p>
          </article>
        ))}
      </section>

      {/* ================= HOW IT WORKS ================= */}
      <section className="hm-section container" id="how-it-works">
        <header className="hm-heading">
          <span className="hm-eyebrow">ODDIY VA QULAY</span>
          <h2>
            Yaxshi ko'rinishga <span>uchta qadam</span>
          </h2>
        </header>

        <ol className="hm-steps">
          {STEPS.map((step, i) => (
            <li key={step.title} className="hm-step">
              <span className="hm-step-num">{i + 1}</span>
              <div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </div>
              <span className="hm-icon hm-step-icon">
                <Icon name={step.icon} />
              </span>
            </li>
          ))}
        </ol>
      </section>

      {/* ================= FOR BARBERS ================= */}
      <section className="hm-section container">
        <div className="hm-barber">
          <span className="hm-eyebrow">SARTAROSHLAR UCHUN</span>
          <h2>
            Siz sartaroshmisiz? <span>Mijozlar o'zi keladi.</span>
          </h2>
          <p>
            Ishlaringizni ko'rsating, jadvalingizni boshqaring va daromadingizni
            bir joyda kuzating.
          </p>

          <ul>
            {BARBER_POINTS.map((point) => (
              <li key={point.text}>
                <span className="hm-icon">
                  <Icon name={point.icon} size={20} />
                </span>
                {point.text}
              </li>
            ))}
          </ul>

          <Link to="/signup/usta" className="hm-btn hm-btn-primary">
            Sartarosh sifatida boshlash
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      {/* ================= ABOUT ================= */}
      <section className="hm-section hm-about container" id="about">
        <span className="hm-eyebrow">USTARA HAQIDA</span>
        <h2>
          Vaqtingiz qadrli. <span>Uni navbatda o'tkazmang.</span>
        </h2>
        <p>
          Ustara mijozlarga o'ziga mos sartaroshni topish va qulay vaqtga
          yozilish imkonini beradi. Sartaroshlar esa ish jadvalini tartibli
          boshqaradi.
        </p>
        <Link to="/signup" className="hm-btn hm-btn-ghost">
          Sartaroshlarni ko'rish
          <span aria-hidden="true">→</span>
        </Link>
      </section>
    </div>
  );
}

export default Home;
