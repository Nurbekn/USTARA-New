import { readSiteLocale, siteLocalePath } from "../../utils/siteLocale.js";
import { barberOpsText } from "./barberOpsLocaleV146.js";
import Icon from "../../components/Icon";
import ArrowIcon from "../../components/ArrowIcon";
import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import PortfolioImage from "./components/PortfolioImage";
import VerifiedAvatar from "../../components/VerifiedAvatar";
import PortfolioVideo from "./components/PortfolioVideo";
import { mediaError } from "./data/portfolioMedia";
import {
  publishPortfolioPost,
  deletePortfolioPost,
  setPortfolioFeatured,
} from "./data/portfolioPosts";
import Sheet from "../../components/Sheet";
import MediaPicker from "./components/MediaPicker";
import EmojiPicker from "./components/EmojiPicker";
import MediaGallery from '../user/social/MediaGallery';
import PostReactions from "./components/PostReactions";
import { useToast } from "./components/Toast";
import { useBarber } from "./data/store";
import PublicProfilePreviewCard from "./components/PublicProfilePreviewCard";
import { suggestSocialCaption } from "../user/social/model";

import {
  prepareImage,
  isImageFile,
  isVideoFile,
} from "../../utils/media/imageUpload";

const MAX_FILE = 25 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

export default function Portfolio() {
  const lang = readSiteLocale(useLocation().search);
  const tr = barberOpsText(lang);
  const { profile, posts, errors = {}, status } = useBarber();
  const { toast, show } = useToast();
  const fullName = [profile.firstName, profile.lastName]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ");
  const username =
    typeof profile.username === "string"
      ? profile.username.trim().replace(/^@+/, "")
      : "";
  const [activeTab, setActiveTab] = useState("all");
  const visiblePosts =
    activeTab === "video"
      ? posts.filter((post) => post.mediaType === "video")
      : posts;

  const [adding, setAdding] = useState(false);
  const [uploadKind, setUploadKind] = useState("image");
  const captionInput = useRef(null);
  const [image, setImage] = useState("");
  const [videoFile, setVideoFile] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [featuring, setFeaturing] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const operationRef = useRef(false);
  const selectionRef = useRef(0);
  const previewRef = useRef(null);
  useEffect(
    () => () => {
      selectionRef.current += 1;
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );
  const clearPreview = () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = null;
  };
  const [mediaType, setMediaType] = useState("image");
  const [saveError, setSaveError] = useState("");
  const [caption, setCaption] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
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
    setAiDescription("");
    setAiError("");
    setService("");
    setAdding(true);
  };

  const generateGeminiText = async () => {
    if (!aiDescription.trim() || aiBusy || saving) return;
    setAiBusy(true);
    setAiError("");
    try {
      const text = await suggestSocialCaption({ description: aiDescription, style: "short" });
      setCaption(text.slice(0, 120));
    } catch (error) {
      setAiError(error?.message || "Gemini javob bera olmadi.");
    } finally { setAiBusy(false); }
  };

  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file || operationRef.current) return;
    const isVideo = isVideoFile(file);
    if (!isVideo && !isImageFile(file)) {
      return setSaveError(tr("Rasm yoki video faylini tanlang."));
    }
    if (file.size > (isVideo ? MAX_VIDEO : MAX_FILE)) {
      return setSaveError(
        isVideo ? tr("Video 50 MB dan oshmasin") : tr("Rasm 25 MB dan oshmasin"),
      );
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
      if (selection === selectionRef.current)
        setSaveError(error.message || tr("Faylni o'qib bo'lmadi"));
    } finally {
      if (selection === selectionRef.current) setBusy(false);
    }
  };

  const publish = async () => {
    if (busy || operationRef.current) return;
    if (!image) return show(tr("Avval rasm yoki video tanlang"));
    operationRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      await publishPortfolioPost({
        image,
        videoFile,
        caption: caption.trim(),
        service,
      });
      setAdding(false);
      setImage("");
      clearPreview();
      setVideoFile(null);
      show(tr("Post joylandi"));
    } catch (error) {
      setSaveError(
        error.message?.startsWith("Post ") ? error.message : mediaError(error),
      );
    } finally {
      operationRef.current = false;
      setSaving(false);
    }
  };

  const setFeatured = async () => {
    if (operationRef.current || !viewing) return;
    operationRef.current = true;
    setFeaturing(true);
    setDeleteError("");
    try {
      const result = await setPortfolioFeatured(viewing, !viewing.featured);
      setViewing(current => current?.id === result.postId ? {...current,featured:result.featured} : current);
      show(result.featured ? ({uz:"Ish yuqoriga biriktirildi",ru:"Работа закреплена",en:"Work featured"})[lang]
        : ({uz:"Belgi olib tashlandi",ru:"Закрепление снято",en:"Work unfeatured"})[lang]);
    } catch(error) {
      setDeleteError(error.message || "Portfolio belgisini o‘zgartirib bo‘lmadi.");
    } finally { operationRef.current = false; setFeaturing(false); }
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
      show(tr("Post o'chirildi"));
    } catch (error) {
      setDeleteError(
        error.message?.startsWith("Post ") ? error.message : mediaError(error),
      );
    } finally {
      operationRef.current = false;
      setDeleting(false);
    }
  };

  return (
    <div className="bx-page bx-portfolio">
      <header className="bx-portfolio-profile">
        <div className="bx-portfolio-heading">
          <h1>{username || tr("Portfolio")}</h1>
          <div className="bx-portfolio-tools">
            <button
              type="button"
              className="bx-portfolio-tool"
              onClick={openAdd}
              aria-label={tr("Yangi post qo'shish")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                aria-hidden="true"
              >
                <rect x="3" y="3" width="18" height="18" rx="5" />
                <path d="M12 7v10M7 12h10" />
              </svg>
            </button>
            <Link
              to={siteLocalePath("/barber/profile", lang)}
              className="bx-portfolio-tool"
              aria-label={tr("Profil sozlamalari")}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </Link>
          </div>
        </div>

        <div className="bx-portfolio-overview">
          <Link
            to={siteLocalePath("/barber/profile", lang)}
            className="bx-portfolio-avatar"
            aria-label={tr("Profil rasmini o'zgartirish")}
          >
            <VerifiedAvatar verified={profile.verification_status === "approved"} photo={profile.avatarPhoto} name={fullName} size={112} />
          </Link>
          <dl className="bx-portfolio-stats">
            <div>
              <dt>{tr("Postlar")}</dt>
              <dd>{posts.length}</dd>
            </div>
            <div>
              <dt>{tr("Obunachilar")}</dt>
              <dd>{profile.followers || 0}</dd>
            </div>
            <div>
              <dt>{tr("Kuzatuvlar")}</dt>
              <dd>{profile.following || 0}</dd>
            </div>
          </dl>
        </div>

        <div className="bx-portfolio-details">
          {fullName && <h2>{fullName}</h2>}
          {profile.about && <p className="bx-portfolio-bio">{profile.about}</p>}
          {typeof profile.experience === "number" &&
            Number.isFinite(profile.experience) &&
            profile.experience >= 0 && (
              <p className="bx-portfolio-experience">
                {profile.experience} {tr("Yil tajriba")}
              </p>
            )}
          {profile.address && (
            <p className="bx-portfolio-address">
              <Icon
                name="pin"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                aria-hidden="true"
              />
              {profile.address}
            </p>
          )}
        </div>
        <div className="bx-portfolio-actions">
          <Link to={siteLocalePath("/barber/profile", lang)} className="bx-portfolio-edit">
            {tr("Profilni tahrirlash")}
          </Link>
          <button
            type="button"
            className="bx-portfolio-publish"
            onClick={openAdd}
          >
            {tr("Post qo'shish")}
          </button>
        </div>
      </header>

      <PublicProfilePreviewCard profile={profile} status={status} posts={posts} errors={errors} compact />

      <div
        className="bx-portfolio-tabs"
        role="tablist"
        aria-label={tr("Portfolio postlari")}
      >
        <button
          type="button"
          id="portfolio-all-tab"
          role="tab"
          aria-selected={activeTab === "all"}
          aria-controls="portfolio-post-panel"
          onClick={() => setActiveTab("all")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="1" />
            <path d="M9 3v18M15 3v18M3 9h18M3 15h18" />
          </svg>
          <span>{tr("Postlar")}</span>
        </button>
        <button
          type="button"
          id="portfolio-video-tab"
          role="tab"
          aria-selected={activeTab === "video"}
          aria-controls="portfolio-post-panel"
          onClick={() => setActiveTab("video")}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            aria-hidden="true"
          >
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <path d="m10 8 6 4-6 4Z" strokeLinejoin="round" />
          </svg>
          <span>{tr("Videolar")}</span>
        </button>
      </div>
      <div
        id="portfolio-post-panel"
        className="bx-portfolio-panel"
        role="tabpanel"
        aria-labelledby={
          activeTab === "all" ? "portfolio-all-tab" : "portfolio-video-tab"
        }
      >
        {errors.posts && <p className="bx-error" role="alert">{errors.posts}</p>}
        {visiblePosts.length === 0 ? (
          <div className="bx-empty bx-portfolio-empty">
            <svg
              viewBox="0 0 24 24"
              width="40"
              height="40"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="16" rx="4" />
              <path d="m8 5 2-3h4l2 3" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            <strong>
              {activeTab === "video" ? tr("Hali video yo‘q") : tr("Hali post yo‘q")}
            </strong>
            <p>
              {tr("Ishlaringizning rasm yoki videolarini joylang. Yaxshi ish ko'rsatilsa, bron ko'payadi.")}
            </p>
            
          </div>
        ) : (
          <div className="bx-portfolio-grid">
            {visiblePosts.map((post) => (
              <button
                key={post.id}
                type="button"
                className="bx-portfolio-post"
                aria-label={`${post.mediaType === "video" ? tr("Videoni") : tr("Rasmni")} ochish${post.caption ? `: ${post.caption}` : ""}`}
                onClick={() => {
                  setDeleteError("");
                  setViewing(post);
                }}
              >
                {post.mediaType === "video" ? (
                  <>
                    <PortfolioVideo post={post} thumbnail />
                    <i className="bx-portfolio-play" aria-hidden="true">
                      ▶
                    </i>
                  </>
                ) : (
                  <PortfolioImage
                    key={post.image}
                    src={post.image}
                    alt={post.caption || "Soch olish ishi"}
                    thumbnail
                  />
                )}
                {post.featured && <span className="bx-featured-mark" aria-label="Featured">★</span>}
                <span className="bx-grid-engagement">
                  <span>♥ {Number.isFinite(post.likeCount) ? post.likeCount : "—"}</span>
                  <span>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.8A9 9 0 1 1 21 11.5Z" />
                    </svg>{" "}
                    {post.commentCount || 0}
                  </span>
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
      {/* Add a new post */}
      <Sheet
        open={adding}
        title={tr("Yangi post")}
        onClose={() => {
          if (operationRef.current) return;
          clearPreview();
          setVideoFile(null);
          selectionRef.current += 1;
          setBusy(false);
          setAdding(false);
          setImage("");
        }}
      >
        <div className="bx-form bx-post-composer">
          <div className="bx-composer-author">
            <VerifiedAvatar verified={profile.verification_status === "approved"}
              photo={profile.avatarPhoto}
              id={profile.avatar}
              name={fullName}
              size={38}
            />
            <div>
              <strong>{username || fullName || tr("Sizning profilingiz")}</strong>
              <small>{tr("Yangi ishingizni ulashing")}</small>
            </div>
          </div>
          <div className="bx-upload-types" role="group" aria-label={tr("Post turi")}>
            <button
              type="button"
              aria-pressed={uploadKind === "image"}
              disabled={busy || saving}
              onClick={() => setUploadKind("image")}
            >
              {tr("▧ Rasm")}
            </button>
            <button
              type="button"
              aria-pressed={uploadKind === "video"}
              disabled={busy || saving}
              onClick={() => setUploadKind("video")}
            >
              {tr("▷ Video")}
            </button>
          </div>
          {image && (
            <div className="bx-upload-preview">
              <span className="bx-upload-badge">
                {mediaType === "video" ? tr("▷ Video") : tr("▧ Rasm")}
              </span>
              {mediaType === "video" ? (
                <video
                  src={image}
                  controls
                  playsInline
                  preload="metadata"
                  onError={() =>
                    setSaveError(
                      tr("Bu video telefon brauzerida ochilmadi. MP4 (H.264) nusxasini tanlang."),
                    )
                  }
                  aria-label={tr("Tanlangan video")}
                />
              ) : (
                <img
                  src={image}
                  alt={tr("Tanlangan rasm")}
                  decoding="async"
                  onError={() =>
                    setSaveError(
                      tr("Rasmni ko'rsatib bo'lmadi. Boshqa rasm tanlang."),
                    )
                  }
                />
              )}
            </div>
          )}
          <MediaPicker
            accept={uploadKind === "video" ? "video/*" : "image/*"}
            onChange={pickFile}
            label={tr("Post uchun fayl tanlash")}
            className={`bx-upload-picker ${image ? "has-media" : ""}`}
            disabled={busy || saving}
          >
            {!image && (
              <>
                <span className="bx-upload-symbol" aria-hidden="true">
                  {uploadKind === "video" ? "▷" : "▧"}
                </span>
                <strong>
                  {uploadKind === "video"
                    ? tr("Videongizni tanlang")
                    : tr("Eng yaxshi ishingizni ko'rsating")}
                </strong>
                <p>{tr("Galereyadan tanlang, izoh yozing va ulashing.")}</p>
              </>
            )}
            {image && <strong>{tr("Faylni almashtirish")}</strong>}
          </MediaPicker>

          {busy && (
            <p role="status" className="bx-muted">
              {tr("Tanlangan rasm tayyorlanmoqda...")}
            </p>
          )}
          <p className="bx-muted">
            {tr("Rasm: 25 MB gacha. Video: 50 MB gacha.")}
          </p>
          {saving && (
            <p role="status" className="bx-muted">
              {mediaType === "video"
                ? tr("Video saqlanmoqda...")
                : tr("Post saqlanmoqda...")}
            </p>
          )}
          {saveError && (
            <p className="bx-error" role="alert">
              {saveError}
            </p>
          )}

          <label className="bx-field">
            {tr("Xizmat")}
            <select
              className="bx-input"
              value={service}
              onChange={(e) => setService(e.target.value)}
            >
              <option value="">{tr("Tanlanmagan")}</option>
              {profile.services.map((s) => (
                <option key={s.id}>{s.name}</option>
              ))}
            </select>
          </label>

          <label className="bx-field">
            {tr("Post matni")} ({caption.length}/120)
            <textarea
              ref={captionInput}
              className="bx-input"
              rows={3}
              maxLength={120}
              value={caption}
              placeholder={tr("Masalan: Mid fade + soqol dizayni")}
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>

          <div className="bx-field" style={{ padding: 12, border: "1px solid #334155", borderRadius: 12 }}>
            <strong>{tr("Gemini — post tavsifi")}</strong>
            <small>{tr("Soch turmagini bir-ikki so‘zda ta’riflang. Hech qanday rasm yoki mijoz ma’lumoti yuborilmaydi.")}</small>
            <input className="bx-input" maxLength={600} value={aiDescription}
              onChange={e => setAiDescription(e.target.value)}
              placeholder={tr("Masalan: low fade, klassik kesim")} disabled={aiBusy || saving} />
            <button type="button" className="bx-btn bx-btn-ghost" disabled={!aiDescription.trim() || aiBusy || saving} onClick={generateGeminiText}>
              {aiBusy ? tr("Gemini yozmoqda…") : tr("✨ AI bilan tavsif yozish")}
            </button>
            {aiError && <p className="bx-error" role="alert">{aiError}</p>}
          </div>

          <EmojiPicker
            disabled={busy || saving}
            onSelect={(emoji) => {
              const start =
                captionInput.current?.selectionStart ?? caption.length;
              const end = captionInput.current?.selectionEnd ?? caption.length;
              const next = caption.slice(0, start) + emoji + caption.slice(end);
              if (next.length > 120) return;
              setCaption(next);
              requestAnimationFrame(() => {
                captionInput.current?.focus();
                captionInput.current?.setSelectionRange(
                  start + emoji.length,
                  start + emoji.length,
                );
              });
            }}
          />

          <button
            type="button"
            className="bx-btn bx-btn-primary bx-btn-block"
            onClick={publish}
            disabled={!image || busy || saving}
          >
            {saving ? (
              tr("Ulashilmoqda…")
            ) : (
              <>
                {tr("Ulashish")} <ArrowIcon />
              </>
            )}
          </button>
        </div>
      </Sheet>

      {/* View / delete a post */}
      <Sheet
        open={!!viewing}
        className="bx-post-view-back"
        title={tr("Post")}
        onClose={() => {
          if (operationRef.current) return;
          setViewing(null);
          setConfirmDelete(false);
        }}
      >
        {viewing && (
          <div className="bx-form bx-portfolio-viewer">
            <div className="bx-portfolio-post-author">
              <VerifiedAvatar verified={profile.verification_status === "approved"}
                  photo={profile.avatarPhoto}
                  id={profile.avatar}
                  name={fullName}
                  size={34}
                />
              <div>
                {(username || fullName) && (
                  <strong>{username || fullName}</strong>
                )}
                {viewing.service && <small>{viewing.service}</small>}
              </div>
            </div>
            {viewing.media?.length > 1 ? <MediaGallery media={viewing.media} name={viewing.caption || fullName}/> : viewing.mediaType === "video" ? (
              <PortfolioVideo key={viewing.id} post={viewing} />
            ) : (
              <PortfolioImage
                key={viewing.image}
                src={viewing.image}
                alt={viewing.caption || "Soch olish ishi"}
              />
            )}
            <PostReactions key={viewing.id} postId={viewing.id} caption={viewing.caption} date={viewing.date} author={fullName} lang={lang}/>
            <button type="button" className="bx-btn bx-btn-ghost bx-btn-block"
              onClick={setFeatured} disabled={featuring || deleting || saving || (posts.filter(p => p.featured).length >= 6 && !viewing.featured)}>
              {featuring ? ({uz:"Saqlanmoqda…",ru:"Сохранение…",en:"Saving…"})[lang]
                : viewing.featured ? ({uz:"★ Biriktirishni olib tashlash",ru:"★ Открепить работу",en:"★ Unfeature work"})[lang]
                : ({uz:"☆ Eng yaxshi ish sifatida belgilash",ru:"☆ Закрепить лучшую работу",en:"☆ Feature this work"})[lang]}
            </button>
            <p className="bx-muted" role="status">{({uz:`Eng yaxshi ishlar: ${posts.filter(p=>p.featured).length}/6`,ru:`Избранные работы: ${posts.filter(p=>p.featured).length}/6`,en:`Featured works: ${posts.filter(p=>p.featured).length}/6`})[lang]}</p>
            {deleteError && (
              <p className="bx-error" role="alert">
                {deleteError}
              </p>
            )}
            {deleting && <p role="status">{tr("O'chirilmoqda...")}</p>}
            {confirmDelete ? (
              <div className="bx-confirm">
                <span>{tr("Postni o'chirasizmi?")}</span>
                <div>
                  <button
                    type="button"
                    className="bx-btn bx-btn-sm bx-btn-danger"
                    onClick={remove}
                    disabled={deleting}
                  >
                    {tr("Ha")}
                  </button>
                  <button
                    type="button"
                    className="bx-btn bx-btn-sm bx-btn-ghost"
                    onClick={() => setConfirmDelete(false)}
                    disabled={deleting}
                  >
                    {tr("Yo'q")}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="bx-btn bx-btn-ghost bx-btn-block"
                onClick={() => setConfirmDelete(true)}
              >
                {tr("O'chirish")}
              </button>
            )}
          </div>
        )}
      </Sheet>
      {toast}
    </div>
  );
}
