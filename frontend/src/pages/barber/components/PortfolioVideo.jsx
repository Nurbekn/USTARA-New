import { useEffect, useState } from "react";
import { loadVideo, mediaError } from "../data/portfolioMedia";

// Each mounted player owns its object URL and releases it on close/unmount.
export default function PortfolioVideo({ post, thumbnail = false }) {
  const [media, setMedia] = useState(null);
  const [playbackError, setPlaybackError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled = false;
    let url;
    if (post.videoId) {
      loadVideo(post.videoId).then((blob) => {
        if (cancelled) return;
        if (!blob) throw new Error("missing");
        url = URL.createObjectURL(blob);
        setMedia({ id: post.videoId, url });
      }).catch((error) => {
        if (!cancelled) setMedia({ id: post.videoId, error: error.message === "missing" ? "Video fayli topilmadi." : mediaError(error) });
      });
    }
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [post.videoId, retry]);

  // Retain compatibility with video posts saved by the previous version.
  const source = post.videoId ? (media?.id === post.videoId ? media.url : null) : post.image;
  const error = playbackError ? "Videoni ijro etib bo'lmadi. Fayl shikastlangan yoki video kodeki brauzerda qo'llanmaydi." : media?.id === post.videoId && media?.error;
  if (error) return <div className="bx-portfolio-media-message" role="alert">{error}{!thumbnail && <button type="button" className="bx-btn bx-btn-ghost" onClick={() => { setPlaybackError(false); setMedia(null); setRetry((n) => n + 1); }}>Qayta urinish</button>}</div>;
  if (!source) return <div className="bx-portfolio-media-message" role="status">Video yuklanmoqda...</div>;
  return <video key={retry} onError={() => setPlaybackError(true)} className={thumbnail ? undefined : "bx-post-full"} src={source} controls={!thumbnail} muted={thumbnail} playsInline preload="metadata" aria-label={thumbnail ? undefined : post.caption || "Ish videosi"} aria-hidden={thumbnail || undefined} />;
}
