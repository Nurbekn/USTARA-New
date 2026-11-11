import { Avatar } from "../../../components/Avatar";
import ArrowIcon from "../../../components/ArrowIcon";
import { useEffect, useRef, useState } from "react";
import Icon from "../../../components/Icon";
import { isImageFile, isVideoFile } from "../../../utils/media/imageUpload";

const fileKey = (file) =>
  `${file.name}:${file.size}:${file.lastModified}:${file.type}`;
export default function Composer({
  profile,
  services,
  role,
  publish,
  onPublished,
  onBusy,
}) {
  const [media, setMedia] = useState([]);
  const [active, setActive] = useState(0);
  const [step, setStep] = useState("select");
  const [caption, setCaption] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [kind, setKind] = useState("standard");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewErrors, setPreviewErrors] = useState({});
  const current = useRef([]);
  const pending = useRef(null);
  useEffect(
    () => () => {
      current.current.forEach((m) => URL.revokeObjectURL(m.url));
      pending.current?.abort();
    },
    [],
  );
  function commit(next) {
    current.current = next;
    setMedia(next);
  }
  function selectFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length || busy) return;
    if (files.some((f) => !isImageFile(f) && !isVideoFile(f))) {
      setError("Rasm yoki video tanlang.");
      return;
    }
    const existing = current.current;
    const keys = new Set(existing.map((m) => fileKey(m.file)));
    const additions = files.filter((f) => {
      const key = fileKey(f);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    if (!additions.length) {
      setError("Bu fayllar allaqachon tanlangan.");
      return;
    }
    const combined = [...existing.map((m) => m.file), ...additions];
    if (combined.length > 6) {
      setError(
        "Jami 6 tagacha rasm tanlash mumkin. Oldingi rasmlar saqlanib turibdi.",
      );
      return;
    }
    if (combined.some(isVideoFile) && combined.length !== 1) {
      setError(
        "Bitta video yoki bir nechta rasm tanlang. Videoga o‘tish uchun avval rasmlarni olib tashlang.",
      );
      return;
    }
    if (
      additions.some((f) => f.size > (isVideoFile(f) ? 100 : 25) * 1024 * 1024)
    ) {
      setError("Rasm 25 MB, video 100 MB dan oshmasin.");
      return;
    }
    const next = [
      ...existing,
      ...additions.map((file) => ({
        file,
        url: URL.createObjectURL(file),
        type: isVideoFile(file) ? "video" : "image",
      })),
    ];
    commit(next);
    setActive(existing.length);
    setStep("preview");
    setError("");
  }
  function remove(index) {
    const list = current.current;
    URL.revokeObjectURL(list[index].url);
    const next = list.filter((_, i) => i !== index);
    commit(next);
    setActive(Math.max(0, Math.min(active, next.length - 1)));
    setError("");
    if (!next.length) setStep("select");
  }
  function nextStep() {
    if (!media.length) {
      setError("Avval rasm yoki video tanlang.");
      return;
    }
    if (step === "select") {
      setStep("preview");
      setError("");
      return;
    }
    if (media.some((m) => previewErrors[m.url])) {
      setError("Ochib bo‘lmagan faylni almashtiring yoki olib tashlang.");
      return;
    }
    if (
      kind === "beforeAfter" &&
      (media.length !== 2 || media.some((m) => m.type !== "image"))
    ) {
      setError("Before / After uchun aynan ikkita rasm kerak.");
      return;
    }
    setError("");
    setStep("details");
  }
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    if (step !== "details") {
      nextStep();
      return;
    }
    if (!media.length || media.some((m) => previewErrors[m.url])) {
      setError("Media fayllarni tekshiring.");
      return;
    }
    if (
      kind === "beforeAfter" &&
      (media.length !== 2 || media.some((m) => m.type !== "image"))
    ) {
      setError("Before / After uchun ikkita rasm kerak.");
      return;
    }
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    onBusy(true);
    setError("");
    try {
      const post = await publish(
        {
          files: media.map((m) => m.file),
          caption: caption.trim(),
          kind,
          serviceId: serviceId || null,
        },
        { signal: controller.signal },
      );
      if (!controller.signal.aborted) onPublished(post);
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(
          cause.message || "Post joylanmadi. Qoralama saqlanib turibdi.",
        );
    } finally {
      if (!controller.signal.aborted) {
        pending.current = null;
        setBusy(false);
        onBusy(false);
      }
    }
  }
  function renderMedia(m, index) {
    return (
      <div className="so-compose-media" key={m.url}>
        {previewErrors[m.url] ? (
          <div className="so-media-error">
            Faylni ochib bo‘lmadi. Boshqa format tanlang.
          </div>
        ) : m.type === "video" ? (
          <video
            src={m.url}
            controls
            playsInline
            preload="metadata"
            onError={() => setPreviewErrors((p) => ({ ...p, [m.url]: true }))}
          />
        ) : (
          <img
            src={m.url}
            alt={`${index + 1}-rasm preview`}
            onError={() => setPreviewErrors((p) => ({ ...p, [m.url]: true }))}
          />
        )}
        {kind === "beforeAfter" && media.length === 2 && (
          <span className="so-compose-pair-label">
            {index === 0 ? "Oldin" : "Keyin"}
          </span>
        )}
      </div>
    );
  }
  const pair =
    kind === "beforeAfter" &&
    media.length === 2 &&
    media.every((m) => m.type === "image");
  return (
    <form className={`so-composer so-compose-${step}`} onSubmit={submit}>
      <div className="so-compose-nav">
        <button
          type="button"
          className="so-compose-back"
          disabled={busy || step === "select"}
          onClick={() => {
            setError("");
            setStep(step === "details" ? "preview" : "select");
          }}
        >
          <ArrowIcon direction="left" /> Ortga
        </button>
        <span>
          {step === "select"
            ? "Media tanlash"
            : step === "preview"
              ? "Ko‘rib chiqish"
              : "Tavsif yozish"}
        </span>
        {step === "details" ? (
          <button type="submit" className="so-compose-next" disabled={busy}>
            {busy ? "Yuborilmoqda…" : "Ulashish"}
          </button>
        ) : (
          <button
            type="button"
            className="so-compose-next"
            disabled={!media.length}
            onClick={nextStep}
          >
            Keyingi <ArrowIcon />
          </button>
        )}
      </div>
      <div
        className={`so-compose-layout ${step === "details" ? "so-compose-with-details" : ""}`}
      >
        {step === "select" ? (
          <label className="so-upload so-compose-drop">
            <Icon name="comb" size={44} />
            <strong>Rasm va videolaringizni tanlang</strong>
            <span>6 tagacha rasm yoki 1 ta video</span>
            <span className="so-button so-primary">Qurilmadan tanlash</span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              onChange={selectFiles}
              disabled={busy}
            />
          </label>
        ) : (
          <div className="so-compose-gallery">
            <div
              className={`so-compose-viewer ${pair ? "so-compose-pair" : ""}`}
            >
              {pair
                ? media.map(renderMedia)
                : media[active] && renderMedia(media[active], active)}
              {!pair && media.length > 1 && (
                <>
                  <button
                    type="button"
                    className="so-gallery-arrow so-gallery-prev"
                    disabled={active === 0 || busy}
                    aria-label="Oldingi rasm"
                    onClick={() => setActive((n) => n - 1)}
                  >
                    <ArrowIcon direction="left" variant="chevron" />
                  </button>
                  <button
                    type="button"
                    className="so-gallery-arrow so-gallery-next"
                    disabled={active === media.length - 1 || busy}
                    aria-label="Keyingi rasm"
                    onClick={() => setActive((n) => n + 1)}
                  >
                    <ArrowIcon variant="chevron" />
                  </button>
                </>
              )}
              <span className="so-gallery-count">
                {pair ? "Oldin / Keyin" : `${active + 1} / ${media.length}`}
              </span>
            </div>
            <div
              className="so-compose-thumbnails"
              aria-label="Tanlangan fayllar"
            >
              {media.map((m, index) => (
                <button
                  type="button"
                  key={m.url}
                  disabled={busy}
                  aria-label={`${index + 1}-faylni ko‘rish`}
                  aria-pressed={active === index}
                  onClick={() => setActive(index)}
                >
                  {m.type === "image" ? (
                    <img
                      src={m.url}
                      alt={m.file.name}
                      onError={() =>
                        setPreviewErrors((p) => ({ ...p, [m.url]: true }))
                      }
                    />
                  ) : (
                    <span>Video</span>
                  )}
                  <span className="so-thumb-number">{index + 1}</span>
                </button>
              ))}
            </div>
            {step === "preview" && (
              <div className="so-compose-media-tools">
                <label className="so-compose-add">
                  ＋ Qo‘shish
                  <input
                    type="file"
                    accept="image/*,video/*"
                    multiple
                    onChange={selectFiles}
                    disabled={busy}
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(active)}
                >
                  Tanlanganini o‘chirish
                </button>
              </div>
            )}
            {step === "preview" && (
              <div className="so-compose-options">
                <div className="so-kind" role="group" aria-label="Post turi">
                  <button
                    type="button"
                    aria-pressed={kind === "standard"}
                    onClick={() => setKind("standard")}
                  >
                    Oddiy post
                  </button>
                  <button
                    type="button"
                    aria-pressed={kind === "beforeAfter"}
                    onClick={() => setKind("beforeAfter")}
                  >
                    Before / After
                  </button>
                </div>
                {pair && (
                  <button
                    type="button"
                    className="so-text-button"
                    onClick={() => {
                      commit([...media].reverse());
                      setActive(1 - active);
                    }}
                  >
                    Rasmlarni almashtirish
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        {step === "details" && (
          <div className="so-compose-details">
            <div className="so-composer-author">
              <Avatar className="up-user-avatar"
                photo={profile.avatarPhoto}
                id={profile.avatar}
                name={profile.firstName}
                size={36}
              />
              <span>
                {[profile.firstName, profile.lastName]
                  .filter(Boolean)
                  .join(" ") || "Yangi post"}
              </span>
            </div>
            <label className="so-field">
              Tavsif
              <textarea
                rows={6}
                maxLength={2000}
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                disabled={busy}
                placeholder={
                  role === "barber"
                    ? "Ishingiz haqida yozing…"
                    : "Uslubingiz haqida yozing…"
                }
              />
              <span className="so-hint">{caption.length}/2000</span>
            </label>
            <label className="so-field">
              Xizmat biriktirish
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                disabled={busy || !services.length}
              >
                <option value="">
                  {services.length
                    ? "Xizmatni tanlang (ixtiyoriy)"
                    : "Xizmatlar hali mavjud emas"}
                </option>
                {services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <p className="so-hint">
              Post faqat server tasdiqlagandan keyin lentada ko‘rinadi. Oyna
              yopilsa qoralama tozalanadi.
            </p>
          </div>
        )}
      </div>
      {error && (
        <p className="so-error so-compose-error" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
