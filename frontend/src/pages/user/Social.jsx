import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import Sheet from "../../components/Sheet";
import { getSession } from "../auth/utils/session";
import UserIcon from "./components/UserIcon";
import UserAvatar from "./components/UserAvatar";
import PostCard from "./social/PostCard";
import Composer from "./social/Composer";
import {
  TABS,
  authorKey,
  emptySocial,
  knownCount,
  loadSocial,
  normalizePost,
  normalizeSocial,
  postTime,
  profileUrl,
  publishSocialPost,
  reportSocialPost,
  searchPosts,
  sendSocialComment,
  shareUrl,
} from "./social/model";
import "./Social.css";

export default function Social({
  loadCatalog = loadSocial,
  publishPost = publishSocialPost,
  sendComment = sendSocialComment,
  reportPost = reportSocialPost,
}) {
  const { profile } = useOutletContext();
  const [params, setParams] = useSearchParams();
  const tab = Object.hasOwn(TABS, params.get("tab"))
    ? params.get("tab")
    : "feed";
  const [request, setRequest] = useState({
    status: "loading",
    data: emptySocial,
  });
  const [retry, setRetry] = useState(0);
  const [likes, setLikes] = useState({});
  const [saves, setSaves] = useState({});
  const [follows, setFollows] = useState({});
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState({});
  const [reason, setReason] = useState("");
  const [reportText, setReportText] = useState("");
  const [manualShare, setManualShare] = useState("");
  const operation = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve()
      .then(() => loadCatalog({ signal: controller.signal }))
      .then(normalizeSocial)
      .then((data) => {
        if (active) setRequest({ status: "ready", data });
      })
      .catch(() => {
        if (active) setRequest({ status: "error", data: emptySocial });
      });
    return () => {
      active = false;
      controller.abort();
    };
  }, [loadCatalog, retry]);
  useEffect(() => () => operation.current?.abort(), []);
  const { data, status } = request;
  const query = params.get("q") || "";
  const category = params.get("category") || "";
  const saved = (p) =>
    Object.hasOwn(saves, p.id)
      ? saves[p.id]
      : p.saved === true ||
        data.savedPostIds.some((id) => String(id) === String(p.id));
  const followed = (p) =>
    follows[authorKey(p.author)] ??
    data.following.includes(authorKey(p.author));
  const liked = (p) =>
    Object.hasOwn(likes, p.id) ? likes[p.id] : !!p.likedByMe;
  let posts = data.posts;
  if (tab === "following") posts = posts.filter(followed);
  if (tab === "saved") posts = posts.filter(saved);
  if (tab === "discover")
    posts = searchPosts(posts, data.services, query, category);
  if (params.get("author"))
    posts = posts.filter((p) => authorKey(p.author) === params.get("author"));
  if (params.get("post"))
    posts = posts.filter((p) => String(p.id) === params.get("post"));
  const selected = data.posts.find(
    (p) => String(p.id) === String(modal?.postId),
  );
  const categories = [
    ...new Set(
      [
        ...data.services.map((s) => s.category),
        ...data.posts.map((p) => p.category),
      ].filter(Boolean),
    ),
  ];
  const popular = data.posts
    .filter((p) => knownCount(p.likeCount) && p.likeCount > 0)
    .sort((a, b) => b.likeCount - a.likeCount)
    .slice(0, 3);
  const role = getSession()?.role === "barber" ? "barber" : "customer";
  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) =>
      value == null || value === "" ? next.delete(key) : next.set(key, value),
    );
    setParams(next, { replace: true });
  }
  function open(type, postId) {
    if (type === "create" && role !== "barber") return;
    setError("");
    setReason("");
    setReportText("");
    setManualShare("");
    setModal({ type, postId });
  }
  function close() {
    if (!busy) {
      setModal(null);
      setError("");
    }
  }
  function reload() {
    setRequest({ status: "loading", data: emptySocial });
    setRetry((n) => n + 1);
  }
  async function share(post) {
    const url = shareUrl(post.id);
    if (navigator.share) {
      try {
        await navigator.share({
          title: post.author.name || "USTARA",
          text: post.caption || "",
          url,
        });
        return;
      } catch (cause) {
        if (cause.name === "AbortError") return;
      }
    }
    try {
      if (!navigator.clipboard?.writeText) throw new Error();
      await navigator.clipboard.writeText(url);
      setNotice("Post havolasi nusxalandi.");
    } catch {
      open("share", post.id);
      setManualShare(url);
    }
  }
  async function submitAction(event) {
    event.preventDefault();
    if (!selected || operation.current) return;
    const text = (drafts[selected.id] || "").trim();
    if (modal.type === "comments" && !text) return;
    if (modal.type === "report" && !reason) {
      setError("Shikoyat sababini tanlang.");
      return;
    }
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setError("");
    try {
      if (modal.type === "comments") {
        const comment = await sendComment(
          selected.id,
          { text },
          { signal: controller.signal },
        );
        if (
          !comment ||
          comment.id == null ||
          typeof comment.text !== "string" ||
          !comment.author
        )
          throw new Error("Server izohni tasdiqlamadi.");
        if (!controller.signal.aborted) {
          setRequest((previous) => ({
            ...previous,
            data: {
              ...previous.data,
              posts: previous.data.posts.map((p) => {
                if (
                  String(p.id) !== String(selected.id) ||
                  p.comments?.some((c) => String(c.id) === String(comment.id))
                )
                  return p;
                return {
                  ...p,
                  comments: [...(p.comments || []), comment],
                  commentCount: knownCount(p.commentCount)
                    ? p.commentCount + 1
                    : p.commentCount,
                };
              }),
            },
          }));
          setDrafts((p) => ({ ...p, [selected.id]: "" }));
        }
      } else {
        const response = await reportPost(
          selected.id,
          { reason, text: reportText.trim() },
          { signal: controller.signal },
        );
        if (response?.accepted !== true)
          throw new Error("Server shikoyatni tasdiqlamadi.");
        if (!controller.signal.aborted) {
          setNotice("Shikoyat qabul qilindi.");
          setModal(null);
        }
      }
    } catch (cause) {
      if (!controller.signal.aborted)
        setError(cause.message || "Amal bajarilmadi. Qayta urinib ko‘ring.");
    } finally {
      if (!controller.signal.aborted) {
        operation.current = null;
        setBusy(false);
      }
    }
  }
  function renderPost(p) {
    return (
      <PostCard
        key={p.id}
        post={p}
        services={data.services}
        allowFollow={
          !(
            data.currentUserId != null &&
            String(data.currentUserId) === String(p.author.id) &&
            p.author.role === role
          )
        }
        liked={liked(p)}
        saved={!!saved(p)}
        followed={!!followed(p)}
        onLike={() => setLikes((v) => ({ ...v, [p.id]: !liked(p) }))}
        onSave={() => {
          setSaves((v) => ({ ...v, [p.id]: !saved(p) }));
          setNotice(
            saved(p)
              ? "Post saqlanganlardan olib tashlandi."
              : "Post vaqtinchalik saqlandi.",
          );
        }}
        onFollow={() =>
          setFollows((v) => ({ ...v, [authorKey(p.author)]: !followed(p) }))
        }
        onComments={() => open("comments", p.id)}
        onShare={() => share(p)}
        onReport={() => open("report", p.id)}
      />
    );
  }
  const titles = {
    create: "Post yaratish",
    comments: "Izohlar",
    report: "Post haqida shikoyat",
    share: "Postni ulashish",
  };
  return (
    <section className="so-page" aria-busy={status === "loading"}>
      <header className="so-heading">
        <div>
          <h1>Social</h1>
          <p>Yangi uslublar. Ustalar ishlari. Sizning ilhomingiz.</p>
        </div>
        {role === "barber" && (
          <button
            type="button"
            className="so-button so-primary"
            onClick={() => open("create")}
          >
            ＋ Post yaratish
          </button>
        )}
      </header>
      <nav className="so-tabs" aria-label="Social bo‘limlari">
        {Object.entries(TABS).map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={tab === key}
            onClick={() => update({ tab: key, post: null, author: null })}
          >
            {label}
          </button>
        ))}
      </nav>
      <p className="so-local-note">
        Like, Save va obunalar vaqtinchalik: sahifa qayta ochilsa tozalanadi.
      </p>
      <p className="so-notice" role="status">
        {notice}
      </p>
      {(params.get("author") || params.get("post")) && (
        <button
          className="so-text-button"
          type="button"
          onClick={() => update({ post: null, author: null })}
        >
          ← Barcha postlar
        </button>
      )}
      {status === "loading" ? (
        <div className="so-loading" role="status">
          <p>Postlar yuklanmoqda…</p>
          <div className="so-skeleton" aria-hidden="true" />
        </div>
      ) : status === "error" ? (
        <Empty
          title="Lentani yuklab bo‘lmadi"
          text="Qayta urinib ko‘ring. Muammo davom etsa, biroz kuting."
          action={
            <button className="so-button" type="button" onClick={reload}>
              Qayta urinish
            </button>
          }
          error
        />
      ) : (
        <>
          {tab === "discover" && (
            <>
              <div className="so-search">
                <UserIcon name="search" />
                <input
                  type="search"
                  value={query}
                  onChange={(e) => update({ q: e.target.value })}
                  placeholder="Uslub, xizmat yoki muallif"
                  aria-label="Postlarni qidirish"
                />
                {query && (
                  <button
                    className="so-icon-button"
                    type="button"
                    aria-label="Qidiruvni tozalash"
                    onClick={() => update({ q: null })}
                  >
                    <UserIcon name="close" size={18} />
                  </button>
                )}
              </div>
              {categories.length > 0 && (
                <div
                  className="so-categories"
                  role="group"
                  aria-label="Soch turmagi kategoriyasi"
                >
                  <button
                    type="button"
                    aria-pressed={!category}
                    onClick={() => update({ category: null })}
                  >
                    Hammasi
                  </button>
                  {categories.map((c) => (
                    <button
                      type="button"
                      key={c}
                      aria-pressed={category === c}
                      onClick={() =>
                        update({ category: category === c ? null : c })
                      }
                    >
                      {c}
                    </button>
                  ))}
                </div>
              )}
              <div className="so-discover-grid">
                <section>
                  <h2>Trenddagi uslublar</h2>
                  {data.discover.trends.length ? (
                    data.discover.trends.map((t) => (
                      <button
                        type="button"
                        className="so-text-button"
                        key={t.id}
                        onClick={() => update({ q: t.name })}
                      >
                        {t.name}
                      </button>
                    ))
                  ) : (
                    <p>Trendlar hali mavjud emas.</p>
                  )}
                </section>
                <section>
                  <h2>Yangi barberlar</h2>
                  {data.discover.barbers.length ? (
                    data.discover.barbers.map((b) => (
                      <Link
                        key={b.id}
                        to={profileUrl({ ...b, role: "barber" })}
                      >
                        {b.name}
                      </Link>
                    ))
                  ) : (
                    <p>Barberlar hali qo‘shilmagan.</p>
                  )}
                </section>
                <section>
                  <h2>Mashhur salonlar</h2>
                  {data.discover.salons.length ? (
                    data.discover.salons.map((s) => (
                      <Link key={s.id} to={profileUrl({ ...s, role: "salon" })}>
                        {s.name}
                      </Link>
                    ))
                  ) : (
                    <p>Salonlar hali qo‘shilmagan.</p>
                  )}
                </section>
              </div>
              {!query && !category && (
                <section className="so-popular">
                  <h2>Ommabop postlar</h2>
                  <div>
                    {popular.length ? (
                      popular.map((p) => (
                        <button
                          type="button"
                          key={p.id}
                          onClick={() => update({ post: p.id })}
                        >
                          {p.caption || p.author.name || "Postni ko‘rish"}
                          <UserIcon name="arrow" size={17} />
                        </button>
                      ))
                    ) : (
                      <p className="so-hint">
                        Ommabop postlar hali mavjud emas.
                      </p>
                    )}
                  </div>
                </section>
              )}
            </>
          )}
          <div className="so-feed">
            {posts.length ? (
              posts.map(renderPost)
            ) : (
              <Empty
                title={
                  params.get("post")
                    ? "Post topilmadi"
                    : tab === "following"
                      ? "Obunalaringiz shu yerda ko‘rinadi"
                      : tab === "saved"
                        ? "Saqlangan postlar yo‘q"
                        : tab === "discover" && (query || category)
                          ? "Mos postlar topilmadi"
                          : "Lenta hali bo‘sh"
                }
                text={
                  tab === "following"
                    ? "Barber yoki salonlarga obuna bo‘ling va yangi ishlarini kuzating."
                    : tab === "saved"
                      ? "Yoqtirgan postlaringizdagi Save tugmasini bosing."
                      : "Ma’lumotlar qo‘shilgach, soch turmaklari va ustalar ishlari shu yerda ko‘rinadi."
                }
                action={
                  ["following", "saved"].includes(tab) ? (
                    <button
                      type="button"
                      className="so-button"
                      onClick={() =>
                        update({ tab: "discover", post: null, author: null })
                      }
                    >
                      Discover’ga o‘tish
                    </button>
                  ) : tab === "discover" && (query || category) ? (
                    <button
                      type="button"
                      className="so-button"
                      onClick={() =>
                        update({ q: null, category: null, post: null })
                      }
                    >
                      Qidiruvni tozalash
                    </button>
                  ) : (
                    <Link className="so-button" to="/user/explore">
                      Barber va salonlarni topish
                    </Link>
                  )
                }
              />
            )}
          </div>
        </>
      )}
      <div
        className={`so-dialog-scope ${modal?.type === "create" ? "so-create-scope" : ""}`}
      >
        <Sheet
          open={!!modal}
          title={titles[modal?.type] || "Social"}
          onClose={close}
        >
          {role === "barber" && modal?.type === "create" && (
            <Composer
              profile={profile}
              services={data.services}
              role={role}
              publish={publishPost}
              onBusy={setBusy}
              onPublished={(value) => {
                const post = normalizePost(value);
                setRequest((p) => ({
                  ...p,
                  status: "ready",
                  data: {
                    ...p.data,
                    posts: [
                      post,
                      ...p.data.posts.filter(
                        (v) => String(v.id) !== String(post.id),
                      ),
                    ],
                  },
                }));
                setBusy(false);
                setModal(null);
                setNotice("Post server tomonidan saqlandi.");
              }}
            />
          )}
          {modal?.type === "comments" && selected && (
            <div className="so-comments">
              {selected.comments?.length ? (
                <ul>
                  {selected.comments.map((c) => (
                    <li key={c.id}>
                      <UserAvatar
                        photo={c.author?.avatarPhoto}
                        name={c.author?.name}
                        size={32}
                      />
                      <div>
                        <strong>
                          {c.author?.name || "Muallif nomi ko‘rsatilmagan"}
                        </strong>
                        <p>{c.text}</p>
                        <time dateTime={c.createdAt}>
                          {postTime(c.createdAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="so-hint">
                  {knownCount(selected.commentCount) &&
                  selected.commentCount > 0
                    ? "Izohlar matni hali yuklanmagan."
                    : "Hali izoh yo‘q."}
                </p>
              )}
              <form onSubmit={submitAction}>
                <label className="so-field">
                  Izohingiz
                  <textarea
                    rows={3}
                    maxLength={500}
                    disabled={busy}
                    value={drafts[selected.id] || ""}
                    onChange={(e) =>
                      setDrafts((p) => ({
                        ...p,
                        [selected.id]: e.target.value,
                      }))
                    }
                    placeholder="Fikringizni yozing…"
                  />
                </label>
                <p className="so-hint">
                  Yuborilmagan matn Social ochiq turgan vaqt davomida qoralamada
                  qoladi.
                </p>
                {error && (
                  <p className="so-error" role="alert">
                    {error}
                  </p>
                )}
                <button
                  className="so-button so-primary"
                  type="submit"
                  disabled={busy || !drafts[selected.id]?.trim()}
                >
                  {busy ? "Yuborilmoqda…" : "Izoh yuborish"}
                </button>
              </form>
            </div>
          )}
          {modal?.type === "report" && (
            <form className="so-report" onSubmit={submitAction}>
              <p className="so-hint">
                Shikoyat sababini tanlang. U faqat server tasdiqlagandan keyin
                yuborilgan hisoblanadi.
              </p>
              <label className="so-field">
                Sabab
                <select
                  value={reason}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="">Tanlang</option>
                  <option value="spam">Spam</option>
                  <option value="inappropriate">Nomaqbul kontent</option>
                  <option value="copyright">Mualliflik huquqi</option>
                  <option value="other">Boshqa sabab</option>
                </select>
              </label>
              <label className="so-field">
                Qo‘shimcha izoh
                <textarea
                  rows={3}
                  maxLength={1000}
                  value={reportText}
                  disabled={busy}
                  onChange={(e) => setReportText(e.target.value)}
                />
              </label>
              {error && (
                <p className="so-error" role="alert">
                  {error}
                </p>
              )}
              <button
                className="so-button so-primary"
                type="submit"
                disabled={busy || !reason}
              >
                {busy ? "Yuborilmoqda…" : "Shikoyat yuborish"}
              </button>
            </form>
          )}
          {modal?.type === "share" && (
            <label className="so-field">
              Havolani nusxalang
              <input
                readOnly
                value={manualShare}
                onFocus={(e) => e.target.select()}
              />
              <span className="so-hint">
                Brauzer avtomatik nusxalashga ruxsat bermadi. Havolani belgilab
                nusxalang.
              </span>
            </label>
          )}
        </Sheet>
      </div>
    </section>
  );
}
function Empty({ title, text, action, error = false }) {
  return (
    <div className="so-empty" role={error ? "alert" : undefined}>
      <span className="so-empty-icon">
        <UserIcon name="comb" size={30} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
