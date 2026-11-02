// Read-only star rating: <Stars value={4.5} />
export default function Stars({ value, size = 14 }) {
  const full = Math.round(value);
  return (
    <span
      className="bx-stars"
      style={{ fontSize: size }}
      role="img"
      aria-label={`${value.toFixed(1)} / 5`}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= full ? "on" : ""}>
          ★
        </span>
      ))}
    </span>
  );
}
