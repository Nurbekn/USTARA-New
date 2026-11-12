import brandMark from "./brand/ustara.svg";

export default function Loading({ screen = false, label = "Yuklanmoqda…" }) {
  return (
    <div className={`app-loading${screen ? " app-loading--screen" : ""}`} role="status" aria-live="polite">
      <span className="app-loading__mark" aria-hidden="true">
        <img src={brandMark} width="48" height="48" alt="" />
      </span>
      <p>{label}</p>
      <small>Iltimos, biroz kuting</small>
    </div>
  );
}
