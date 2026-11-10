import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Avatar } from '../../barber/data/avatars';
import UserAvatar from '../UserAvatar';
import HomeIcon from '../HomeIcon';
import { knownCount, postTime, profileUrl } from './model';

export default function PostCard({ post, services, allowFollow = true, liked, saved, followed, onLike, onSave, onFollow, onComments, onShare, onReport }) {
  const [failed, setFailed] = useState({});
  const author = post.author;
  const profile = profileUrl(author);
  const name = author.name || 'Muallif nomi ko‘rsatilmagan';
  const avatar = author.role === 'barber' ? <Avatar id={author.avatar} photo={author.avatarPhoto} name={name} size={44} /> : <UserAvatar id={author.avatar} photo={author.avatarPhoto} name={name} size={44} />;
  const likeCount = knownCount(post.likeCount) ? Math.max(0, post.likeCount + Number(liked) - Number(!!post.likedByMe)) : null;
  return <article className="so-post" id={`social-post-${post.id}`}>
    <header className="so-post-head">{profile ? <Link className="so-author" to={profile}>{avatar}<span><strong>{name}</strong><span>{author.role === 'barber' ? 'Barber · ' : author.role === 'salon' ? 'Salon · ' : ''}<time dateTime={post.createdAt}>{postTime(post.createdAt)}</time></span></span></Link> : <div className="so-author">{avatar}<strong>{name}</strong></div>}
      {allowFollow && author.id != null && ['barber','salon'].includes(author.role) && <button className="so-follow" type="button" aria-pressed={followed} onClick={onFollow}>{followed ? 'Obuna bo‘lingan' : 'Obuna bo‘lish'}</button>}
      <button className="so-icon-button" type="button" aria-label="Post haqida shikoyat" onClick={onReport}>···</button>
    </header>
    {post.media.length > 0 ? <div className={`so-media ${post.kind === 'beforeAfter' ? 'so-before-after' : ''}`} aria-label={post.kind === 'beforeAfter' ? 'Oldin va keyin' : 'Post media fayllari'}>{post.media.map((m,index) => <figure key={`${m.url}-${index}`}>{failed[index] ? <div className="so-media-error">Media faylni ochib bo‘lmadi.</div> : m.type === 'video' ? <video src={m.url} controls playsInline preload="metadata" onError={() => setFailed((p) => ({...p,[index]:true}))} /> : <img src={m.url} alt={m.alt || `${name} — ${index + 1}-rasm`} loading="lazy" onError={() => setFailed((p) => ({...p,[index]:true}))} />}{post.kind === 'beforeAfter' && <figcaption>{index === 0 ? 'Oldin' : 'Keyin'}</figcaption>}</figure>)}</div> : <div className="so-media-error">Postga media qo‘shilmagan.</div>}
    <div className="so-post-body"><div className="so-post-actions"><button className={`so-icon-button ${liked ? 'so-liked' : ''}`} type="button" aria-label="Like" aria-pressed={liked} onClick={onLike}><svg viewBox="0 0 24 24" fill={liked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" /></svg>{likeCount != null && <span>{likeCount}</span>}</button><button type="button" className="so-icon-button" aria-label="Izohlar" onClick={onComments}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M21 11a9 9 0 0 1-9 9 10 10 0 0 1-4-.9L3 21l1.4-4.8A9 9 0 1 1 21 11Z" /></svg>{knownCount(post.commentCount) && <span>{post.commentCount}</span>}</button><button type="button" className="so-icon-button" aria-label="Ulashish" onClick={onShare}><HomeIcon name="arrow" /></button><button type="button" className="so-icon-button so-save" aria-label={saved ? 'Saqlanganlardan olib tashlash' : 'Postni saqlash'} aria-pressed={saved} onClick={onSave}><svg viewBox="0 0 24 24" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 3h12v18l-6-4-6 4Z" /></svg></button></div>
      {post.caption && <p className="so-caption">{post.caption}</p>}
      <div className="so-service-links">{services.filter((s) => post.serviceIds.some((id) => String(id) === String(s.id))).map((s) => <Link key={s.id} to={`/user/explore?type=services&q=${encodeURIComponent(s.name)}`}>{s.name}<HomeIcon name="arrow" size={15} /></Link>)}</div>
      {['barber','salon'].includes(author.role) && profile && <Link className="so-provider-link" to={profile}>{author.role === 'barber' ? 'Barber profili va xizmatlari' : 'Salon profili va xizmatlari'}<HomeIcon name="arrow" size={17} /></Link>}
    </div>
  </article>;
}
