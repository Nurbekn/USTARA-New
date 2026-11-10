import './VerifiedBadge.css';

export default function VerifiedBadge({ verification }) {
  if (verification?.approvedByAdmin !== true) return null;
  return <span className="verified-badge" role="img" aria-label="Administrator tasdiqlagan usta" title="Administrator tasdiqlagan usta"><svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="m12 1.5 2.6 2 3.3-.1 1 3.1 2.7 1.9-1.1 3.1 1.1 3.1-2.7 1.9-1 3.1-3.3-.1-2.6 2-2.6-2-3.3.1-1-3.1-2.7-1.9 1.1-3.1-1.1-3.1 2.7-1.9 1-3.1 3.3.1Z" fill="currentColor" /><path d="m7.5 12 3 3 6-6" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg></span>;
}
