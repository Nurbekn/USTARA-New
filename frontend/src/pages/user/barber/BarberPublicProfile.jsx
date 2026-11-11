import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useOutletContext, useParams, useSearchParams } from "react-router-dom";
import { Avatar } from "../../../components/Avatar";
import VerifiedBadge from "../../../components/VerifiedBadge";
import ArrowIcon from "../../../components/ArrowIcon";
import Sheet from "../../../components/Sheet";
import Icon from "../../../components/Icon";
import InlineBooking from "./InlineBooking";
import { readDemoSocial, saveDemoSocial } from "./demoSocial";
import { sampleBarbers, sampleBarberDetails } from "../../home/sampleData";
import "./BarberPublicProfile.css";

const TABS = [{ id: 'posts', label: 'Postlar', icon: 'grid' }, { id: 'services', label: 'Xizmatlar', icon: 'socialScissors' }, { id: 'hours', label: 'Ish vaqti', icon: 'clock' }];
const postStyle = (post) => ({ backgroundImage: `url(${post.image})`, backgroundPosition: `${post.column * 50}% ${post.row * 50}%` });
const recordId = () => crypto.randomUUID();
const toggleItem = (items, id) => items.includes(id) ? items.filter((item) => item !== id) : [...items, id];

function ProfileContent({ barber, details, backTo, viewer, viewerId }) {
  const [tab, setTab] = useState('posts');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [activePostId, setActivePostId] = useState(null);
  const [chatOpen, setChatOpen] = useState(false);
  const [messagePressed, setMessagePressed] = useState(false);
  const messageTimer = useRef(null);
  const [comment, setComment] = useState('');
  const [message, setMessage] = useState('');
  const [notice, setNotice] = useState('');
  const [social, setSocial] = useState(() => readDemoSocial(viewerId, barber.id));
  const socialRef = useRef(social);
  const commentInput = useRef(null);
  const chatList = useRef(null);
  const activePost = details.posts.find((post) => post.id === activePostId);
  const viewerName = [viewer.firstName, viewer.lastName].filter(Boolean).join(' ') || viewer.name || 'Siz';
  const comments = social.comments.filter((item) => item.postId === activePostId);
  const verified = barber.verification?.approvedByAdmin === true;

  useEffect(() => () => window.clearTimeout(messageTimer.current), []);

  function openChat() {
    if (messageTimer.current) return;
    setMessagePressed(true);
    messageTimer.current = window.setTimeout(() => {
      messageTimer.current = null;
      setMessagePressed(false);
      setChatOpen(true);
    }, 350);
  }

  useEffect(() => {
    if (chatOpen && chatList.current) chatList.current.scrollTop = chatList.current.scrollHeight;
  }, [chatOpen, social.messages.length]);

  function updateSocial(patch) {
    const current = socialRef.current;
    const next = { ...current, ...(typeof patch === "function" ? patch(current) : patch) };
    try {
      saveDemoSocial(viewerId, barber.id, next);
      socialRef.current = next;
      setSocial(next);
      setNotice('');
      return true;
    } catch {
      setNotice('O‘zgarish saqlanmadi. Brauzer xotirasini tekshirib, qayta urinib ko‘ring.');
      return false;
    }
  }

  function addComment(event) {
    event.preventDefault();
    const text = comment.trim();
    if (!text || !activePost) return;
    if (updateSocial((current) => ({ comments: [...current.comments, { id: recordId(), postId: activePost.id, text, author: viewerName }] }))) setComment('');
  }

  function sendMessage(event) {
    event.preventDefault();
    const text = message.trim();
    if (!text) return;
    if (updateSocial((current) => ({ messages: [...current.messages, { id: recordId(), text, time: new Date().toISOString() }] }))) setMessage('');
  }

  return (
    <div className="bpv-page bpv-page--social">
      <div className="bpv-topbar"><Link to={backTo} aria-label="Ustalarga qaytish"><ArrowIcon direction="left" /></Link><h1><span>{barber.name}</span><VerifiedBadge verification={barber.verification} /></h1></div>
      <header className="bpv-profile-head">
        <div className="bpv-profile-row">
          <div className="bpv-profile-avatar"><Avatar photo={barber.avatarPhoto} name={barber.name} size={84} /></div>
          <dl className="bpv-stats"><div><dt>{details.posts.length}</dt><dd>post</dd></div><div><dt>{details.services.length}</dt><dd>xizmat</dd></div><div><dt className="bpv-rating-number"><Icon name="star" filled size={18} />{barber.rating.toFixed(1)}</dt><dd>reyting</dd></div></dl>
        </div>
        <div className="bpv-bio">
          <p className="bpv-category"><Icon name="socialScissors" size={16} />Sartarosh <span>· {details.experience} yil tajriba</span></p>
          <div className="bpv-bio-tools">
            {verified && (barber.verification.trusted || barber.verification.skilled) && <div className="bpv-credentials">{barber.verification.trusted && <span><Icon name="shield" size={17} />Ishonchli</span>}{barber.verification.skilled && <span><Icon name="award" size={17} />Mahoratli</span>}</div>}
            <button type="button" className="bpv-about-toggle" aria-expanded={aboutOpen} aria-controls="bpv-about" onClick={() => setAboutOpen((previous) => !previous)}><Icon name="info" size={16} />Haqida</button>
          </div>
          {aboutOpen && <p className="bpv-about-text" id="bpv-about">{details.about}</p>}
          <a className="bpv-salon" href={`https://www.openstreetmap.org/?mlat=${barber.location.lat}&mlon=${barber.location.lng}#map=17/${barber.location.lat}/${barber.location.lng}`} target="_blank" rel="noopener noreferrer" aria-label={`${barber.salonName}, ${barber.area} — xaritada ochish`}><Icon name="pin" size={17} /><span>{barber.salonName} · {barber.area}</span><Icon name="external" size={14} /></a>
        </div>
        <div className="bpv-actions">
          <button type="button" className={`bpv-follow${social.following ? ' is-following' : ''}`} aria-pressed={social.following} onClick={() => updateSocial((current) => ({ following: !current.following }))}><Icon name={social.following ? 'check' : 'follow'} size={18} />{social.following ? 'Kuzatilmoqda' : 'Kuzatish'}</button>
          <button type="button" className={`bpv-message-action${messagePressed ? " is-pressed" : ""}`} aria-busy={messagePressed} disabled={messagePressed} onClick={openChat}><Icon name="comment" size={19} />Xabar yozish</button>
        </div>
      </header>
      <div className="bpv-tabs" role="group" aria-label="Usta profili bo‘limlari">{TABS.map((item) => <button type="button" key={item.id} aria-pressed={tab === item.id} aria-controls="bpv-content" onClick={() => setTab(item.id)}><Icon name={item.icon} size={21} /><span>{item.label}</span></button>)}</div>
      <section className="bpv-content" id="bpv-content" aria-label={TABS.find((item) => item.id === tab).label}>
        {tab === 'posts' && <div className="bpv-posts">{details.posts.map((post) => <button type="button" className="bpv-post" key={post.id} onClick={() => { setActivePostId(post.id); setComment(''); }} aria-label={`${post.caption} Postni ochish`}><span className="bpv-post-photo" style={postStyle(post)} role="img" aria-label={post.caption} />{social.likes.includes(post.id) && <span className="bpv-post-liked" aria-hidden="true"><Icon name="heart" filled size={16} /></span>}</button>)}</div>}
        {tab === 'services' && <InlineBooking barber={barber} details={details} viewer={viewer} viewerId={viewerId} bookingsPath={backTo.startsWith('/demo') ? '/demo/reservations' : '/user/bookings'} />}
        {tab === 'hours' && <div className="bpv-schedule"><div className="bpv-section-title"><h2>Ish vaqti</h2><p>{barber.address} · Toshkent vaqti</p></div><dl className="bpv-hours">{details.hours.map((hours) => <div key={hours.day}><dt>{hours.day}</dt><dd className={hours.isOff ? 'is-off' : undefined}>{hours.isOff ? 'Dam olish kuni' : `${hours.start} – ${hours.end}`}</dd></div>)}</dl></div>}
      </section>
      <p className="bpv-notice" role="status">{notice}</p>

      <Sheet open={!!activePost} title="Post" onClose={() => setActivePostId(null)}>
        {activePost && <article className="bpv-feed-post"><div className="bpv-feed-author"><Avatar photo={barber.avatarPhoto} name={barber.name} size={32} /><div><strong>{barber.name}</strong><span>{barber.salonName}</span></div></div><div className="bpv-post-photo" style={postStyle(activePost)} role="img" aria-label={activePost.caption} /><div className="bpv-reactions"><button type="button" className={social.likes.includes(activePost.id) ? 'is-liked' : ''} aria-label={social.likes.includes(activePost.id) ? 'Yoqtirishni bekor qilish' : 'Postni yoqtirish'} aria-pressed={social.likes.includes(activePost.id)} onClick={() => updateSocial((current) => ({ likes: toggleItem(current.likes, activePost.id) }))}><Icon name="heart" filled={social.likes.includes(activePost.id)} /></button><button type="button" aria-label="Komment yozish" onClick={() => commentInput.current?.focus()}><Icon name="comment" /></button><button type="button" className="bpv-save-post" aria-label={social.saved.includes(activePost.id) ? 'Saqlashni bekor qilish' : 'Postni saqlash'} aria-pressed={social.saved.includes(activePost.id)} onClick={() => updateSocial((current) => ({ saved: toggleItem(current.saved, activePost.id) }))}><Icon name="bookmark" filled={social.saved.includes(activePost.id)} /></button></div><p className="bpv-feed-caption"><strong>{barber.name}</strong> {activePost.caption}</p>{social.likes.includes(activePost.id) && <p className="bpv-liked-label">Sizga yoqdi</p>}<div className="bpv-comments" aria-live="polite">{comments.map((item) => <div className="bpv-comment" key={item.id}><Avatar name={item.author || 'Siz'} size={28} /><p><strong>{item.author || 'Siz'}</strong> {item.text}</p></div>)}{comments.length === 0 && <p className="bpv-empty-comments">Birinchi kommentni yozing.</p>}</div><form className="bpv-comment-form" onSubmit={addComment}><label className="bpv-sr-only" htmlFor="bpv-comment-input">Komment yozish</label><input ref={commentInput} id="bpv-comment-input" placeholder="Komment yozing…" value={comment} maxLength={500} onChange={(event) => setComment(event.target.value)} /><button type="submit" disabled={!comment.trim()}>Yuborish</button></form><p className="bpv-notice" role="status">{notice}</p></article>}
      </Sheet>

      <Sheet open={chatOpen} title={barber.name} onClose={() => setChatOpen(false)}>
        <div className="bpv-chat"><p className="bpv-chat-note">Xabarlar shu qurilmada saqlanadi. Ustaga yuborilmaydi.</p><div className="bpv-chat-messages" ref={chatList} role="log" aria-label="Xabarlar">{social.messages.length === 0 ? <div className="bpv-chat-empty"><Avatar photo={barber.avatarPhoto} name={barber.name} size={64} /><strong>{barber.name}</strong><p>Suhbatni boshlash uchun xabar yozing.</p></div> : social.messages.map((item) => <div className="bpv-chat-bubble" key={item.id}><p>{item.text}</p>{item.time && <time dateTime={item.time}>{new Date(item.time).toLocaleTimeString('uz-UZ', { hour: '2-digit', minute: '2-digit' })}</time>}</div>)}</div><form className="bpv-message-form" onSubmit={sendMessage}><label className="bpv-sr-only" htmlFor="bpv-message-input">Xabar yozish</label><input id="bpv-message-input" value={message} maxLength={1000} placeholder="Xabar yozing…" onChange={(event) => setMessage(event.target.value)} /><button type="submit" disabled={!message.trim()} aria-label="Xabarni yuborish"><Icon name="send" size={20} /></button></form><p className="bpv-notice" role="status">{notice}</p></div>
      </Sheet>
    </div>
  );
}

export default function BarberPublicProfile() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const location = useLocation();
  const { profile: viewer } = useOutletContext();
  const base = location.pathname.startsWith('/demo') ? '/demo' : '/user';
  const backTo = location.state?.from?.startsWith(`${base}/`) || location.state?.from === base ? location.state.from : `${base}/explore?demo=1&type=barbers`;
  const barber = params.get('demo') === '1' ? sampleBarbers.find((item) => item.id === id) : null;
  const details = barber ? sampleBarberDetails[id] : null;
  if (!barber || !details) return <div className="bpv-page bpv-empty"><h1>Usta profili topilmadi</h1><p>Bu profil hali mavjud emas yoki serverdan yuklanmagan.</p><Link to={base}>Bosh sahifaga qaytish</Link></div>;
  const viewerId = viewer.phone || viewer.id || 'demo-viewer';
  return <ProfileContent key={`${id}:${viewerId}`} barber={barber} details={details} backTo={backTo} viewer={viewer} viewerId={viewerId} />;
}
