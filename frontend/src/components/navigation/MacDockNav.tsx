import React, { useRef, useState, useEffect, useCallback } from 'react';
import { NavLink } from 'react-router-dom';

export interface MacDockNavItem {
  to: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
  end?: boolean;
}

interface MacDockNavProps {
  items: MacDockNavItem[];
}

export const MacDockNav: React.FC<MacDockNavProps> = ({ items }) => {
  const navRef = useRef<HTMLElement>(null);
  const [mouseX, setMouseX] = useState<number | null>(null);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const [isReducedMotion, setIsReducedMotion] = useState(false);
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([]);
  const rafId = useRef<number | null>(null);

  // Detect user preference for reduced motion
  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    setIsReducedMotion(mediaQuery.matches);
    const handler = (e: MediaQueryListEvent) => setIsReducedMotion(e.matches);
    mediaQuery.addEventListener('change', handler);
    return () => mediaQuery.removeEventListener('change', handler);
  }, []);

  // Continuous 60 FPS mouse coordinate tracking across the Dock
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLElement>) => {
      if (isReducedMotion) return;
      const nav = navRef.current;
      if (!nav) return;
      const rect = nav.getBoundingClientRect();
      const relativeX = e.clientX - rect.left;

      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        setMouseX(relativeX);
      });
    },
    [isReducedMotion]
  );

  const handleMouseLeave = useCallback(() => {
    if (rafId.current) cancelAnimationFrame(rafId.current);
    setMouseX(null);
    setFocusedIndex(null);
  }, []);

  return (
    <nav
      ref={navRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      aria-label="Plant Navigation"
      style={{
        transform: 'translateZ(0)',
        WebkitTransform: 'translateZ(0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
      className="w-[433px] h-[34px] flex items-center justify-between px-3.5 rounded-full bg-[rgba(52,72,94,0.48)] backdrop-blur-md border border-[rgba(210,226,240,0.22)] shadow-[0_4px_20px_rgba(15,30,45,0.16)] select-none relative overflow-visible"
    >
      {/* ── Navigation Icons (macOS Dock Magnification Wave) ── */}
      {items.map((item, index) => {
        let scale = 1.0;
        let translateY = 0;
        const maxDistance = 90; // Influence radius in pixels for wave effect

        if (!isReducedMotion) {
          if (mouseX !== null) {
            // Deterministic sub-pixel icon center calculation matching flex justify-between
            // (14px padding + 14px half-width = 28px start; 433px - 56px = 377px span)
            const itemCenterX =
              items.length > 1
                ? 28 + (index * (433 - 56)) / (items.length - 1)
                : 433 / 2;
            const distance = Math.abs(mouseX - itemCenterX);

            if (distance < maxDistance) {
              // Cosine bell curve for authentic Apple macOS Dock magnification
              const factor = Math.cos((distance / maxDistance) * (Math.PI / 2)) ** 2;
              scale = 1.0 + 0.38 * factor; // 1.0 -> 1.38x max magnification
              translateY = -8 * factor;   // 0 -> -8px upward lift
            }
          } else if (focusedIndex === index) {
            scale = 1.35;
            translateY = -7;
          }
        }

        const isHoveringNav = mouseX !== null || focusedIndex !== null;
        const transitionStyle = isHoveringNav
          ? 'transform 120ms cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 160ms ease, background-color 160ms ease, border-color 160ms ease'
          : 'transform 320ms cubic-bezier(0.34, 1.45, 0.64, 1), box-shadow 280ms ease, background-color 280ms ease, border-color 280ms ease';

        return (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            ref={(el) => {
              itemRefs.current[index] = el;
            }}
            onFocus={() => {
              setFocusedIndex(index);
            }}
            onBlur={() => {
              setFocusedIndex(null);
            }}
            aria-label={item.label}
            style={({ isActive }) => {
              const baseStyle: React.CSSProperties = {
                transform: `scale(${scale}) translateY(${translateY}px) translateZ(0)`,
                WebkitTransform: `scale(${scale}) translateY(${translateY}px) translateZ(0)`,
                transformOrigin: '50% 90%',
                transition: transitionStyle,
                zIndex: scale > 1.05 ? 20 : isActive ? 10 : 1,
              };

              if (isActive) {
                if (scale > 1.15) {
                  return {
                    ...baseStyle,
                    boxShadow: '0 0 16px rgba(0, 210, 255, 0.55), inset 0 1px 2px rgba(255, 255, 255, 0.35)',
                    borderColor: 'rgba(0, 210, 255, 0.65)',
                  };
                }
                return baseStyle;
              } else {
                if (scale > 1.15) {
                  return {
                    ...baseStyle,
                    boxShadow: '0 0 14px rgba(0, 210, 255, 0.45)',
                  };
                } else if (scale > 1.03) {
                  return {
                    ...baseStyle,
                    boxShadow: '0 0 8px rgba(0, 210, 255, 0.25)',
                  };
                }
              }
              return baseStyle;
            }}
            className={({ isActive }) => {
              const activeClass = isActive
                ? 'bg-[rgba(25,42,62,0.85)] text-white shadow-inner border border-[rgba(255,255,255,0.25)]'
                : scale > 1.15
                ? 'text-white bg-[rgba(255,255,255,0.18)] border border-[rgba(0,210,255,0.45)]'
                : scale > 1.03
                ? 'text-white bg-[rgba(255,255,255,0.12)] border border-[rgba(0,210,255,0.25)]'
                : 'text-[#e2e8f0] hover:text-white border border-transparent';

              return `relative w-7 h-7 rounded-full flex items-center justify-center cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#00d2ff] ${activeClass}`;
            }}
          >
            {/* White outline icon with high-precision stroke */}
            <item.icon className="w-[17.5px] h-[17.5px] pointer-events-none" strokeWidth={2.2} />
          </NavLink>
        );
      })}
    </nav>
  );
};
