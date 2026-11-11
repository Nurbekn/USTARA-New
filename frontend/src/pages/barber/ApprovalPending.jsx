import Icon from "../../components/Icon";
import ArrowIcon from "../../components/ArrowIcon";
import { Link } from "react-router-dom";
import { AuthLayout } from "../auth/components/AuthParts";
import "../auth/auth-ui.css";

// "done" = finished, "active" = happening now
const STEPS = [
  { label: "Yuborildi", status: "done", mark: "✓" },
  { label: "Tekshiruvda", status: "active", mark: "2" },
  { label: "Faol", status: "", mark: "3" },
];

export default function ApprovalPending() {
  return (
    <AuthLayout>
      <div className="au-pending">
        <div className="au-pending-icon" aria-hidden="true">
          <span />
          <span />
          <Icon name="clock" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </div>

        <h1 className="au-title">Admin tasdiqlashi kutilmoqda</h1>
        <p className="au-sub">
          Profilingiz yuborildi. Admin tekshiruvidan so'ng faollashtiriladi.
        </p>

        <ol className="au-steps">
          {STEPS.map((step) => (
            <li key={step.label} className={step.status}>
              <span>{step.mark}</span>
              {step.label}
            </li>
          ))}
        </ol>

        <p className="au-info">
          Kutish vaqtida panelga kirib, xizmat va narxlaringizni qo'shib qo'yishingiz mumkin.
        </p>

        <Link to="/barber/services" className="au-btn">
          Xizmatlarni qo'shish <ArrowIcon />
        </Link>
        <Link to="/barber" className="au-btn au-btn-ghost">
          Panelni ochish
        </Link>

        <div className="au-contact">
          <h2>Bog'lanish uchun</h2>
          <a href="tel:+998332582331">+998 33 258 2331</a>
          <a href="https://t.me/web_dev2305" target="_blank" rel="noreferrer">
            Telegram: @web_dev2305
          </a>
        </div>
      </div>
    </AuthLayout>
  );
}
