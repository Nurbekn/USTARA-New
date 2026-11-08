import { Avatar } from "../data/avatars";
import { longDate } from "../data/format";
import PortfolioImage from "./PortfolioImage";
import PortfolioVideo from "./PortfolioVideo";
import PostReactions from "./PostReactions";

export default function PortfolioFeedPost({ post, profile, onOpen }) {
  const name = profile.username || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || "Siz";
  return <article className="bx-feed-post" aria-label={post.caption || (post.mediaType === "video" ? "Video post" : "Rasm post")}>
    <header className="bx-feed-author">
      <Avatar photo={profile.avatarPhoto} id={profile.avatar} name={name} size={36} />
      <div><strong>{name}</strong>{post.service && <small>{post.service}</small>}</div>
      <button type="button" className="bx-social-button" onClick={onOpen} aria-label="Postni ochish va boshqarish">⋯</button>
    </header>
    <div className="bx-feed-media">
      {post.mediaType === "video" ? <PortfolioVideo post={post} /> : <button type="button" className="bx-feed-photo" onClick={onOpen} aria-label="Rasmni kattalashtirish"><PortfolioImage src={post.image} alt={post.caption || "Soch olish ishi"} /></button>}
    </div>
    {post.caption && <p className="bx-feed-caption"><strong>{name}</strong> {post.caption}</p>}
    <PostReactions postId={post.id} />
    {post.date && <p className="bx-feed-date">{longDate(post.date)}</p>}
  </article>;
}
