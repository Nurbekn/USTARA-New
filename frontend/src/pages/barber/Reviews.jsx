import { useLocation } from "react-router-dom";
import { readSiteLocale } from "../../utils/siteLocale.js";
import { barberInsightsText, barberInsightsDate } from "./barberInsightsLocaleV147.js";
import { useState } from "react";
import PageHeader from "./components/PageHeader";
import Stars from "./components/Stars";
import { useToast } from "./components/Toast";
import { Avatar } from "../../components/Avatar";
import { getRatingSummary, replyToReview, useBarber } from "./data/store";
import { dateLabel } from "./data/format";

const FILTERS = [
  { id: "all", label: "Hammasi", test: () => true },
  { id: "5", label: "5 ★", test: (r) => r.rating === 5 },
  { id: "4", label: "4 ★", test: (r) => r.rating === 4 },
  { id: "low", label: "3 va past", test: (r) => r.rating <= 3 },
];

export default function Reviews() {
  const lang=readSiteLocale(useLocation().search);
  const tr=barberInsightsText(lang);
  const { reviews } = useBarber();
  const { toast, show } = useToast();
  const [filter, setFilter] = useState("all");
  const [replying, setReplying] = useState(null); // review id
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const { average, count, distribution } = getRatingSummary(reviews);
  const active = FILTERS.find((f) => f.id === filter);
  const list = reviews
    .filter(active.test)
    .sort((a, b) => b.date.localeCompare(a.date));

  const startReply = (review) => {
    setReplying(review.id);
    setText(review.reply);
  };

  const sendReply = async (reviewId) => {
    if (saving || !text.trim()) return;
    setSaving(true); setError("");
    try {
      await replyToReview(reviewId, text);
      setReplying(null); setText(""); show(tr("Javob saqlandi."));
    } catch (cause) { setError(cause.message || tr("Javob saqlanmadi.")); }
    finally { setSaving(false); }
  };

  return (
    <div className="bx-page">
      <PageHeader back title={tr("Sharhlar")} subtitle={tr("Mijozlaringiz fikri")} />

      <section className="bx-card bx-rating">
        <div className="bx-rating-big">
          <strong>{count ? average.toFixed(1) : "—"}</strong>
          <Stars value={average} size={16} />
          <span className="bx-muted">{tr("Mijozlar bahosi")}</span>
        </div>
        {!count ? <p className="bx-muted">{tr("Hozircha sharhlar yo‘q.")}</p> : <div className="bx-rating-bars">
          {[5, 4, 3, 2, 1].map((n) => (
            <div key={n}>
              <span>{n}</span>
              <div className="bx-meter">
                <i
                  style={{
                    width: `${count ? (distribution[n] / count) * 100 : 0}%`,
                  }}
                />
              </div>
              <small>{distribution[n] ?? "—"}</small>
            </div>
          ))}
        </div>}
      </section>

      <div className="bx-chips">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`bx-chip ${filter === f.id ? "is-active" : ""}`}
            onClick={() => setFilter(f.id)}
          >
            {tr(f.label)}
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        <div className="bx-empty">
          <strong>{tr("Sharhlar mavjud emas")}</strong>
          <p>{tr("Yakunlangan bronlardan kelgan sharhlar shu yerda chiqadi.")}</p>
        </div>
      ) : (
        <div className="bx-list">
          {list.map((r) => (
            <article key={r.id} className="bx-card bx-review">
              <div className="bx-review-top">
                <Avatar name={r.customer} size={38} />
                <div>
                  <strong>{r.customer}</strong>
                  <span className="bx-muted">{barberInsightsDate(r.date,lang) ?? dateLabel(r.date)}</span>
                </div>
                <Stars value={r.rating} />
              </div>
              <p>{r.text}</p>

              {replying === r.id ? (
                <div className="bx-form">
                  <textarea
                    className="bx-input"
                    rows={3}
                    maxLength={200}
                    value={text}
                    placeholder={tr("Mijozga javob yozing...")}
                    onChange={(e) => setText(e.target.value)}
                  />
                  <div className="bx-inline-actions">
                    <button
                      type="button"
                      className="bx-btn bx-btn-sm bx-btn-primary"
                      disabled={saving || !text.trim()}
                      onClick={() => void sendReply(r.id)}
                    >
                      {saving ? tr("Saqlanmoqda…") : tr("Yuborish")}
                    </button>
                    <button
                      type="button"
                      className="bx-btn bx-btn-sm bx-btn-ghost"
                      onClick={() => setReplying(null)}
                    >
                      Bekor
                    </button>
                  </div>
                  {error && <p className="bx-error" role="alert">{error}</p>}
                </div>
              ) : (
                <>
                  {r.reply && (
                    <div className="bx-reply">
                      <b>{tr("Sizning javobingiz")}</b>
                      <p>{r.reply}</p>
                    </div>
                  )}
                  <button
                    type="button"
                    className="bx-link"
                    onClick={() => startReply(r)}
                  >
                    {r.reply ? tr("Javobni tahrirlash") : tr("Javob yozish")}
                  </button>
                </>
              )}
            </article>
          ))}
        </div>
      )}
      {toast}
    </div>
  );
}
