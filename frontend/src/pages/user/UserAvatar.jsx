const styles = [
  ["#8ebdf3", "#e9b794", "#252534", "short"],
  ["#7acbbd", "#ba805d", "#211d27", "curly"],
  ["#c3a4df", "#f0c9a8", "#654231", "long"],
  ["#edb28c", "#d89b72", "#29222a", "short"],
  ["#e7a5ba", "#f2c8a7", "#914b30", "curly"],
  ["#9bacc8", "#b57d59", "#202630", "short"],
  ["#c3cb8d", "#e6b18a", "#54443c", "long"],
  ["#acb5ed", "#e8b493", "#7f818b", "short"],
];

export default function UserAvatar({ id, photo, name = "", size = 64 }) {
  if (photo)
    return (
      <img
        className="up-user-avatar"
        src={photo}
        alt={name || "Profil rasmi"}
        width={size}
        height={size}
      />
    );
  const [background, skin, hair, style] =
    styles[(Math.max(1, Number(id) || 1) - 1) % styles.length];
  return (
    <svg
      className="up-user-avatar"
      width={size}
      height={size}
      viewBox="0 0 80 80"
      role="img"
      aria-label={name || "Foydalanuvchi avatari"}
    >
      <rect width="80" height="80" rx="40" fill={background} />
      <circle cx="64" cy="12" r="28" fill="#fff" opacity=".15" />
      {style === "long" && (
        <path d="M20 36Q17 9 40 10Q63 9 60 36L64 65H16Z" fill={hair} />
      )}
      <path
        d="M8 80Q9 59 32 57H48Q71 59 72 80"
        fill={id % 2 ? "#2a4564" : "#594d78"}
      />
      <path d="M33 51V61Q40 68 47 61V51" fill={skin} />
      <ellipse cx="40" cy="35" rx="19" ry="24" fill={skin} />
      <path
        d="M21 34Q16 9 39 9Q64 8 59 35L53 25Q38 27 29 20L25 35Z"
        fill={hair}
      />
      {style === "curly" && (
        <g fill={hair}>
          <circle cx="24" cy="20" r="8" />
          <circle cx="35" cy="14" r="9" />
          <circle cx="48" cy="14" r="9" />
          <circle cx="57" cy="23" r="7" />
        </g>
      )}
      <g fill="#2a2830">
        <circle cx="32" cy="36" r="1.8" />
        <circle cx="48" cy="36" r="1.8" />
      </g>
      <path
        d="M40 37 38 43H41"
        fill="none"
        stroke="#875c4c"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
      <path
        d="M34 49Q40 53 46 49"
        fill="none"
        stroke="#905748"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M25 65 34 71H46L55 65"
        fill="none"
        stroke="#fff"
        strokeOpacity=".25"
        strokeWidth="2"
      />
    </svg>
  );
}
