// ==========================================================
// avatars.jsx — 12 built-in barber avatars (pure SVG, no files)
//
//   <Avatar id={3} size={48} />             -> chosen avatar
//   <Avatar name="Ali Valiyev" size={40} /> -> stable avatar from the name
//   <AvatarPicker value={id} onChange={fn} />
// ==========================================================

const SKINS = ["#f3d0b0", "#e3ae86", "#c68a62", "#9c6644"];

// style: short | fade | quiff | curly | doppi | cap | long | bald
// beard: none | stubble | mustache | full
const AVATARS = [
  { bg: "#1d4ed8", skin: 0, hair: "#1b1b1f", style: "fade", beard: "none" },
  { bg: "#0f766e", skin: 1, hair: "#2a1a12", style: "quiff", beard: "full" },
  { bg: "#7c3aed", skin: 2, hair: "#14110f", style: "doppi", beard: "stubble" },
  { bg: "#b45309", skin: 1, hair: "#3b2416", style: "short", beard: "mustache" },
  { bg: "#be123c", skin: 0, hair: "#c2762e", style: "curly", beard: "none" },
  { bg: "#0369a1", skin: 3, hair: "#0d0d0d", style: "fade", beard: "full", glasses: true },
  { bg: "#4d7c0f", skin: 2, hair: "#222", style: "cap", beard: "stubble", cap: "#1e293b" },
  { bg: "#334155", skin: 0, hair: "#9aa0ab", style: "short", beard: "full" },
  { bg: "#c2410c", skin: 1, hair: "#111", style: "bald", beard: "full" },
  { bg: "#6d28d9", skin: 2, hair: "#2b1a10", style: "long", beard: "none" },
  { bg: "#047857", skin: 3, hair: "#0d0d0d", style: "doppi", beard: "none", glasses: true },
  { bg: "#1e40af", skin: 0, hair: "#4a2c17", style: "quiff", beard: "mustache", glasses: true },
];

// Same name -> same avatar every time
function hashName(name) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

function Hair({ a }) {
  const c = a.hair;
  switch (a.style) {
    case "short":
      return <path d="M19 27C18 10 46 10 45 27 43 20 38 18 32 18 26 18 21 20 19 27Z" fill={c} />;
    case "fade":
      return (
        <>
          <path d="M19 26C19 11 45 11 45 26 43 21 40 19 32 19 24 19 21 21 19 26Z" fill={c} />
          <ellipse cx="20.5" cy="25" rx="1.6" ry="3.2" fill={c} opacity=".35" />
          <ellipse cx="43.5" cy="25" rx="1.6" ry="3.2" fill={c} opacity=".35" />
        </>
      );
    case "quiff":
      return (
        <>
          <path d="M18 28C15 8 49 6 46 28 44 20 40 15 33 15 27 15 21 19 18 28Z" fill={c} />
          <ellipse cx="36" cy="13.5" rx="9" ry="5" fill={c} />
        </>
      );
    case "curly":
      return (
        <g fill={c}>
          <circle cx="22" cy="19" r="6" />
          <circle cx="30" cy="14.5" r="7" />
          <circle cx="38" cy="14.5" r="7" />
          <circle cx="44" cy="20" r="6" />
          <circle cx="19" cy="26" r="4" />
          <circle cx="45" cy="26" r="4" />
        </g>
      );
    case "doppi": // Uzbek skullcap
      return (
        <>
          <path d="M19 25C19 11 45 11 45 25Z" fill="#0b0f1a" />
          <rect x="18.5" y="22" width="27" height="4" rx="2" fill="#0b0f1a" />
          <path d="M32 14.5 36 18.5 32 22.5 28 18.5Z" fill="none" stroke="#fff" strokeWidth="1" />
          <circle cx="32" cy="18.5" r="1" fill="#fff" />
          <circle cx="24" cy="21" r=".8" fill="#fff" />
          <circle cx="40" cy="21" r=".8" fill="#fff" />
        </>
      );
    case "cap":
      return (
        <>
          <path d="M19 25C19 11 45 11 45 25Z" fill={a.cap} />
          <path d="M19 24H52C52 27 46 28.5 40 27.5H19Z" fill={a.cap} />
        </>
      );
    case "long":
      return <path d="M19 27C18 10 46 10 45 27 40 17 27 17 19 27Z" fill={c} />;
    default:
      return null; // bald
  }
}

function Beard({ a }) {
  if (a.beard === "none") return null;
  const mustache = (
    <path d="M26 35C29 33 35 33 38 35 35 36.5 29 36.5 26 35Z" fill={a.hair} />
  );
  if (a.beard === "mustache") return mustache;
  return (
    <g opacity={a.beard === "stubble" ? 0.3 : 1}>
      <path d="M19 29C19 47 45 47 45 29 44 36 40 39 32 39 24 39 20 36 19 29Z" fill={a.hair} />
      {a.beard === "full" && mustache}
    </g>
  );
}

export function Avatar({ id, name = "", size = 40, className = "" }) {
  const index = id ? (id - 1) % AVATARS.length : hashName(name) % AVATARS.length;
  const a = AVATARS[index];
  const skin = SKINS[a.skin];

  return (
    <svg
      className={`bx-avatar ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={name || "Avatar"}
    >
      <rect width="64" height="64" fill={a.bg} />
      {/* long hair sits behind the head */}
      {a.style === "long" && (
        <path d="M17 28C15 12 49 12 47 28L48 48H16Z" fill={a.hair} />
      )}
      {/* shoulders (barber cape) */}
      <path d="M6 64C6 51 19 46 32 46 45 46 58 51 58 64Z" fill="#e2e8f0" />
      <path d="M26 46 32 54 38 46Z" fill={skin} />
      {/* neck + ears + head */}
      <rect x="27" y="37" width="10" height="11" rx="3" fill={skin} />
      <rect x="27" y="37" width="10" height="5" fill="#000" opacity=".12" />
      <circle cx="19" cy="29" r="3" fill={skin} />
      <circle cx="45" cy="29" r="3" fill={skin} />
      <ellipse cx="32" cy="28" rx="13" ry="15" fill={skin} />
      <Hair a={a} />
      {/* face */}
      <path d="M23.5 25.5h5M35.5 25.5h5" stroke={a.hair} strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="27" cy="29" r="1.3" fill="#1b1e27" />
      <circle cx="37" cy="29" r="1.3" fill="#1b1e27" />
      <path d="M32 29.5 31 33.5h2" fill="none" stroke="#000" strokeOpacity=".2" strokeWidth="1" strokeLinecap="round" />
      <Beard a={a} />
      <path d="M29 37.5Q32 40 35 37.5" fill="none" stroke="#8a4b3a" strokeWidth="1.3" strokeLinecap="round" />
      {a.glasses && (
        <g fill="none" stroke="#0f172a" strokeWidth="1.2">
          <circle cx="27" cy="29" r="4.3" />
          <circle cx="37" cy="29" r="4.3" />
          <path d="M31.3 29h1.4" />
        </g>
      )}
    </svg>
  );
}

export function AvatarPicker({ value, onChange, size = 64, className = "" }) {
  return (
    <div className={`bx-avatar-grid ${className}`.trim()} role="radiogroup" aria-label="Avatar tanlang">
      {AVATARS.map((_, i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={value === i + 1}
          className={`bx-avatar-option ${value === i + 1 ? "is-active" : ""}`}
          onClick={() => onChange(i + 1)}
        >
          <Avatar id={i + 1} size={size} name={`Avatar ${i + 1}`} />
        </button>
      ))}
    </div>
  );
}
