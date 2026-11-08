import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import PortfolioImage from "./components/PortfolioImage";
import { Avatar } from "./data/avatars";
import PortfolioVideo from "./components/PortfolioVideo";
import { mediaError } from "./data/portfolioMedia";
import { publishPortfolioPost, deletePortfolioPost } from "./data/portfolioPosts";
import Sheet from "./components/Sheet";
import MediaPicker from "./components/MediaPicker";
import EmojiPicker from "./components/EmojiPicker";
import PostReactions from "./components/PostReactions";
import { useToast } from "./components/Toast";
import { useBarber } from "./data/store";
import { longDate } from "./data/format";
import { prepareImage, isImageFile, isVideoFile } from "./data/imageUpload";

const MAX_FILE = 25 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

export default function Portfolio() {
  const { profile, posts } = useBarber();
  const { toast, show } = useToast();
  const fullName = [profile.firstName, profile.lastName]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ");
  const username = typeof profile.username === "string"
    ? profile.username.trim().replace(/^@+/, "")
    : "";
  const [activeTab, setActiveTab] = useState("all");
  const visiblePosts = activeTab === "video" ? posts.filter((post) => post.mediaType === "video") : posts;

  const [adding, setAdding] = useState(false);
  const [uploadKind, setUploadKind] = useState("image");
  const captionInput = useRef(null);
  const [image, setImage] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const operationRef = useRef(false);
  const selectionRef = useRef(0);
  const previewRef = useRef(null);
  useEffect(() => () => {
    selectionRef.current += 1;
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);
  const clearPreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  };
  const [mediaType, setMediaType] = useState("image");
  const [saveError, setSaveError] = useState("");
  const [caption, setCaption] = useState("");
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);

  const [viewing, setViewing] = useState(null); // post being viewed
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openAdd = () => {
    if (operationRef.current) return;
    clearPreview();
    setVideoFile(null);
    selectionRef.current += 1;
    setBusy(false);
    setImage("");
    setMediaType("image");
    setUploadKind("image");
    setSaveError("");
    setCaption("");
    setService("");
    setAdding(true);
  };

  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || operationRef.current) return;
    const isVideo = isVideoFile(file);
    if (!isVideo && !isImageFile(file)) {
      return setSaveError("Rasm yoki video faylini tanlang.");
    }
    if (file.size > (isVideo ? MAX_VIDEO : MAX_FILE)) {
      return setSaveError(isVideo ? "Video 50 MB dan oshmasin" : "Rasm 25 MB dan oshmasin");
    }

    const selection = ++selectionRef.current;
    setBusy(true);
    setSaveError("");
    try {
      const data = isVideo ? "" : await prepareImage(file);
      if (selection !== selectionRef.current) return;
      clearPreview();
      const preview = isVideo ? URL.createObjectURL(file) : data;
      if (isVideo) previewRef.current = preview;
      setVideoFile(isVideo ? file : null);
      setImage(preview);
      setMediaType(isVideo ? "video" : "image");
      setUploadKind(isVideo ? "video" : "image");
    } catch (error) {
      if (selection === selectionRef.current) setSaveError(error.message || "Faylni o'qib bo'lmadi");
    } finally {
      if (selection === selectionRef.current) setBusy(false);
    }
  };

  const publish = async () => {
    if (busy || operationRef.current) return;
    if (!image) return show("Avval rasm yoki video tanlang");
    operationRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await publishPortfolioPost({ image, videoFile, caption: caption.trim(), service });
      setAdding(false);
      setImage("");
      clearPreview();
      setVideoFile(null);
      show("Post joylandi");
    } catch (error) {
      setSaveError(error.message?.startsWith("Post ") ? error.message : mediaError(error));
    } finally {
      operationRef.current = false;
      setSaving(false);
    }
  };

  const remove = async () => {
    if (operationRef.current) return;
    operationRef.current = true;
    setDeleting(true);
    setDeleteError("");
    try {
      await deletePortfolioPost(viewing);
      setViewing(null);
      setConfirmDelete(false);
      show("Post o'chirildi");
    } catch (error) {
      setDeleteError(error.message?.startsWith("Post ") ? error.message : mediaError(error));
    } finally {
      operationRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <div className="bx-page bx-portfolio">
      <header className="bx-portfolio-profile">
        <div className="bx-portfolio-heading">
          <h1>{username || "Portfolio"}</h1>
          <div className="bx-portfolio-tools">
            <button type="button" className="bx-portfolio-tool" onClick={openAdd} aria-label="Yangi post qo'shish">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 7v10M7 12h10" /></svg>
            </button>
            <Link to="/barber/profile" className="bx-portfolio-tool" aria-label="Profil sozlamalari">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
            </Link>
          </div>
        </div>

        <div className="bx-portfolio-overview">
          <Link to="/barber/profile" className="bx-portfolio-avatar" aria-label="Profil rasmini o'zgartirish">
            {(profile.avatarPhoto || profile.avatar) ? (
              <Avatar photo={profile.avatarPhoto} id={profile.avatar} name={fullName} size={88} />
            ) : (
              <span className="bx-portfolio-avatar-empty" role="img" aria-label="Avatar tanlanmagan">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 21v-2a8 8 0 0 1 16 0v2" />
                </svg>
              </span>
            )}
          </Link>
          <dl className="bx-portfolio-stats">
            <div><dt>Posts</dt><dd>{posts.length}</dd></div>
            <div><dt>Followers</dt><dd>0</dd></div>
            <div><dt>Following</dt><dd>0</dd></div>
          </dl>
        </div>

        <div className="bx-portfolio-details">
          {fullName && <h2>{fullName}</h2>}
          {profile.about && <p className="bx-portfolio-bio">{profile.about}</p>}
          {typeof profile.experience === "number" && Number.isFinite(profile.experience) && profile.experience >= 0 && (
            <p className="bx-portfolio-experience">{profile.experience} yil tajriba</p>
          )}
          {profile.address && (
            <p className="bx-portfolio-address">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
                <path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z" />
                <circle cx="12" cy="10" r="2.5" />
              </svg>
              {profile.address}
            </p>
          )}
        </div>
        <div className="bx-portfolio-actions">
          <Link to="/barber/profile" className="bx-portfolio-edit">Profilni tahrirlash</Link>
          <button type="button" className="bx-portfolio-publish" onClick={openAdd}>Post qo'shish</button>
        </div>
      </header>

      <div className="bx-portfolio-tabs" role="tablist" aria-label="Portfolio postlari">
        <button type="button" id="portfolio-all-tab" role="tab" aria-selected={activeTab === "all"} aria-controls="portfolio-post-panel" onClick={() => setActiveTab("all")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="1" /><path d="M9 3v18M15 3v18M3 9h18M3 15h18" /></svg>
          <span>Postlar</span>
        </button>
        <button type="button" id="portfolio-video-tab" role="tab" aria-selected={activeTab === "video"} aria-controls="portfolio-post-panel" onClick={() => setActiveTab("video")}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="m10 8 6 4-6 4Z" strokeLinejoin="round" /></svg>
          <span>Videolar</span>
        </button>
      </div>
      <div id="portfolio-post-panel" className="bx-portfolio-panel" role="tabpanel" aria-labelledby={activeTab === "all" ? "portfolio-all-tab" : "portfolio-video-tab"}>

      {visiblePosts.length === 0 ? (
        <div className="bx-empty bx-portfolio-empty">
          <svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="4" /><path d="m8 5 2-3h4l2 3" /><circle cx="12" cy="13" r="4" /></svg>
          <strong>{activeTab === "video" ? "Hali video yo'q" : "Hali post yo'q"}</strong>
          <p>Ishlaringizning rasm yoki videolarini joylang. Yaxshi ish ko'rsatilsa, bron ko'payadi.</p>
          <button type="button" className="bx-btn bx-btn-primary" onClick={openAdd}>
            Birinchi postni qo'shish
          </button>
        </div>
      ) : (
        <div className="bx-portfolio-grid">
          {visiblePosts.map((post) => (
            <button key={post.id} type="button" className="bx-portfolio-post" aria-label={`${post.mediaType === "video" ? "Videoni" : "Rasmni"} ochish${post.caption ? `: ${post.caption}` : ""}`} onClick={() => { setDeleteError(""); setViewing(post); }}>
              {post.mediaType === "video" ? (
                <>
                  <PortfolioVideo post={post} thumbnail />
                  <i className="bx-portfolio-play" aria-hidden="true">▶</i>
                </>
              ) : (
                <PortfolioImage key={post.image} src={post.image} alt={post.caption || "Soch olish ishi"} thumbnail />
              )}
              <span className="bx-grid-engagement"><span>♥ {post.likeCount || 0}</span><span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.8A9 9 0 1 1 21 11.5Z" /></svg> {Array.isArray(post.comments) ? post.comments.length : 0}</span></span>
            </button>
          ))}
        </div>
      )}

      </div>
      {/* Add a new post */}
      <Sheet open={adding} title="Yangi post" onClose={() => { if (operationRef.current) return; clearPreview(); setVideoFile(null); selectionRef.current += 1; setBusy(false); setAdding(false); setImage(""); }}>
        <div className="bx-form bx-post-composer">
          <div className="bx-composer-author"><Avatar photo={profile.avatarPhoto} id={profile.avatar} name={fullName} size={38} /><div><strong>{username || fullName || "Sizning profilingiz"}</strong><small>Yangi ishingizni ulashing</small></div></div>
          <div className="bx-upload-types" role="group" aria-label="Post turi">
            <button type="button" aria-pressed={uploadKind === "image"} disabled={busy || saving} onClick={() => setUploadKind("image")}>▧ Rasm</button>
            <button type="button" aria-pressed={uploadKind === "video"} disabled={busy || saving} onClick={() => setUploadKind("video")}>▷ Video</button>
          </div>
          {image && <div className="bx-upload-preview">
            <span className="bx-upload-badge">{mediaType === "video" ? "▷ Video" : "▧ Rasm"}</span>
            {mediaType === "video" ? <video src={image} controls playsInline preload="metadata" onError={() => setSaveError("Bu video telefon brauzerida ochilmadi. MP4 (H.264) nusxasini tanlang.")} aria-label="Tanlangan video" /> : <img src={image} alt="Tanlangan rasm" onError={() => setSaveError("Rasmni ko'rsatib bo'lmadi. Boshqa rasm tanlang.")} />}
          </div>}
          <MediaPicker accept={uploadKind === "video" ? "video/*" : "image/*"} onChange={pickFile} label="Post uchun fayl tanlash" className={`bx-upload-picker ${image ? "has-media" : ""}`} disabled={busy || saving}>
            {!image && <><span className="bx-upload-symbol" aria-hidden="true">{uploadKind === "video" ? "▷" : "▧"}</span><strong>{uploadKind === "video" ? "Videongizni tanlang" : "Eng yaxshi ishingizni ko'rsating"}</strong><p>Galereyadan tanlang, izoh yozing va ulashing.</p></>}
            {image && <strong>Faylni almashtirish</strong>}
          </MediaPicker>

          {busy && <p role="status" className="bx-muted">Tanlangan rasm tayyorlanmoqda...</p>}
          <p className="bx-muted">Rasm: 25 MB gacha. Video: 50 MB gacha. Saqlash imkoniyati brauzer xotirasidagi bo'sh joyga bog'liq.</p>
          {saving && <p role="status" className="bx-muted">{mediaType === "video" ? "Video saqlanmoqda..." : "Post saqlanmoqda..."}</p>}
          {saveError && <p className="bx-error" role="alert">{saveError}</p>}

          <label className="bx-field">
            Xizmat
            <select className="bx-input" value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">Tanlanmagan</option>
              {profile.services.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="bx-field">
            Post matni ({caption.length}/120)
            <textarea
              ref={captionInput}
              className="bx-input"
              rows={3}
              maxLength={120}
              value={caption}
              placeholder="Masalan: Mid fade + soqol dizayni"
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>

          <EmojiPicker disabled={busy || saving} onSelect={(emoji) => {
            const start = captionInput.current?.selectionStart ?? caption.length;
            const end = captionInput.current?.selectionEnd ?? caption.length;
            const next = caption.slice(0, start) + emoji + caption.slice(end);
            if (next.length > 120) return;
            setCaption(next);
            requestAnimationFrame(() => { captionInput.current?.focus(); captionInput.current?.setSelectionRange(start + emoji.length, start + emoji.length); });
          }} />

          <button type="button" className="bx-btn bx-btn-primary bx-btn-block" onClick={publish} disabled={!image || busy || saving}>
            {saving ? "Ulashilmoqda…" : "Ulashish →"}
          </button>
        </div>
      </Sheet>

      {/* View / delete a post */}
      <Sheet
        open={!!viewing}
        title="Post"
        onClose={() => {
          if (operationRef.current) return;
          setViewing(null);
          setConfirmDelete(false);
        }}
      >
        {viewing && (
          <div className="bx-form bx-portfolio-viewer">
            <div className="bx-portfolio-post-author">
              {(profile.avatarPhoto || profile.avatar) && <Avatar photo={profile.avatarPhoto} id={profile.avatar} name={fullName} size={34} />}
              <div>
                {(username || fullName) && <strong>{username || fullName}</strong>}
                {viewing.service && <small>{viewing.service}</small>}
              </div>
            </div>
            {viewing.mediaType === "video" ? (
              <PortfolioVideo key={viewing.id} post={viewing} />
            ) : (
              <PortfolioImage key={viewing.image} src={viewing.image} alt={viewing.caption || "Soch olish ishi"} />
            )}
            <div>
              {viewing.service && <span className="bx-chip is-active">{viewing.service}</span>}
              {viewing.caption && <p className="bx-caption">{viewing.caption}</p>}
              {viewing.date && <p className="bx-muted">{longDate(viewing.date)}</p>}
            </div>
            <PostReactions key={viewing.id} postId={viewing.id} />
            {deleteError && <p className="bx-error" role="alert">{deleteError}</p>}
            {deleting && <p role="status">O'chirilmoqda...</p>}
            {confirmDelete ? (
              <div className="bx-confirm">
                <span>Postni o'chirasizmi?</span>
                <div>
                  <button type="button" className="bx-btn bx-btn-sm bx-btn-danger" onClick={remove} disabled={deleting}>
                    Ha
                  </button>
                  <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                    Yo'q
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" className="bx-btn bx-btn-ghost bx-btn-block" onClick={() => setConfirmDelete(true)}>
                O'chirish
              </button>
            )}
          </div>
        )}
      </Sheet>
      {toast}
    </div>
  );
}
