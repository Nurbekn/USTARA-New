import { useEffect, useRef } from "react";

// Attach the returned ref to a container and mark its sections with data-reveal.
// Unobserved content stays visible, including when motion or IO is unavailable.
export default function useReveal() {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof window.IntersectionObserver !== "function") return;

    const motion = window.matchMedia("(prefers-reduced-motion: no-preference)");
    const targets = Array.from(container.querySelectorAll("[data-reveal]"));
    let observer;
    let watchdog;

    const reset = () => {
      observer?.disconnect();
      window.clearTimeout(watchdog);
      targets.forEach((target) => {
        target.classList.remove("ui-reveal-pending", "ui-reveal-visible");
      });
    };

    const start = () => {
      reset();
      if (!motion.matches) return;

      // An initial observer report confirms delivery even for offscreen targets.
      const awaitingReport = new Set(targets);
      try {
        observer = new window.IntersectionObserver((entries) => {
          entries.forEach(({ target, isIntersecting }) => {
            awaitingReport.delete(target);
            if (!isIntersecting) return;
            target.classList.remove("ui-reveal-pending");
            target.classList.add("ui-reveal-visible");
            observer.unobserve(target);
          });
        }, { threshold: 0, rootMargin: "0px 0px -8px 0px" });

        targets.forEach((target) => {
          observer.observe(target);
          target.classList.add("ui-reveal-pending");
        });
        // Fail open if an observer exists but never delivers its initial report.
        watchdog = window.setTimeout(() => {
          awaitingReport.forEach((target) => {
            target.classList.remove("ui-reveal-pending");
            observer.unobserve(target);
          });
        }, 2000);
      } catch {
        reset();
      }
    };

    start();
    motion.addEventListener("change", start);
    return () => {
      motion.removeEventListener("change", start);
      reset();
    };
  }, []);

  return containerRef;
}
