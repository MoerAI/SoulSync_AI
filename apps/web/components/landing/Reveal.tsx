"use client";

import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from "react";

type RevealProps = HTMLAttributes<HTMLDivElement> & {
  children: ReactNode;
};

export function Reveal({ children, className, ...props }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) {
      return;
    }

    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setIsVisible(true);
      return;
    }

    setIsReady(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.12 }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const classes = ["reveal", isReady ? "reveal-ready" : "", isVisible ? "reveal-visible" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={classes} {...props}>
      {children}
    </div>
  );
}
