import { useEffect } from "react";

// Feature detection works across Android Chrome, iOS Safari and desktop.
export default function BrowserViewport() {
  useEffect(() => {
    const root = document.documentElement;
    const meta = document.querySelector('meta[name="viewport"]');
    const previousMeta = meta?.content;
    if (meta) meta.content = "width=device-width, initial-scale=1.0, viewport-fit=cover";
    const viewport = window.visualViewport;
    let frame;
    let fullHeight = window.innerHeight;
    let orientation = window.innerWidth > window.innerHeight;
    const update = () => {
      const focused = document.activeElement;
      const editing = focused?.matches('textarea, input:not([type="file"]):not([type="checkbox"]):not([type="radio"]), [contenteditable="true"]');
      const landscape = window.innerWidth > window.innerHeight;
      if (!editing && landscape !== orientation) {
        fullHeight = window.innerHeight;
        orientation = landscape;
      }
      if (!editing) fullHeight = window.innerHeight;
      const height = viewport?.height ?? window.innerHeight;
      // Pinch zoom is not a keyboard. Keep zoom available for accessibility.
      const keyboard = editing && (viewport?.scale ?? 1) < 1.1 && fullHeight - height > 150;
      root.style.setProperty("--visible-height", `${Math.round(height)}px`);
      root.style.setProperty("--visible-top", `${Math.round(viewport?.offsetTop ?? 0)}px`);
      root.dataset.keyboard = keyboard ? "open" : "closed";
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("resize", schedule);
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    document.addEventListener("focusin", schedule);
    document.addEventListener("focusout", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
      viewport?.removeEventListener("resize", schedule);
      viewport?.removeEventListener("scroll", schedule);
      document.removeEventListener("focusin", schedule);
      document.removeEventListener("focusout", schedule);
      root.style.removeProperty("--visible-height");
      root.style.removeProperty("--visible-top");
      delete root.dataset.keyboard;
      if (meta) meta.content = previousMeta;
    };
  }, []);
  return null;
}
