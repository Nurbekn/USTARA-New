import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getAvailability } from "../data/availability";

export default function AvailabilityBadge({ profile }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer;
    const refresh = () => {
      setNow(new Date());
      clearTimeout(timer);
      timer = setTimeout(refresh, 60000 - Date.now() % 60000);
    };
    timer = setTimeout(refresh, 60000 - Date.now() % 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  const { isOpen, detail } = getAvailability(profile, now);
  return (
    <Link to="/barber/schedule" className={`bx-status ${isOpen ? "is-open" : "is-closed"}`} title={`${detail} · Toshkent vaqti. Jadvalni ochish`} aria-label={`${isOpen ? "Ochiq" : "Yopiq"}. ${detail}. Ish jadvalini ochish`}>
      <i className="bx-status-dot" aria-hidden="true" />
      <span aria-live="polite">{isOpen ? "Ochiq" : "Yopiq"}</span>
    </Link>
  );
}
