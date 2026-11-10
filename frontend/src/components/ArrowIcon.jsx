export default function ArrowIcon({ direction = "right", variant = "arrow" }) {
  const path = variant === "chevron"
    ? direction === "left" ? "m15 5-7 7 7 7" : "m9 5 7 7-7 7"
    : direction === "left" ? "M20 12H4m7-7-7 7 7 7" : "M4 12h16m-7-7 7 7-7 7";
  return (
    <svg className="ui-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={path} />
    </svg>
  );
}
