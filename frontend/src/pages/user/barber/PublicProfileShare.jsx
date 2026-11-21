import { useEffect, useRef, useState } from "react";
import { publicBarberShareData, sharePublicBarberProfile } from "./publicShare.js";

/** Only uses the safe public canonical link; no JWT, search params or booking context. */
export default function PublicProfileShare({ barber, compact = false }) {
  const [feedback, setFeedback] = useState({ status: "idle", url: null });
  const [busy, setBusy] = useState(false);
  const generation = useRef(0);
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const previewOrigin = import.meta.env.VITE_PUBLIC_PROFILE_PREVIEW_ORIGIN || "";
  const publicBasePath = import.meta.env.BASE_URL || "/";
  const preview = publicBarberShareData(barber, origin, previewOrigin, publicBasePath);
  const id = barber?.id;
  useEffect(() => {
    generation.current += 1;
    setFeedback({ status: "idle", url: null });
    setBusy(false);
    return () => { generation.current += 1; };
  }, [id, origin, previewOrigin, publicBasePath]);
  async function onShare() {
    if (!preview || busy) return;
    const request = ++generation.current;
    setBusy(true);
    const response = await sharePublicBarberProfile(barber, origin, typeof navigator !== "undefined" ? navigator : {}, previewOrigin, publicBasePath);
    if (request !== generation.current) return;
    setBusy(false);
    setFeedback(response);
  }
  if (!preview) return null;
  const notice = feedback.status === "copied" ? "Ommaviy profil havolasi nusxalandi."
    : feedback.status === "shared" ? "Ulashish oynasi yopildi."
    : feedback.status === "manual" ? "Havolani belgilab, qo‘lda nusxalang."
    : feedback.status === "unavailable" ? "Havola hozir mavjud emas." : "";
  return <div className={`bpv-share${compact ? " is-compact" : ""}`}>
    <button className="bpv-share-trigger" type="button" onClick={onShare} disabled={busy} aria-label="Ommaviy profil havolasini ulashish">{busy ? "Ulashilmoqda…" : "Profilni ulashish"}</button>
    <span className="bpv-share-notice" role="status" aria-live="polite">{notice}</span>
    {feedback.status === "manual" && feedback.url === preview.url && <div className="bpv-share-manual"><label htmlFor={`bpv-share-url-${id}`}>Ommaviy profil havolasi</label><input id={`bpv-share-url-${id}`} readOnly value={preview.url} onFocus={(event) => event.target.select()} onClick={(event) => event.target.select()} aria-label="Nusxalash uchun profil havolasi" /></div>}
  </div>;
}
