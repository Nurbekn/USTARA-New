import { useLocation, useNavigate } from 'react-router-dom';
import { SITE_LANGUAGES, getSiteUi, readSiteLocale, siteLocaleSwitchUrl } from '../utils/siteLocale.js';

// Presentation-only language selector: never writes to storage or to API calls.
export default function SiteLanguageSelect({ className = '' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const lang = readSiteLocale(location.search);
  return <label className={`ustara-site-language ${className}`}>
    <span className="sr-only">{getSiteUi(lang).language}</span>
    <select aria-label={getSiteUi(lang).language} value={lang} onChange={event => navigate(siteLocaleSwitchUrl(location, event.target.value), { replace: true })}>
      {SITE_LANGUAGES.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
    </select>
  </label>;
}
