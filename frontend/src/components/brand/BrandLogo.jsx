import wordmark from "./wordmark.json";
import selectedMark from "./ustara.svg";
import concepts from "./concepts.json";
import "./BrandLogo.css";


export function BrandSymbol({ variant = "facet", size = 32, compact = false, className = "", ...props }) {
  if (variant === "facet") {
    return (
      <span
        className={`brand-symbol brand-symbol--approved ${className}`}
        style={{ width: size, height: size, "--brand-mark": `url("${selectedMark}")` }}
        aria-hidden="true"
        {...props}
      >
        <img src={selectedMark} width={size} height={size} alt="" />
      </span>
    );
  }
  const concept = concepts.find((item) => item.id === variant) || concepts[0];
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} fill="currentColor" aria-hidden="true" className={`brand-symbol ${className}`} {...props}>
      {(compact && concept.faviconPaths ? concept.faviconPaths : concept.paths).map((path) => <path key={path} d={path} fillRule="evenodd" />)}
    </svg>
  );
}

export function BrandWordmark() {
  return (
    <svg className="brand-wordmark" viewBox={wordmark.viewBox} width="112" height="15" role="img" aria-label="USTARA">
      <g fill="none" stroke="currentColor" strokeWidth="8" strokeLinejoin="round">
        {wordmark.paths.map((path) => <path key={path} d={path} />)}
      </g>
      <circle {...wordmark.dot} fill="#00B9FF" />
    </svg>
  );
}

export default function BrandLogo({ variant = "facet", className = "" }) {
  return <span className={`brand-lockup ${className}`}><BrandSymbol variant={variant} /><BrandWordmark /></span>;
}
