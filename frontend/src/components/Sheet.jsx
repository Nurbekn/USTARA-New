import "./overlays.css";
import { useEffect, useEffectEvent, useRef } from "react";

// Bottom sheet on phones, centered dialog on large screens.
// Closes with the backdrop, the ✕ button, or the Escape key.
export default function Sheet({ open, title, onClose, children, compact = false }) {
  const dialog = useRef(null);
  const close = useEffectEvent(() => onClose());
  useEffect(() => {
    if (!open) return;

    const previousFocus = document.activeElement;
    const scrollY = window.scrollY;
    const previous = {
      overflow: document.body.style.overflow,
      position: document.body.style.position,
      top: document.body.style.top,
      width: document.body.style.width,
    };
    // iOS Safari needs a fixed body to keep the page behind a dialog still.
    document.body.style.overflow = "hidden";
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    const onKey = (event) => {
      if (event.key === "Escape") close();
      if (event.key !== "Tab") return;
      const controls = [...dialog.current.querySelectorAll('button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled)')].filter((element) => element.getClientRects().length);
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    dialog.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      Object.assign(document.body.style, previous);
      const behavior = document.documentElement.style.scrollBehavior;
      document.documentElement.style.scrollBehavior = "auto";
      window.scrollTo(0, scrollY);
      document.documentElement.style.scrollBehavior = behavior;
      previousFocus?.focus({ preventScroll: true });
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className={`bx-sheet-back${compact ? " bx-sheet-back--compact" : ""}`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        ref={dialog}
        tabIndex={-1}
        className="bx-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="bx-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="bx-icon-btn" onClick={onClose} aria-label="Yopish">
            ✕
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
