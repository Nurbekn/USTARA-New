import "./Avatar.css";

export function Avatar({ photo, name = '', size = 40, className = '' }) {
  const classes = `bx-avatar ${className}`.trim();
  if (photo) {
    return <img className={classes} src={photo} alt={name || 'Profil rasmi'} width={size} height={size} />;
  }

  const initial = Array.from(name.trim())[0]?.toLocaleUpperCase('uz') || 'U';
  return (
    <svg className={classes} width={size} height={size} viewBox="0 0 64 64" role="img" aria-label={name || 'Profil rasmi qo‘shilmagan'}>
      <circle cx="32" cy="32" r="32" fill="var(--profile-avatar-bg, #55a5eb)" />
      <text x="32" y="32" dy=".35em" textAnchor="middle" fill="#fff" fontFamily="var(--font-ui, sans-serif)" fontSize="27" fontWeight="400">{initial}</text>
    </svg>
  );
}
