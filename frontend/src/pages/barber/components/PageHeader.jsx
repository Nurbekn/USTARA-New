import { useNavigate } from "react-router-dom";

// Title block at the top of every barber page.
// `back` shows a "← Orqaga" button (used on pages not in the bottom nav).
export default function PageHeader({ title, subtitle, back = false, action }) {
  const navigate = useNavigate();

  return (
    <header className="bx-page-head">
      <div className="bx-page-head-main">
        {back && (
          <button
            type="button"
            className="bx-back"
            onClick={() => navigate("/barber/profile")}
            aria-label="Orqaga"
          >
            ←
          </button>
        )}
        <div>
          <h1>{title}</h1>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      {action}
    </header>
  );
}
