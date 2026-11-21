import { useState } from 'react';
import { Link } from 'react-router-dom';
import { siteLocalePath } from '../../utils/siteLocale.js';
import { guideAccountKeyV166, guideTextV166 } from './guideModelV166.js';
import './ContextGuideV166.css';

function readHidden(key) {
  try { return key && sessionStorage.getItem(key) === 'hidden'; } catch { return false; }
}
// The user can expand guidance; no forced tour, API call, tracking or booking mutation.
export default function ContextGuideV166({ role, pathname, lang, accountId }) {
  const key = guideAccountKeyV166(role, accountId);
  const guide = guideTextV166(role, pathname, lang);
  const [hiddenKeys, setHiddenKeys] = useState([]);
  const [expanded, setExpanded] = useState(false);
  if (!key || !guide || hiddenKeys.includes(key) || readHidden(key)) return null;
  function dismiss() {
    try { sessionStorage.setItem(key, 'hidden'); } catch { /* Current view still dismisses. */ }
    setHiddenKeys(current => current.includes(key) ? current : [...current, key]);
  }
  return <aside className="cg166" aria-label={guide.label}>
    <div className="cg166-heading"><strong>{guide.label}</strong>
      <div className="cg166-buttons">
        <button type="button" aria-expanded={expanded} aria-controls="cg166-content" onClick={() => setExpanded(value => !value)}>{expanded ? guide.hide : guide.open}</button>
        <button type="button" onClick={dismiss} aria-label={guide.dismiss} title={guide.dismiss}>×</button>
      </div>
    </div>
    {expanded && <div id="cg166-content"><h2>{guide.title}</h2><p>{guide.description}</p>
      {(guide.section === 'bookings' || guide.section === 'explore') && role === 'customer' && <p className="cg166-safety">{guide.important}</p>}
      <div className="cg166-links"><Link to={siteLocalePath(guide.path, lang)}>{guide.action}</Link><Link to={siteLocalePath(guide.topicPath, lang)}>{guide.help}</Link></div>
    </div>}
  </aside>;
}
