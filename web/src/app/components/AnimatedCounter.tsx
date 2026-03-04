import { useEffect, useRef, useState } from "react";

interface AnimatedCounterProps {
  /** The target number to count up to */
  end: number;
  /** Duration of the animation in ms (default 1800) */
  duration?: number;
  /** Suffix appended after the number, e.g. "+" */
  suffix?: string;
  /** Prefix prepended before the number, e.g. "$" */
  prefix?: string;
  /** Whether the counter has been triggered (tie to scroll visibility) */
  active: boolean;
  /** Optional className for the outer span */
  className?: string;
}

/**
 * A number that animates from 0 → `end` using an ease-out curve.
 * Only starts when `active` is true (so you can tie it to a scroll reveal).
 */
export function AnimatedCounter({
  end,
  duration = 1800,
  suffix = "",
  prefix = "",
  active,
  className,
}: AnimatedCounterProps) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (!active) return;

    // ease-out cubic
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = ease(progress);

      setDisplay(Math.round(easedProgress * end));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [active, end, duration]);

  return (
    <span className={className}>
      {prefix}
      {active ? display.toLocaleString() : "0"}
      {suffix}
    </span>
  );
}
