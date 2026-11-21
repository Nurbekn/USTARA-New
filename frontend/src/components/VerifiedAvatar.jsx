import { Avatar } from './Avatar';
import './VerifiedAvatar.css';
export default function VerifiedAvatar({ verified = false, size = 40, ...props }) {
  return <span className="va-wrap" style={{ width: size, height: size, '--va-badge': `${Math.max(15, Math.round(size * .28))}px` }}>
    <Avatar {...props} size={size}/>
    {verified && <span className="va-badge" role="img" aria-label="Tasdiqlangan profil"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 4 4L19 6" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/></svg></span>}
  </span>;
}
