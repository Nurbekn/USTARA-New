import { useLocation } from "react-router-dom";
import { readSiteLocale, siteLocalePath } from "../../../utils/siteLocale.js";
import { barberInsightsText } from "../barberInsightsLocaleV147.js";
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAvailability } from '../data/availability';
export default function AvailabilityBadge({ profile }) {
  const lang=readSiteLocale(useLocation().search);
  const tr=barberInsightsText(lang);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer;
    const refresh = () => { setNow(new Date());clearTimeout(timer);timer = setTimeout(refresh, 60000 - Date.now() % 60000); };
    timer = setTimeout(refresh, 60000 - Date.now() % 60000);
    window.addEventListener('focus', refresh);document.addEventListener('visibilitychange', refresh);
    return () => { clearTimeout(timer);window.removeEventListener('focus', refresh);document.removeEventListener('visibilitychange', refresh); };
  }, []);
  const verified = profile.verification_status === 'approved';
  const { isOpen, detail } = getAvailability(profile, now);
  const open = verified && isOpen;
  const label = !verified ? 'Tasdiqlanmagan' : profile.acceptingBookings == null ? 'Jadval yuklanmoqda' : open ? 'Ochiq' : 'Yopiq';
  return <Link to={siteLocalePath("/barber/schedule",lang)} className={`bx-status ${open ? 'is-open' : 'is-closed'}`} title={`${detail} · ${tr('Toshkent vaqti. Jadvalni ochish')}`} aria-label={`${tr(label)}. ${detail}. ${tr('Ish jadvalini ochish')}`}>
    <i className="bx-status-dot" aria-hidden="true"/><span aria-live="polite">{tr(label)}</span>
  </Link>;
}
