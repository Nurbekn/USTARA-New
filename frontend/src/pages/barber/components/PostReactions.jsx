import { useEffect, useRef, useState } from 'react';
import { formatDate } from '../../../utils/format';
import Icon from '../../../components/Icon';
import { loadSocialPost, loadPostComments, sendSocialComment, setSocialLike, setSocialSave, setSocialCommentPin, sortPinnedCommentsV167 } from '../../user/social/model';
import { patchPortfolioPost, useBarber } from '../data/store';
export default function PostReactions({ postId, caption, date, author, lang = "uz" }) {
  const { posts } = useBarber();
  const post = posts.find(item => item.id === postId);
  const [liked, setLiked] = useState(post?.likedByMe === true);
  const [saved, setSaved] = useState(post?.saved === true);
  const [likes, setLikes] = useState(post?.likeCount || 0);
  const [comments, setComments] = useState([]);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const lock = useRef(false);
  const input = useRef(null);
  useEffect(() => {
    const controller = new AbortController();
    Promise.all([loadSocialPost(postId, { signal: controller.signal }), loadPostComments(postId, { signal: controller.signal })]).then(([fresh, list]) => {
      if (controller.signal.aborted) return;
      setLiked(fresh.likedByMe === true);setSaved(fresh.saved === true);setLikes(fresh.likeCount || 0);setComments(sortPinnedCommentsV167(list));
      patchPortfolioPost(postId, { likedByMe: fresh.likedByMe, saved: fresh.saved, likeCount: fresh.likeCount, commentCount: fresh.commentCount });
    }).catch(e => { if (!controller.signal.aborted) setError(e.message); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [postId]);
  function applyReaction(result) {
    if (String(result?.postId) !== String(postId) || typeof result.liked !== 'boolean' || typeof result.saved !== 'boolean' || !Number.isInteger(result.likeCount)) throw Error('Server amalni tasdiqlamadi.');
    setLiked(result.liked);setSaved(result.saved);setLikes(result.likeCount);
    patchPortfolioPost(postId, { likedByMe: result.liked, saved: result.saved, likeCount: result.likeCount });
  }
  async function act(work) {
    if (lock.current || loading) return;
    lock.current = true;setBusy(true);setError('');
    try { await work(); } catch (e) { setError(e.message || 'Amal bajarilmadi.'); }
    finally { lock.current = false;setBusy(false); }
  }
  return <div className="bx-reactions">
    <div className="bx-reaction-actions">
      <button type="button" disabled={busy || loading} aria-label="Yoqtirish" aria-pressed={liked} onClick={() => act(async () => { applyReaction(await setSocialLike(postId, !liked)); })}><Icon name="heart" filled={liked}/></button>
      <button type="button" aria-label="Izoh yozish" onClick={() => input.current?.focus()}><Icon name="comment"/></button>
      <button type="button" disabled={busy || loading} aria-label="Postni saqlash" aria-pressed={saved} onClick={() => act(async () => { applyReaction(await setSocialSave(postId, !saved)); })}><Icon name="bookmark" filled={saved}/></button>
    </div>
    <strong aria-live="polite">{loading ? "Yuklanmoqda…" : `${likes} ta yoqtirish`}</strong>
    {caption && <p className="bx-caption"><strong>{author}</strong> {caption}</p>}
    {date && <time className="bx-muted" dateTime={date}>{formatDate(date)}</time>}
    {comments.length > 0 && <section className="bx-post-comments" aria-label="Izohlar">{sortPinnedCommentsV167(comments).map(c => <div key={c.id} className="bx-post-comment">
      {c.pinned === true && <span className="bx-comment-pinned">{({uz:'📌 Pinlangan izoh',ru:'📌 Закреплённый комментарий',en:'📌 Pinned comment'})[lang] || '📌 Pinlangan izoh'}</span>}
      <p><strong>{[c.author?.first_name,c.author?.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi'}</strong> {c.text}</p>
      <button type="button" className="bx-btn bx-btn-ghost" disabled={busy || loading}
        onClick={() => act(async () => {
          await setSocialCommentPin(postId, c.id, c.pinned !== true);
          // Re-read after server response; another tab may have changed the pin.
          setComments(sortPinnedCommentsV167(await loadPostComments(postId)));
        })}>
        {c.pinned === true
          ? ({uz:'Pinni olib tashlash',ru:'Открепить',en:'Unpin'})[lang]
          : ({uz:'Izohni pin qilish',ru:'Закрепить',en:'Pin comment'})[lang]}
      </button>
    </div>)}</section>}
    {error && <p className="bx-error" role="alert">{error}</p>}
    <form className="bx-comment-form" onSubmit={e => { e.preventDefault();if (!text.trim()) return;act(async () => { const result = await sendSocialComment(postId, { text: text.trim() });if (!result?.id) throw Error('Izoh tasdiqlanmadi.');setComments(items => [...items,result]);patchPortfolioPost(postId, { commentCount: result.commentCount });setText(''); }); }}>
      <input ref={input} className="bx-input" value={text} maxLength={500} onChange={e => setText(e.target.value)} placeholder="Izoh qo‘shing…" aria-label="Izoh"/>
      <button type="submit" className="bx-btn bx-btn-ghost" disabled={busy || loading || !text.trim()}>Yuborish</button>
    </form>
  </div>;
}
