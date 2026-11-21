import { customerActivityText,hasCustomerActivityTranslation } from './customerActivityLocaleV148.js';
import {socialQueueText} from './social/socialQueueLocaleV149.js';
import { readSiteLocale, siteLocalePath } from '../../utils/siteLocale.js';
import { authorName } from "../../utils/profileName.js";
import PageLoading from "../../components/Loading";
import { Avatar } from "../../components/Avatar";
import ArrowIcon from "../../components/ArrowIcon";
import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useSearchParams } from "react-router-dom";
import Sheet from "../../components/Sheet";
import { getSession } from "../auth/utils/session";
import Icon from "../../components/Icon";
import PostCard from "./social/PostCard";
import MyReportsV177 from "./social/MyReportsV177.jsx";
import { socialReportReceiptsTextV177 } from "./social/socialReportReceiptsV177.js";
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
  publishSocialPost,
  reportSocialPost,
  searchPosts,
  sendSocialComment,
  changeSocialComment,
  sortPinnedCommentsV167,
  setSocialFollow,
  setSocialLike,
  loadPostComments,
  setSocialSave,
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
  const lang = readSiteLocale(params);
  const baseTr = customerActivityText(lang);
  const detailTr = socialQueueText(lang);
  const tr = source => hasCustomerActivityTranslation(lang,source) ? baseTr(source) : detailTr(source);
  const tab = Object.hasOwn(TABS, params.get("tab"))
    ? params.get("tab")
    : "feed";
  const [request, setRequest] = useState({
    status: "loading",
    data: emptySocial,
    error: "",
  });
  const [retry, setRetry] = useState(0);
  const [modal, setModal] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [drafts, setDrafts] = useState({});
  const [reason, setReason] = useState("");
  const [reportText, setReportText] = useState("");
  const [showMyReportsV177, setShowMyReportsV177] = useState(false);
  const [manualShare, setManualShare] = useState("");
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [editing, setEditing] = useState(null);
  const operation = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    Promise.resolve()
      .then(() => loadCatalog({ signal: controller.signal }))
      .then(normalizeSocial)
      .then((data) => {
        if (active) setRequest({ status: "ready", data, error: "" });
      })
      .catch((error) => {
        if (active) setRequest({ status: "error", data: emptySocial, error: error.message });
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
  const saved = (p) => p.saved === true || data.savedPostIds.some((id) => String(id) === String(p.id));
  const followed = (p) => data.following.includes(authorKey(p.author));
  const liked = (p) => !!p.likedByMe;
  let posts = data.posts;
  if (tab === "following") posts = posts.filter(followed);
  if (tab === "saved") posts = posts.filter(saved);
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
  const role = getSession()?.role === "barber" ? "barber" : "customer";
  function update(patch) {
    const next = new URLSearchParams(params);
    Object.entries(patch).forEach(([key, value]) =>
      value == null || value === "" ? next.delete(key) : next.set(key, value),
    );
    setParams(next, { replace: true });
  }
  async function showComments(postId) {
    open("comments", postId);
    setCommentsLoading(true);
    try {
      const comments = await loadPostComments(postId);
      setRequest(previous => ({ ...previous, data: { ...previous.data, posts: previous.data.posts.map(post =>
        String(post.id) === String(postId) ? { ...post, comments } : post) } }));
    } catch (cause) {
      setError(cause.message || "Izohlarni yuklab bo‘lmadi.");
    } finally { setCommentsLoading(false); }
  }
  function open(type, postId) {
    if (type === "create" && role !== "barber") return;
    setError("");
    setReason("");
    setReportText("");
    setManualShare("");
    setEditing(null);
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
          title: authorName(post.author) || "USTARA",
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
      setNotice(tr("Post havolasi nusxalandi."));
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
      setError(tr("Shikoyat sababini tanlang."));
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
          setNotice(tr("Shikoyat qabul qilindi."));
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
  async function togglePost(post, field) {
    if (operation.current) return;
    const before = field === "likedByMe" ? !!post.likedByMe : saved(post);
    const next = !before;
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    setNotice("");
    try {
      const response = field === "likedByMe"
        ? await setSocialLike(post.id, next, { signal: controller.signal })
        : await setSocialSave(post.id, next, { signal: controller.signal });
      if (response?.[field === "likedByMe" ? "liked" : "saved"] !== next) throw new Error("Server amalni tasdiqlamadi.");
      if (controller.signal.aborted) return;
      setRequest((previous) => ({ ...previous, data: {
        ...previous.data,
        savedPostIds: field === "saved" ? (next
          ? [...previous.data.savedPostIds.filter((id) => String(id) !== String(post.id)), post.id]
          : previous.data.savedPostIds.filter((id) => String(id) !== String(post.id))) : previous.data.savedPostIds,
        posts: previous.data.posts.map((item) => String(item.id) === String(post.id)
          ? { ...item, ...(field === "likedByMe" ? { likedByMe: next, likeCount: knownCount(response.likeCount) ? response.likeCount : item.likeCount } : { saved: next }) }
          : item),
      } }));
    } catch (cause) {
      if (!controller.signal.aborted) setNotice(cause.message || "Amalni saqlab bo‘lmadi.");
    } finally {
      if (!controller.signal.aborted) { operation.current = null; setBusy(false); }
    }
  }
  async function toggleFollow(post) {
    if (operation.current || role !== "customer") return;
    const key = authorKey(post.author);
    const followingNow = data.following.includes(key);
    const controller = new AbortController();
    operation.current = controller;
    setBusy(true);
    try {
      const response = await setSocialFollow(post.author.id, !followingNow, { signal: controller.signal });
      if (response?.following !== !followingNow) throw new Error("Server obunani tasdiqlamadi.");
      if (!controller.signal.aborted) setRequest((previous) => ({ ...previous, data: {
        ...previous.data,
        following: followingNow
          ? previous.data.following.filter((item) => item !== key)
          : [...previous.data.following, key],
      } }));
    } catch (cause) {
      if (!controller.signal.aborted) setNotice(cause.message || "Obuna holatini saqlab bo‘lmadi.");
    } finally {
      if (!controller.signal.aborted) { operation.current = null; setBusy(false); }
    }
  }
  async function editComment(comment, remove = false) {
    if (operation.current) return;
    const controller = new AbortController(); operation.current = controller; setBusy(true); setError('');
    try {
      const result = await changeSocialComment(selected.id, comment.id, remove ? null : editing.text, { signal: controller.signal });
      if (!controller.signal.aborted) {
        setRequest(previous => ({ ...previous, data: { ...previous.data, posts: previous.data.posts.map(post => post.id !== selected.id ? post : {
          ...post, commentCount: result.commentCount, comments: remove ? post.comments.filter(item => item.id !== comment.id) : post.comments.map(item => item.id === comment.id ? { ...item, text: result.text } : item),
        }) } })); setEditing(null);
      }
    } catch (cause) { if (!controller.signal.aborted) setError(cause.message || 'Izoh yangilanmadi.'); }
    finally { if (!controller.signal.aborted) { operation.current = null; setBusy(false); } }
  }
  function renderPost(p) {
    return (
      <PostCard
        key={p.id}
        post={p}
        lang={lang}
        services={data.services}
        allowFollow={role === "customer" &&
          !(
            data.currentUserId != null &&
            String(data.currentUserId) === String(p.author.id) &&
            p.author.role === role
          )
        }
        mutationsAvailable={!busy}
        liked={liked(p)}
        saved={!!saved(p)}
        followed={!!followed(p)}
        onLike={() => void togglePost(p, "likedByMe")}
        onSave={() => void togglePost(p, "saved")}
        onFollow={() => void toggleFollow(p)}
        onComments={() => void showComments(p.id)}
        onShare={() => share(p)}
        onReport={() => open("report", p.id)}
      />
    );
  }
  const titles = {
    create: tr("Post yaratish"),
    comments: tr("Izohlar"),
    report: tr("Post haqida shikoyat"),
    share: tr("Postni ulashish"),
  };
  return (
    <section className="so-page" aria-busy={status === "loading"}>
      <header className="so-heading">
        <div>
          <h1>{tr("Ilhom")}</h1>
          <p>{tr("Sartaroshlar ishlari va yangi soch turmaklari.")}</p>
        </div>
        {role === "barber" && (
          <button
            type="button"
            className="so-button so-primary"
            onClick={() => open("create")}
          >
            ＋ {tr("Post yaratish")}
          </button>
        )}
      </header>
      <div className="so-report-access-v177"><button type="button" className="so-text-button" onClick={() => setShowMyReportsV177(value => !value)}>{(socialReportReceiptsTextV177[lang] || socialReportReceiptsTextV177.uz).open}</button></div>
      {showMyReportsV177 && <MyReportsV177 lang={lang} onClose={() => setShowMyReportsV177(false)} />}
      <nav className="so-tabs" aria-label={tr("Ilhom bo‘limlari")}>
        {Object.entries(TABS).map(([key, label]) => (
          <button
            type="button"
            key={key}
            aria-pressed={tab === key}
            onClick={() => update({ tab: key, post: null, author: null })}
          >
            {tr(label)}
          </button>
        ))}
      </nav>
      <p className="so-notice" role="status">
        {notice}
      </p>
      {(params.get("author") || params.get("post")) && (
        <button
          className="so-text-button"
          type="button"
          onClick={() => update({ post: null, author: null })}
        >
          <ArrowIcon direction="left" /> {tr("Barcha postlar")}
        </button>
      )}
      {status === "loading" ? (
        <PageLoading label={tr("Postlar yuklanmoqda…")} />
      ) : status === "error" ? (
        <Empty
          title={tr("Ilhomni yuklab bo‘lmadi")}
          text={request.error || tr("Ijtimoiy ilhom API hozircha mavjud emas.")}
          action={
            <button className="so-button" type="button" onClick={reload}>
              {tr("Qayta urinish")}
            </button>
          }
          error
        />
      ) : (
        <>
          <div className="so-search">
            <Icon name="search" />
            <input
              type="search"
              value={query}
              onChange={(e) => update({ q: e.target.value })}
              placeholder={tr("Uslub, xizmat yoki muallif")}
              aria-label={tr("Postlarni qidirish")}
            />
            {query && (
              <button
                className="so-icon-button"
                type="button"
                aria-label={tr("Qidiruvni tozalash")}
                onClick={() => update({ q: null })}
              >
                <Icon name="close" size={18} />
              </button>
            )}
          </div>
          {categories.length > 0 && (
            <div
              className="so-categories"
              role="group"
              aria-label={tr("Soch turmagi kategoriyasi")}
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
          <div className="so-feed" aria-live="polite">
            {posts.length ? (
              posts.map(renderPost)
            ) : (
              <Empty
                title={
                  params.get("post")
                    ? tr("Post topilmadi")
                    : tab === "following"
                      ? tr("Obunalaringiz shu yerda ko‘rinadi")
                      : tab === "saved"
                        ? tr("Saqlangan postlar yo‘q")
                        : (query || category)
                          ? tr("Mos postlar topilmadi")
                          : tr("Ilhom hali bo‘sh")
                }
                text={
                  tab === "following"
                    ? tr("Sartaroshlarni kuzating va yangi ishlarini shu yerda ko‘ring.")
                    : tab === "saved"
                      ? tr("Yoqtirgan postlaringizdagi saqlash belgisini bosing.")
                      : tr("Ma’lumotlar qo‘shilgach, soch turmaklari va sartaroshlar ishlari shu yerda ko‘rinadi.")
                }
                action={
                  ["following", "saved"].includes(tab) ? (
                    <button
                      type="button"
                      className="so-button"
                      onClick={() =>
                        update({ tab: "feed", post: null, author: null, q: null, category: null })
                      }
                    >
                      Ilhomga qaytish
                    </button>
                  ) : (query || category) ? (
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
                    <Link className="so-button" to={siteLocalePath("/user/explore", lang)}>
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
          title={titles[modal?.type] || tr("Ilhom")}
          onClose={close}
        >
          {role === "barber" && modal?.type === "create" && (
            <Composer
              profile={profile}
              services={data.services}
              role={role}
              lang={lang}
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
                setNotice(tr("Post server tomonidan saqlandi."));
              }}
            />
          )}
          {modal?.type === "comments" && selected && (
            <div className="so-comments">
              {commentsLoading && <p className="so-hint" role="status">{tr("Izohlar yuklanmoqda…")}</p>}
              {!commentsLoading && selected.comments?.length ? (
                <ul>
                  {sortPinnedCommentsV167(selected.comments).map((c) => (
                    <li key={c.id}>
                      <Avatar className="up-user-avatar"
                        photo={c.author?.avatarPhoto}
                        name={authorName(c.author)}
                        size={32}
                      />
                      <div>
                        <strong>
                          {authorName(c.author) || "Muallif nomi ko‘rsatilmagan"}
                        </strong>
                        {editing?.id === c.id ? <div className="so-comment-edit"><textarea maxLength={500} aria-label={tr("Izohni tahrirlash")} value={editing.text} disabled={busy} onChange={event => setEditing({ ...editing, text: event.target.value })}/><button type="button" disabled={busy || !editing.text.trim()} onClick={() => editComment(c)}>{tr('Saqlash')}</button><button type="button" disabled={busy} onClick={() => setEditing(null)}>{tr('Bekor qilish')}</button></div> : <p>{c.text}</p>}
                        {c.pinned === true && <span className="so-comment-pin" aria-label="Pinned comment">{({uz:'📌 Pinlangan izoh',ru:'📌 Закреплённый комментарий',en:'📌 Pinned comment'})[lang] || '📌 Pinlangan izoh'}</span>}
                        {c.mine && editing?.id !== c.id && <div className="so-comment-tools"><button type="button" disabled={busy} onClick={() => setEditing({ id: c.id, text: c.text })}>{tr('Tahrirlash')}</button><button type="button" disabled={busy} onClick={() => setEditing({ id: c.id, text: c.text, deleting: true })}>{tr('O‘chirish')}</button></div>}
                        {editing?.id === c.id && editing.deleting && <div className="so-comment-tools"><button type="button" disabled={busy} onClick={() => editComment(c, true)}>{tr('O‘chirishni tasdiqlash')}</button></div>}
                        <time dateTime={c.createdAt}>
                          {postTime(c.createdAt)}
                        </time>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : !commentsLoading ? (
                <p className="so-hint">
                  {knownCount(selected.commentCount) &&
                  selected.commentCount > 0
                    ? tr("Izohlar matni hali yuklanmagan.")
                    : tr("Hali izoh yo‘q.")}
                </p>
              ) : null}
              <form onSubmit={submitAction}>
                <label className="so-field">
                  {tr("Izohingiz")}
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
                    placeholder={tr("Fikringizni yozing…")}
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
                  disabled={busy || !drafts[selected.id]?.trim()}
                >
                  {busy ? tr("Yuborilmoqda…") : tr("Izoh yuborish")}
                </button>
              </form>
            </div>
          )}
          {modal?.type === "report" && (
            <form className="so-report" onSubmit={submitAction}>
              <p className="so-hint">
                {tr("Shikoyat sababini tanlang. U faqat server tasdiqlagandan keyin yuborilgan hisoblanadi.")}
              </p>
              <label className="so-field">
                {tr("Sabab")}
                <select
                  value={reason}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                >
                  <option value="">{tr("Tanlang")}</option>
                  <option value="spam">{tr("Spam")}</option>
                  <option value="inappropriate">{tr("Nomaqbul kontent")}</option>
                  <option value="misleading">{(socialReportReceiptsTextV177[lang] || socialReportReceiptsTextV177.uz).reasons.misleading}</option>
                  <option value="other">{tr("Boshqa sabab")}</option>
                </select>
              </label>
              <label className="so-field">
                {tr("Qo‘shimcha izoh")}
                <textarea
                  rows={3}
                  maxLength={500}
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
                {busy ? tr("Yuborilmoqda…") : tr("Shikoyat yuborish")}
              </button>
            </form>
          )}
          {modal?.type === "share" && selected?.author?.role === "barber" && <Link to={siteLocalePath(`/user/chat?barber=${selected.author.id}&post=${selected.id}`, lang)}>{({uz:"Postni chatda ulashish",ru:"Отправить пост в чат",en:"Share post in chat"})[lang]}</Link>}
          {modal?.type === "share" && (
            <label className="so-field">
              {tr("Havolani nusxalang")}
              <input
                readOnly
                value={manualShare}
                onFocus={(e) => e.target.select()}
              />
              <span className="so-hint">
                {tr("Brauzer avtomatik nusxalashga ruxsat bermadi. Havolani belgilab nusxalang.")}
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
        <Icon name="comb" size={30} />
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
      {action}
    </div>
  );
}
