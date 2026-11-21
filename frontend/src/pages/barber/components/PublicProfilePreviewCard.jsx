import { readSiteLocale, siteLocalePath } from "../../../utils/siteLocale.js";
import { barberOpsText } from "../barberOpsLocaleV146.js";
import { Link, useLocation } from "react-router-dom";
import { getSession } from "../../auth/utils/session";
import { publicProfilePreview } from "../data/publicPreview.js";
import PublicProfileShare from "../../user/barber/PublicProfileShare.jsx";

export default function PublicProfilePreviewCard({ profile, status, posts = [], errors = {}, dirty = false, compact = false }) {
  const lang = readSiteLocale(useLocation().search);
  const tr = barberOpsText(lang);
  const view = publicProfilePreview(profile, { session: getSession(), status, posts, errors, dirty });
  return <section className={`bx-card bx-public-preview${compact ? " is-compact" : ""}`} aria-labelledby={compact ? "bx-public-preview-compact" : "bx-public-preview-title"}>
    <h2 id={compact ? "bx-public-preview-compact" : "bx-public-preview-title"}>{tr("Profilni mijoz ko‘rinishida tekshirish")}</h2>
    <p className="bx-muted">{tr("Ommaviy mehmon ko‘rinishi. Post va sharhlar uchun mijozdan tizimga kirish so‘ralishi mumkin.")}</p>
    <p role="status">{tr(view.message)}</p>
    {view.unsavedWarning && <p className="bx-preview-warning" role="status">{tr(view.unsavedWarning)}</p>}
    {view.canOpen && <Link className="bx-btn bx-btn-primary bx-public-preview-link" to={siteLocalePath(view.url, lang)} target="_blank" rel="noopener noreferrer">{tr("Ommaviy profilni yangi oynada ko‘rish")}</Link>}
    {view.canOpen && <PublicProfileShare barber={{ id: profile.id, firstName: profile.firstName, lastName: profile.lastName, salonName: profile.salonName, specialty: profile.specialty }} compact={compact}/>}
    {!compact && view.checks.length > 0 && <>
      <p className="bx-preview-count">{tr("Ma’lumotlar:")} {view.readyCount}/{view.checks.length}{tr(" tayyor")}{view.unknownCount > 0 ? `, ${view.unknownCount}${tr(" ta tekshirib bo‘lmadi")}` : ""}.</p>
      <ul className="bx-preview-checks">{view.checks.map(item => <li key={item.key}>
        <span aria-label={item.ok === true ? tr("Kiritilgan") : item.ok == null ? tr("Tekshirib bo‘lmadi") : tr("To‘ldirish kerak")}>{item.ok === true ? "✓" : item.ok == null ? "?" : "○"}</span>
        <span>{tr(item.label)}</span>
        {item.ok !== true && <Link to={siteLocalePath(item.to, lang)}>{item.ok == null ? tr("Tekshirish") : tr("To‘ldirish")}</Link>}
      </li>)}</ul>
    </>}
  </section>;
}
