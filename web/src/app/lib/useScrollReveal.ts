import { useEffect, useRef, useState } from "react";

/**
 * Returns a ref and a boolean `visible` that flips to `true` once the
 * element scrolls into view (using IntersectionObserver).
 *
 * Once triggered, the observer disconnects so the animation only plays once.
 *
 * @param threshold – fraction of the element that must be visible (0-1).
 *                    Default 0.15 works well for most section heights.
 * @param rootMargin – extra margin around the viewport, e.g. "0px 0px -60px 0px"
 *                     to trigger slightly before/after entering.
 */
export function useScrollReveal<T extends HTMLElement = HTMLDivElement>(
  threshold = 0.15,
  rootMargin = "0px 0px -40px 0px",
) {
  const ref = useRef<T>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold, rootMargin },
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [threshold, rootMargin]);

  return { ref, visible };
}
