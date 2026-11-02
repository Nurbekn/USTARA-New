import { useRef, useState } from "react";
import PageHeader from "./components/PageHeader";
import Sheet from "./components/Sheet";
import { useToast } from "./components/Toast";
import { addPost, removePost, useBarber } from "./data/store";
import { longDate } from "./data/format";

const MAX_SIDE = 900; // px: keeps each photo around 80–150 KB
const MAX_FILE = 15 * 1024 * 1024;

// Shrinks a photo in the browser and returns a JPEG data URL.
// (localStorage is small; the backend will store real files later.)
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.78));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("bad image"));
    };
    img.src = url;
  });
}

export default function Portfolio() {
  const { profile, posts } = useBarber();
  const { toast, show } = useToast();
  const fileRef = useRef(null);

  const [adding, setAdding] = useState(false);
  const [image, setImage] = useState("");
  const [caption, setCaption] = useState("");
  const [service, setService] = useState("");
  const [busy, setBusy] = useState(false);

  const [viewing, setViewing] = useState(null); // post being viewed
  const [confirmDelete, setConfirmDelete] = useState(false);

  const openAdd = () => {
    setImage("");
    setCaption("");
    setService("");
    setAdding(true);
  };

  const pickFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow picking the same file again
    if (!file) return;
    if (!file.type.startsWith("image/")) return show("Faqat rasm tanlang");
    if (file.size > MAX_FILE) return show("Rasm juda katta (15 MB dan oshmasin)");

    setBusy(true);
    try {
      setImage(await compressImage(file));
    } catch {
      show("Rasmni o'qib bo'lmadi");
    } finally {
      setBusy(false);
    }
  };

  const publish = () => {
    if (!image) return show("Avval rasm tanlang");
    const ok = addPost({ image, caption: caption.trim(), service });
    if (!ok) return show("Xotira to'ldi. Eski postlarni o'chiring");
    setAdding(false);
    show("Post joylandi");
  };

  const remove = () => {
    removePost(viewing.id);
    setViewing(null);
    setConfirmDelete(false);
    show("Post o'chirildi");
  };

  return (
    <div className="bx-page">
      <PageHeader
        title="Ishlarim"
        subtitle="Mijozlar sizni shu rasmlar orqali tanlaydi"
        action={
          <button type="button" className="bx-btn bx-btn-sm bx-btn-primary" onClick={openAdd}>
            + Post
          </button>
        }
      />

      {posts.length === 0 ? (
        <div className="bx-empty">
          <strong>Hali post yo'q</strong>
          <p>Olgan soch rasmlaringizni joylang. Yaxshi ish ko'rsatilsa, bron ko'payadi.</p>
          <button type="button" className="bx-btn bx-btn-primary" onClick={openAdd}>
            Birinchi postni qo'shish
          </button>
        </div>
      ) : (
        <div className="bx-posts">
          {posts.map((post) => (
            <button key={post.id} type="button" className="bx-post" onClick={() => setViewing(post)}>
              <img src={post.image} alt={post.caption || "Soch olish ishi"} loading="lazy" />
              {(post.service || post.caption) && (
                <span>{post.service || post.caption}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Add a new post */}
      <Sheet open={adding} title="Yangi post" onClose={() => setAdding(false)}>
        <div className="bx-form">
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={pickFile} />

          <button
            type="button"
            className={`bx-drop ${image ? "has-image" : ""}`}
            onClick={() => fileRef.current.click()}
            disabled={busy}
          >
            {image ? (
              <img src={image} alt="Tanlangan rasm" />
            ) : (
              <>
                <strong>{busy ? "Yuklanmoqda..." : "Rasm tanlash"}</strong>
                <span>Kameradan yoki galereyadan</span>
              </>
            )}
          </button>
          {image && (
            <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" onClick={() => fileRef.current.click()}>
              Rasmni almashtirish
            </button>
          )}

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
            Izoh ({caption.length}/120)
            <textarea
              className="bx-input"
              rows={3}
              maxLength={120}
              value={caption}
              placeholder="Masalan: Mid fade + soqol dizayni"
              onChange={(e) => setCaption(e.target.value)}
            />
          </label>

          <button type="button" className="bx-btn bx-btn-primary bx-btn-block" onClick={publish} disabled={!image}>
            Joylash
          </button>
        </div>
      </Sheet>

      {/* View / delete a post */}
      <Sheet
        open={!!viewing}
        title="Post"
        onClose={() => {
          setViewing(null);
          setConfirmDelete(false);
        }}
      >
        {viewing && (
          <div className="bx-form">
            <img className="bx-post-full" src={viewing.image} alt={viewing.caption || "Soch olish ishi"} />
            <div>
              {viewing.service && <span className="bx-chip is-active">{viewing.service}</span>}
              {viewing.caption && <p className="bx-caption">{viewing.caption}</p>}
              <p className="bx-muted">{longDate(viewing.date)}</p>
            </div>
            {confirmDelete ? (
              <div className="bx-confirm">
                <span>Postni o'chirasizmi?</span>
                <div>
                  <button type="button" className="bx-btn bx-btn-sm bx-btn-danger" onClick={remove}>
                    Ha
                  </button>
                  <button type="button" className="bx-btn bx-btn-sm bx-btn-ghost" onClick={() => setConfirmDelete(false)}>
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
