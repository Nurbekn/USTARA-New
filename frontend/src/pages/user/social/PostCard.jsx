import { authorName } from "../../../utils/profileName.js";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Avatar } from "../../../components/Avatar";
import Icon from "../../../components/Icon";
import Sheet from '../../../components/Sheet';
import MediaGallery from './MediaGallery';
import { resolveMediaUrl } from '../../../api/client.js';
import { knownCount, postTime, profileUrl } from "./model";
import { siteLocalePath } from "../../../utils/siteLocale.js";
import { socialQueueText } from "./socialQueueLocaleV149.js";

export default function PostCard({
  post,
  services,
  allowFollow = true,
  liked,
  saved,
  followed,
  onLike,
  onSave,
  onFollow,
  onComments,
  onShare,
  onReport,
  mutationsAvailable = false,
  lang = "uz",
}) {
  const tr = socialQueueText(lang);
  const [viewing, setViewing] = useState(null);
  useEffect(() => {
    if (viewing === null) return;
    const marker = `post-${post.id}-${Date.now()}`;
    window.history.pushState({ ...window.history.state, ustaraMedia: marker }, '');
    const back = () => setViewing(null);
    window.addEventListener('popstate', back);
    return () => { window.removeEventListener('popstate', back); if (window.history.state?.ustaraMedia === marker) window.history.back(); };
  }, [viewing, post.id]);
  const author = post.author;
  const profile = profileUrl(author);
  const name = authorName(author) || tr("Muallif nomi ko‘rsatilmagan");
  const avatar = (
    <Avatar
      className={author.role === "barber" ? "" : "up-user-avatar"}
      photo={resolveMediaUrl(author.avatarPhoto)}
      name={name}
      size={44}
    />
  );
  const likeCount = knownCount(post.likeCount) ? post.likeCount : null;
  return (
    <><article className="so-post" id={`social-post-${post.id}`}>
      <header className="so-post-head">
        {profile ? (
          <Link className="so-author" to={siteLocalePath(profile,lang)}>
            {avatar}
            <span>
              <strong>{name}</strong>
              <span>
                {author.role === "barber"
                  ? "Barber · "
                  : author.role === "salon"
                    ? "Salon · "
                    : ""}
                <time dateTime={post.createdAt}>
                  {postTime(post.createdAt)}
                </time>
              </span>
            </span>
          </Link>
        ) : (
          <div className="so-author">
            {avatar}
            <strong>{name}</strong>
          </div>
        )}
        {allowFollow &&
          author.id != null &&
          ["barber", "salon"].includes(author.role) && (
            <button
              className="so-follow"
              type="button"
              aria-pressed={followed}
              aria-label={followed ? tr("Kuzatuvni bekor qilish") : tr("Kuzatish")}
              disabled={!mutationsAvailable}
              onClick={onFollow}
            >
              {followed ? <Icon name="check" size={21}/> : "+ Kuzatish"}
            </button>
          )}
        <button
          className="so-icon-button"
          type="button"
          aria-label={tr("Post haqida shikoyat")}
          onClick={onReport}
        >
          ···
        </button>
      </header>
      <MediaGallery key={post.media.map(item => item.url).join(',')} media={post.media} name={name} lang={lang} onOpen={setViewing}/>
      <div className="so-post-body">
        <div className="so-post-actions">
          <button
            className={`so-icon-button ${liked ? "so-liked" : ""}`}
            type="button"
            aria-label={tr("Like")}
            aria-pressed={liked}
            disabled={!mutationsAvailable}
            onClick={onLike}
          >
            <Icon name="heart" viewBox="0 0 24 24" fill={liked?"currentColor":"none"} stroke="currentColor" strokeWidth="1.7" aria-hidden="true" />
            {likeCount != null && <span>{likeCount}</span>}
          </button>
          <button
            type="button"
            className="so-icon-button"
            aria-label={tr("Izohlar")}
            disabled={!mutationsAvailable}
            onClick={onComments}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.7"
              aria-hidden="true"
            >
              <path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.8A9 9 0 1 1 21 11Z" />
            </svg>
            {knownCount(post.commentCount) && <span>{post.commentCount}</span>}
          </button>
          <button
            type="button"
            className="so-icon-button"
            aria-label={tr("Ulashish")}
            onClick={onShare}
          >
            <Icon name="send" />
          </button>
          <button
            type="button"
            className="so-icon-button so-save"
            aria-label={
              saved ? tr("Saqlanganlardan olib tashlash") : tr("Postni saqlash")
            }
            aria-pressed={saved}
            disabled={!mutationsAvailable}
            onClick={onSave}
          >
            <Icon name="bookmark" viewBox="0 0 24 24" fill={saved?"currentColor":"none"} stroke="currentColor" strokeWidth="1.7" aria-hidden="true" />
          </button>
        </div>
        {post.caption && <p className="so-caption">{post.caption}</p>}
        {author.role === "barber" && Number.isSafeInteger(Number(author.id)) && Number(author.id)>0 && <Link className="so-provider-link" to={siteLocalePath(`/user/chat?barber=${author.id}&post=${post.id}`,lang)}>{({uz:"Chatda ulashish",ru:"Отправить в чат",en:"Share in chat"})[lang]||"Chatda ulashish"}</Link>}
        <div className="so-service-links">
          {services
            .filter((s) =>
              post.serviceIds.some((id) => String(id) === String(s.id)),
            )
            .map((s) => (
              <Link
                key={s.id}
                to={siteLocalePath(`/user/explore?type=services&q=${encodeURIComponent(s.name)}`,lang)}
              >
                {s.name}
                <Icon name="arrow" size={15} />
              </Link>
            ))}
        </div>
        {["barber", "salon"].includes(author.role) && profile && (
          <Link className="so-provider-link" to={siteLocalePath(profile,lang)}>
            {author.role === "barber"
              ? tr("Barber profili va xizmatlari")
              : tr("Salon profili va xizmatlari")}
            <Icon name="arrow" size={17} />
          </Link>
        )}
      </div>
    </article>
    <Sheet open={viewing !== null} title={tr("Post")} className="so-media-viewer so-dialog-scope" onClose={() => setViewing(null)}>
      {viewing !== null && <article className="so-post"><header className="so-post-head"><Link className="so-author" to={profile ? siteLocalePath(profile,lang) : '#'}>{avatar}<strong>{name}</strong></Link></header>
        <MediaGallery key={viewing} media={post.media} name={name} lang={lang} initialIndex={viewing}/>
        <div className="so-post-body"><div className="so-post-actions">
          <button type="button" className={`so-icon-button ${liked ? 'so-liked' : ''}`} aria-label={tr("Like")} aria-pressed={liked} disabled={!mutationsAvailable} onClick={onLike}><Icon name="heart" fill={liked ? 'currentColor' : 'none'}/><span>{likeCount}</span></button>
          <button type="button" className="so-icon-button" aria-label={tr("Izohlar")} onClick={() => { setViewing(null); onComments(); }}><Icon name="comment"/><span>{post.commentCount}</span></button>
          <button type="button" className="so-icon-button" aria-label={tr("Ulashish")} onClick={onShare}><Icon name="send"/></button>
          <button type="button" className="so-icon-button so-save" aria-label={tr("Postni saqlash")} aria-pressed={saved} disabled={!mutationsAvailable} onClick={onSave}><Icon name="bookmark" fill={saved ? 'currentColor' : 'none'}/></button>
        </div><p className="so-caption">{post.caption}</p></div>
      </article>}
    </Sheet></>
  );
}
