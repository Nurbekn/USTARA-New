/** Social API boundary. Replace functions here with authenticated API requests.
 * Post: {id, author:{id,role:'barber'|'salon',name,avatar?,avatarPhoto?},
 * createdAt, caption, kind:'standard'|'beforeAfter', media:[{type:'image'|'video',url,alt?}],
 * serviceIds:[], category?, likeCount?, commentCount?, likedByMe?, saved?,
 * comments?:[{id,text,author:{name,avatarPhoto?},createdAt}]}.
 * Catalog: {posts:[],services:[{id,name,category?}],following:['barber:ID'],savedPostIds:[],
 * currentUserId?,discover:{trends:[{id,name}],barbers:[{id,name}],salons:[{id,name}]}}.
 * Like/save/follow overrides are temporary UI state. Production APIs must authorize
 * every mutation; notifications are emitted by the backend after accepted actions.
 * Publish returns a complete server post; comment returns a complete server comment.
 */
export async function loadSocial({ signal } = {}) {
  signal?.throwIfAborted();
  return { posts: [], services: [], following: [], savedPostIds: [], discover: { trends: [], barbers: [], salons: [] } };
}
export async function publishSocialPost() { throw new Error('Post joylash xizmati hali ulanmagan. Tanlangan fayllar serverga yuborilmadi.'); }
export async function sendSocialComment() { throw new Error('Izoh yuborish xizmati hali ulanmagan. Matningiz qoralamada qoladi.'); }
export async function reportSocialPost() { throw new Error('Shikoyat yuborish xizmati hali ulanmagan.'); }
export const TABS = { feed: 'Feed', discover: 'Discover', following: 'Following', saved: 'Saved' };
export const authorKey = (author) => `${author?.role || 'customer'}:${author?.id ?? ''}`;
export const knownCount = (value) => Number.isSafeInteger(value) && value >= 0;
export function normalizePost(p) {
  if (!p || p.id == null || !p.author || !['barber','salon'].includes(p.author.role) || !Array.isArray(p.media)) throw new Error('Invalid post');
  return { ...p, comments: Array.isArray(p.comments) ? p.comments.filter((c) => c && c.id != null && typeof c.text === 'string') : undefined, media: p.media.filter((m) => m && ['image','video'].includes(m.type) && typeof m.url === 'string'), serviceIds: Array.isArray(p.serviceIds) ? p.serviceIds : [] };
}
export function normalizeSocial(value) {
  if (!value || !Array.isArray(value.posts) || !Array.isArray(value.services)) throw new Error('Invalid social response');
  const list = (items) => Array.isArray(items) ? items.filter((v) => v && v.id != null && typeof v.name === 'string') : [];
  // Customer Social is a provider showcase; personal customer posts are excluded.
  const posts = value.posts.filter((p) => p?.author?.role !== 'customer').map(normalizePost).filter((p) => ['barber','salon'].includes(p.author.role));
  if (new Set(posts.map((p) => String(p.id))).size !== posts.length) throw new Error('Duplicate posts');
  return { ...value, posts, services:list(value.services), following: Array.isArray(value.following) ? value.following : [], savedPostIds: Array.isArray(value.savedPostIds) ? value.savedPostIds : [], discover: { trends:list(value.discover?.trends),barbers:list(value.discover?.barbers),salons:list(value.discover?.salons) } };
}
export const emptySocial = { posts: [], services: [], following: [], savedPostIds: [], discover: { trends: [], barbers: [], salons: [] } };
export function searchPosts(posts, services, query, category = '') {
  const clean = (v) => String(v || '').toLocaleLowerCase().replace(/[‘’ʻʼ`]/g,"'");
  const q = clean(query).trim();
  return posts.filter((p) => {
    const attached = services.filter((s) => p.serviceIds.some((id) => String(id) === String(s.id)));
    return (!category || p.category === category || attached.some((s) => s.category === category)) && (!q || clean(`${p.caption || ''} ${p.author.name || ''} ${attached.map((s) => s.name).join(' ')}`).includes(q));
  });
}
export function profileUrl(author) {
  if (author?.id == null) return null;
  if (['barber','salon'].includes(author.role)) return `/user/explore?type=${author.role === 'barber' ? 'barbers' : 'salons'}&profile=${encodeURIComponent(author.id)}`;
  return null;
}
export function postTime(value) {
  const n = Date.parse(value);
  return Number.isFinite(n) ? new Intl.DateTimeFormat('uz-UZ',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}).format(n) : 'Vaqt ko‘rsatilmagan';
}
export function shareUrl(id) { return `${location.origin}${import.meta.env.BASE_URL}user/social?post=${encodeURIComponent(id)}`; }
