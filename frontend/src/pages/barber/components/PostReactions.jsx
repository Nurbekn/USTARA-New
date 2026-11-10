import { useRef, useState } from "react";
import { addPostComment, togglePostLike, useBarber } from "../data/store";
import { Avatar } from "../../../components/Avatar";
import EmojiPicker from "./EmojiPicker";

export default function PostReactions({ postId }) {
  const { posts, profile } = useBarber();
  const post = posts.find((item) => item.id === postId);
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const input = useRef(null);
  if (!post) return null;
  const comments = Array.isArray(post.comments) ? post.comments : [];
  const addEmoji = (emoji) => {
    const start = input.current?.selectionStart ?? text.length;
    const end = input.current?.selectionEnd ?? text.length;
    const next = text.slice(0, start) + emoji + text.slice(end);
    if (next.length > 300) return;
    setText(next);
    requestAnimationFrame(() => { input.current?.focus(); input.current?.setSelectionRange(start + emoji.length, start + emoji.length); });
  };
  const submit = (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    if (!addPostComment(postId, text)) return setError("Izoh saqlanmadi. Brauzer xotirasini tekshiring va qayta urinib ko'ring.");
    setText("");
    setError("");
  };
  return <section className="bx-reactions" aria-label="Like va izohlar">
    <div className="bx-reaction-actions">
      <button type="button" className={`bx-social-button ${post.likedByMe ? "is-liked" : ""}`} aria-label={post.likedByMe ? "Likeni bekor qilish" : "Like bosish"} aria-pressed={!!post.likedByMe} onClick={() => {
        if (!togglePostLike(postId)) setError("Like saqlanmadi. Qayta urinib ko'ring.");
        else setError("");
      }}>
        <svg viewBox="0 0 24 24" fill={post.likedByMe ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>
      </button>
      <button type="button" className="bx-social-button" aria-label="Izoh yozish" onClick={() => { input.current?.focus(); input.current?.scrollIntoView({ block: "center", behavior: "smooth" }); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M21 11.5a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.8A9 9 0 1 1 21 11.5Z" /></svg>
      </button>
      <span aria-live="polite">{post.likeCount || 0} ta like · {comments.length} ta izoh</span>
    </div>
    <div className="bx-comments">
      <h3>Izohlar <span>{comments.length}</span></h3>
      {comments.length ? <ul>{comments.map((comment) => <li key={comment.id}>
        <Avatar id={comment.avatar} name={comment.author} size={30} />
        <div><strong>{comment.author}</strong><p>{comment.text}</p><time dateTime={comment.date}>{new Date(comment.date).toLocaleString("uz-UZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</time></div>
      </li>)}</ul> : <p className="bx-comment-empty">Birinchi izohni siz yozing ✨</p>}
    </div>
    <form className="bx-comment-form" onSubmit={submit}>
      <label className="bx-field" htmlFor={`comment-${postId}`}>Izoh yozing</label>
      <div className="bx-comment-compose">
        <Avatar photo={profile.avatarPhoto} id={profile.avatar} name={profile.firstName} size={32} />
        <textarea id={`comment-${postId}`} ref={input} rows={2} maxLength={300} value={text} placeholder="Fikringizni yozing…" onChange={(event) => setText(event.target.value)} />
      </div>
      <div className="bx-comment-tools"><EmojiPicker onSelect={addEmoji} /><small>{text.length}/300</small><button type="submit" disabled={!text.trim()}>Yuborish →</button></div>
    </form>
    {error && <p className="bx-error" role="alert">{error}</p>}
  </section>;
}
