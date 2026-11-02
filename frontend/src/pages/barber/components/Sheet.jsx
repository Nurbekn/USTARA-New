import { useEffect } from "react";

// Bottom sheet on phones, centered dialog on large screens.
// Closes with the backdrop, the ✕ button, or the Escape key.
export default function Sheet({ open, title, onClose, children }) {
  useEffect(() => {
    if (!open) return;

    const onKey = (event) => event.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);

    // Stop the page behind the sheet from scrolling
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="bx-sheet-back" onClick={onClose}>
      <section
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
