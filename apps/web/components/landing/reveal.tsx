'use client';

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * `static` — server render, no JS yet, or reduced motion: everything is visible, nothing animates.
 * `idle`   — hydrated and still below the fold: entrance pieces are hidden, waiting.
 * `play`   — scrolled into view: entrance animations run once.
 */
type Phase = 'static' | 'idle' | 'play';

/**
 * Plays the `.hiw-*` entrance animations in globals.css the first time this block scrolls into
 * view. Content is only hidden after hydration, so a page without JS still shows everything.
 */
export function Reveal({
  className,
  style,
  children,
}: {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('static');

  useEffect(() => {
    const node = ref.current;
    if (!node || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setPhase('play');
          observer.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );
    setPhase('idle');
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} style={style} data-motion={phase}>
      {children}
    </div>
  );
}
