import { useState } from "react";

export default function PortfolioImage({ src, alt, thumbnail = false }) {
  const [state, setState] = useState(src ? "loading" : "error");
  return (
    <div className={`bx-portfolio-image ${thumbnail ? "is-thumbnail" : ""}`}>
      {state !== "error" && <img className={thumbnail ? undefined : "bx-post-full"} src={src} alt={alt} loading={thumbnail ? "lazy" : "eager"} onLoad={() => setState("ready")} onError={() => setState("error")} />}
      {state === "loading" && <div className="bx-portfolio-media-message" role="status">Rasm yuklanmoqda...</div>}
      {state === "error" && <div className="bx-portfolio-media-message" role="alert">Rasmni ochib bo'lmadi.</div>}
    </div>
  );
}
