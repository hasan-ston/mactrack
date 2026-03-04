import React from "react";
import { useScrollReveal } from "../lib/useScrollReveal";

interface ScrollRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Delay in ms before animation starts (stagger children) */
  delay?: number;
  /** Direction the element slides in from */
  direction?: "up" | "down" | "left" | "right" | "none";
  /** IntersectionObserver threshold (default 0.15) */
  threshold?: number;
}

/**
 * Wraps children in a div that fades + slides into view once scrolled to.
 * Uses CSS transitions so it's GPU-accelerated and buttery smooth.
 */
export function ScrollReveal({
  children,
  className = "",
  delay = 0,
  direction = "up",
  threshold = 0.15,
}: ScrollRevealProps) {
  const { ref, visible } = useScrollReveal<HTMLDivElement>(threshold);

  const translateMap = {
    up: "translateY(24px)",
    down: "translateY(-24px)",
    left: "translateX(24px)",
    right: "translateX(-24px)",
    none: "none",
  };

  return (
    <div
      ref={ref}
      className={className}
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : translateMap[direction],
        transition: `opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms, transform 0.6s cubic-bezier(0.16, 1, 0.3, 1) ${delay}ms`,
        willChange: "opacity, transform",
      }}
    >
      {children}
    </div>
  );
}
