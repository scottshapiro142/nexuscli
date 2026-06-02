"use client";

/**
 * Nexus: Build Mode.
 *
 * Components below the Renderer can opt into a staggered reveal when the
 * page sets mode = "build". Each `<BuildItem>` becomes a beat in the
 * sequence: empty space, then the next piece appears, until the whole app
 * has assembled itself.
 *
 * The cursor overlay sits on top, moving toward the most recently revealed
 * BuildItem so the viewer sees "Iris is placing the next component."
 */

import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

type Mode = "instant" | "build";
const BuildModeContext = createContext<Mode>("instant");

export function BuildModeProvider({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  return <BuildModeContext.Provider value={mode}>{children}</BuildModeContext.Provider>;
}

export function BuildItem({
  children,
  style,
  className,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  const mode = useContext(BuildModeContext);
  if (mode === "instant") {
    return (
      <div style={style} className={className}>
        {children}
      </div>
    );
  }
  return (
    <motion.div
      data-build-item
      style={style}
      className={className}
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.97 },
        visible: {
          opacity: 1,
          y: 0,
          scale: 1,
          transition: { duration: 0.42, ease: [0.22, 0.84, 0.36, 1] },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

export function BuildStage({
  children,
  staggerSeconds = 0.38,
  delaySeconds = 0.2,
}: {
  children: React.ReactNode;
  staggerSeconds?: number;
  delaySeconds?: number;
}) {
  const mode = useContext(BuildModeContext);
  if (mode === "instant") return <>{children}</>;
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        visible: {
          transition: { staggerChildren: staggerSeconds, delayChildren: delaySeconds },
        },
      }}
    >
      {children}
    </motion.div>
  );
}

/**
 * The Iris cursor. Tracks the most recently revealed BuildItem in the
 * container. Auto-scrolls into view on mount so the user actually sees
 * the reveal. Hides itself once the animation settles.
 */
export function BuildCursor({ containerRef }: { containerRef: React.RefObject<HTMLDivElement | null> }) {
  const mode = useContext(BuildModeContext);
  const [target, setTarget] = useState<{ x: number; y: number } | null>(null);
  const [active, setActive] = useState(false);
  const rafRef = useRef<number | null>(null);

  // Activate cursor + scroll the renderer into view so the build is visible.
  useEffect(() => {
    let cancelled = false;

    const setCursorState = (nextActive: boolean, nextTarget: { x: number; y: number } | null) => {
      requestAnimationFrame(() => {
        if (cancelled) return;
        setActive(nextActive);
        setTarget(nextTarget);
      });
    };

    if (mode !== "build") {
      setCursorState(false, null);
      return () => {
        cancelled = true;
      };
    }
    setCursorState(true, null);

    // Scroll the container into the viewport top-third on mount, so the
    // assembly happens where the user is looking.
    const el = containerRef.current;
    if (el) {
      requestAnimationFrame(() => {
        if (cancelled) return;
        const r = el.getBoundingClientRect();
        if (r.top < 80 || r.top > window.innerHeight - 200) {
          window.scrollTo({
            top: window.scrollY + r.top - 120,
            behavior: "smooth",
          });
        }
      });
    }

    return () => {
      cancelled = true;
    };
  }, [mode, containerRef]);

  useLayoutEffect(() => {
    if (mode !== "build") return;
    const container = containerRef.current;
    if (!container) return;

    const moveToLatest = () => {
      const items = container.querySelectorAll<HTMLElement>("[data-build-item]");
      let chosen: HTMLElement | null = null;
      items.forEach((el) => {
        const opacity = Number(getComputedStyle(el).opacity);
        if (opacity > 0.15) chosen = el;
      });
      if (chosen) {
        const r = (chosen as HTMLElement).getBoundingClientRect();
        setTarget({
          x: r.left + r.width / 2,
          y: r.top + r.height / 2,
        });
      }
    };

    let polls = 0;
    const tick = () => {
      moveToLatest();
      polls += 1;
      if (polls < 180) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    // Hide cursor after the animation should be done.
    const hideTimer = setTimeout(() => setActive(false), 5800);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      clearTimeout(hideTimer);
    };
  }, [mode, containerRef]);

  if (!active) return null;

  // Default to centre of viewport before the first target is known, so the
  // cursor is always visible immediately.
  const fallbackX = typeof window !== "undefined" ? window.innerWidth / 2 : 400;
  const fallbackY = typeof window !== "undefined" ? window.innerHeight / 2 : 300;
  const tx = target ? target.x : fallbackX;
  const ty = target ? target.y : fallbackY;

  return (
    <motion.div
      data-iris-cursor
      initial={{ opacity: 0, scale: 0.4, x: fallbackX, y: fallbackY }}
      animate={{
        opacity: 1,
        scale: 1,
        x: tx,
        y: ty,
        transition: {
          type: "spring",
          stiffness: 80,
          damping: 14,
          mass: 0.7,
          opacity: { duration: 0.3 },
          scale: { duration: 0.3 },
        },
      }}
      style={{
        position: "fixed",
        top: -22,
        left: -22,
        width: 44,
        height: 44,
        pointerEvents: "none",
        zIndex: 2147483647,
      }}
    >
      <motion.span
        aria-hidden
        style={{
          position: "absolute",
          inset: -12,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(10,102,194,0.45) 0%, rgba(10,102,194,0) 70%)",
        }}
        animate={{
          scale: [1, 1.8, 1],
          opacity: [0.85, 0.15, 0.85],
        }}
        transition={{ repeat: Infinity, duration: 1.4, ease: "easeInOut" }}
      />
      <svg
        viewBox="0 0 24 24"
        width="44"
        height="44"
        fill="none"
        style={{ position: "relative", filter: "drop-shadow(0 4px 10px rgba(10,102,194,0.55))" }}
      >
        <path
          d="M5 3 L20 12 L12 13.5 L9 20 Z"
          fill="#0a66c2"
          stroke="white"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
      </svg>
    </motion.div>
  );
}
