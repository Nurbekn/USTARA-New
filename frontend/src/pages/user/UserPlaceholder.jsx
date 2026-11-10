export default function UserPlaceholder({ title, description }) {
  return (
    <section className="uc-page">
      <p className="uc-eyebrow">USTARA / CUSTOMER</p>
      <h1 className="uc-page-title">{title}</h1>
      <div className="uc-card">
        <span className="uc-status">Tez orada</span>
        <h2 className="uc-card-title">Bu bo‘lim tayyorlanmoqda</h2>
        <p className="uc-description">{description}</p>
      </div>
    </section>
  );
}
