import { authorName, profileName } from "../../../utils/profileName.js";
import { formatDate } from "../../../utils/format.js";

async function socialApi() {
  const [{ getSession }, { request }] = await Promise.all([
    import("../../auth/utils/session.js"), import("../../../api/client.js"),
  ]);
  const session = getSession();
  if (!session?.token || !["customer", "barber"].includes(session.role)) {
    throw Object.assign(new Error("Ijtimoiy ilhom uchun tizimga kiring."), { status: 401 });
  }
  return { session, request };
}

/** Social API boundary. Replace functions here with authenticated API requests.
 * Post: {id, author:{id,role:'barber'|'salon',first_name?,last_name?,name? (salon only),avatar?,avatarPhoto?},
 * createdAt, caption, kind:'standard'|'beforeAfter', media:[{type:'image'|'video',url,alt?}],
 * serviceIds:[], category?, likeCount?, commentCount?, likedByMe?, saved?,
 * comments?:[{id,text,author:{first_name,last_name,avatarPhoto?},createdAt}]}.
 * Catalog: {posts:[],services:[{id,name,category?}],following:['barber:ID'],savedPostIds:[],
 * currentUserId?,discover:{trends:[{id,name}],barbers:[{id,first_name,last_name}],salons:[{id,name}]}}.
 * Like/save/follow overrides are temporary UI state. Production APIs must authorize
 * every mutation; notifications are emitted by the backend after accepted actions.
 * Publish returns a complete server post; comment returns a complete server comment.
 */
export async function loadSocial({ signal } = {}) {
  signal?.throwIfAborted();
  const { session, request } = await socialApi();
  return request("GET", "/api/social", { token: session.token, signal });
}
async function uploadMedia(file, request, token, signal) {
  if (!(file instanceof Blob) || file.size < 1 || file.size > 100 * 1024 * 1024) {
    throw new Error("Media fayli 100 MB dan oshmasin.");
  }
  const result = await request("POST", "/api/media", { token, signal, body: file, rawBody: true });
  if (!Number.isSafeInteger(result?.id) || !["image", "video"].includes(result.type)) {
    throw new Error("Server media faylni qabul qilganini tasdiqlamadi.");
  }
  return result;
}
export async function publishSocialPost({ files, caption, kind, serviceId }, { signal } = {}) {
  if (!Array.isArray(files) || files.length < 1 || files.length > 6) throw new Error("1 dan 6 tagacha rasm tanlang.");
  const { session, request } = await socialApi();
  const media = [];
  for (const file of files) media.push(await uploadMedia(file, request, session.token, signal));
  const result = await request("POST", "/api/social/posts", {
    token: session.token, signal,
    body: { caption, kind, serviceId, mediaIds: media.map((item) => item.id) },
  });
  return result?.post;
}
// Gemini ishlovi faqat sartaroshning o‘zi yuborgan qisqa izoh bilan amalga oshadi.
// Rasm, mijoz ma'lumoti, bron va telefon raqami AI xizmatiga uzatilmaydi.
export async function suggestSocialCaption({ description, style = "professional" }, { signal } = {}) {
  const { session, request } = await socialApi();
  if (session.role !== "barber") throw new Error("Bu yordamchi faqat sartaroshlar uchun.");
  const result = await request("POST", "/api/ai/post-caption", {
    token: session.token, signal, body: { description, style },
  });
  if (typeof result?.caption !== "string" || !result.caption.trim())
    throw new Error("Tavsif olinmadi. Qayta urinib ko‘ring.");
  return result.caption;
}

export async function loadSocialPost(postId, { signal } = {}) {
  const { session, request } = await socialApi();
  const result = await request("GET", `/api/social/posts/${encodeURIComponent(postId)}`, { token: session.token, signal });
  if (!result?.post || String(result.post.id) !== String(postId)) throw new Error("Postni serverdan olib bo‘lmadi.");
  return result.post;
}
export async function loadPostComments(postId, { signal } = {}) {
  const { session, request } = await socialApi();
  const comments = await request("GET", `/api/social/posts/${encodeURIComponent(postId)}/comments`, { token: session.token, signal });
  if (!Array.isArray(comments)) throw new Error("Server izohlarni noto‘g‘ri qaytardi.");
  return comments.filter(comment => comment && comment.id != null && typeof comment.text === "string" && comment.author);
}
export async function sendSocialComment(postId, { text }, { signal } = {}) {
  const { session, request } = await socialApi();
  return request("POST", `/api/social/posts/${encodeURIComponent(postId)}/comments`, {
    token: session.token, signal, body: { text },
  });
}
export async function changeSocialComment(postId, commentId, text, { signal } = {}) {
  const { session, request } = await socialApi();
  return request(text === null ? 'DELETE' : 'PUT', `/api/social/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`, {
    token: session.token, signal, ...(text === null ? {} : { body: { text } }),
  });
}
// #82: the API, never the UI, is authoritative for post ownership and pinned state.
export async function setSocialCommentPin(postId, commentId, pinned, { signal } = {}) {
  if (!Number.isSafeInteger(Number(postId)) || Number(postId) < 1 ||
      !Number.isSafeInteger(Number(commentId)) || Number(commentId) < 1 ||
      typeof pinned !== "boolean") throw new Error("Pin so‘rovi noto‘g‘ri.");
  const {session,request}=await socialApi();
  if (session.role !== 'barber') throw new Error("Faqat post egasi izohni pin qila oladi.");
  const response=await request('PUT', `/api/social/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}/pin`,
    {token:session.token,signal,body:{pinned}});
  if (Number(response?.postId)!==Number(postId) || Number(response?.commentId)!==Number(commentId) || response?.pinned!==pinned)
    throw new Error('Pin o‘zgarishi serverdan tasdiqlanmadi. Izohlarni qayta yuklang.');
  return response;
}
export function sortPinnedCommentsV167(comments) {
  return [...(Array.isArray(comments)?comments:[])].sort((a,b)=>Number(b?.pinned===true)-Number(a?.pinned===true));
}
// #151: fetch only this authenticated account's recent report receipts.
export async function loadMySocialReportsV177({ signal } = {}) {
  const { session, request } = await socialApi();
  return request("GET", "/api/social/my-reports", { token: session.token, signal });
}
export async function reportSocialPost(postId, body, { signal } = {}) {
  const { session, request } = await socialApi();
  return request("POST", `/api/social/posts/${encodeURIComponent(postId)}/report`, {
    token: session.token, signal, body,
  });
}
export async function setSocialLike(postId, liked, { signal } = {}) {
  const { session, request } = await socialApi();
  return request("PUT", `/api/social/posts/${encodeURIComponent(postId)}/like`, {
    token: session.token, signal, body: { liked },
  });
}
export async function setSocialSave(postId, saved, { signal } = {}) {
  const { session, request } = await socialApi();
  return request("PUT", `/api/social/posts/${encodeURIComponent(postId)}/save`, {
    token: session.token, signal, body: { saved },
  });
}
export async function setSocialFollow(barberId, following, { signal } = {}) {
  const { session, request } = await socialApi();
  return request("PUT", `/api/social/barbers/${encodeURIComponent(barberId)}/follow`, {
    token: session.token, signal, body: { following },
  });
}
export const TABS = {
  feed: "Ilhom",
  following: "Kuzatilgan",
  saved: "Saqlangan",
};
export const authorKey = (author) =>
  `${author?.role || "customer"}:${author?.id ?? ""}`;
export const knownCount = (value) => Number.isSafeInteger(value) && value >= 0;
export function normalizePost(p) {
  if (
    !p ||
    p.id == null ||
    !p.author ||
    !["barber", "salon"].includes(p.author.role) ||
    !Array.isArray(p.media)
  )
    throw new Error("Invalid post");
  return {
    ...p,
    comments: Array.isArray(p.comments)
      ? p.comments.filter(
          (c) => c && c.id != null && typeof c.text === "string",
        )
      : undefined,
    media: p.media.filter(
      (m) =>
        m && ["image", "video"].includes(m.type) && typeof m.url === "string",
    ),
    serviceIds: Array.isArray(p.serviceIds) ? p.serviceIds : [],
  };
}
export function normalizeSocial(value) {
  if (!value || !Array.isArray(value.posts) || !Array.isArray(value.services))
    throw new Error("Invalid social response");
  const list = (items, label = (item) => item.name) =>
    Array.isArray(items)
      ? items.filter((v) => v && v.id != null && typeof label(v) === "string" && label(v))
      : [];
  // Customer Social is a provider showcase; personal customer posts are excluded.
  const posts = value.posts
    .filter((p) => p?.author?.role !== "customer")
    .map(normalizePost)
    .filter((p) => ["barber", "salon"].includes(p.author.role));
  if (new Set(posts.map((p) => String(p.id))).size !== posts.length)
    throw new Error("Duplicate posts");
  return {
    ...value,
    posts,
    services: list(value.services),
    following: Array.isArray(value.following) ? value.following : [],
    savedPostIds: Array.isArray(value.savedPostIds) ? value.savedPostIds : [],
    discover: {
      trends: list(value.discover?.trends),
      barbers: list(value.discover?.barbers, profileName),
      salons: list(value.discover?.salons),
    },
  };
}
export const emptySocial = {
  posts: [],
  services: [],
  following: [],
  savedPostIds: [],
  discover: { trends: [], barbers: [], salons: [] },
};
export function searchPosts(posts, services, query, category = "") {
  const clean = (v) =>
    String(v || "")
      .toLocaleLowerCase()
      .replace(/[‘’ʻʼ`]/g, "'");
  const q = clean(query).trim();
  return posts.filter((p) => {
    const attached = services.filter((s) =>
      p.serviceIds.some((id) => String(id) === String(s.id)),
    );
    return (
      (!category ||
        p.category === category ||
        attached.some((s) => s.category === category)) &&
      (!q ||
        clean(
          `${p.caption || ""} ${authorName(p.author) || ""} ${attached.map((s) => s.name).join(" ")}`,
        ).includes(q))
    );
  });
}
export function profileUrl(author) {
  if (author?.id == null) return null;
  if (["barber", "salon"].includes(author.role))
    return `/user/explore?type=${author.role === "barber" ? "barbers" : "salons"}&profile=${encodeURIComponent(author.id)}`;
  return null;
}
export function postTime(value) {
  return Number.isFinite(Date.parse(value)) ? formatDate(value) : "Vaqt ko‘rsatilmagan";
}
export function shareUrl(id) {
  return `${location.origin}${import.meta.env.BASE_URL}user/social?post=${encodeURIComponent(id)}`;
}
