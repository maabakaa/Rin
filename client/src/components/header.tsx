import { useContext, useEffect, useRef, useState } from "react";
import { ProfileContext } from "../state/profile";
import { Padding } from "./padding";
import { useSiteConfig } from "../hooks/useSiteConfig";
import { getHeaderLayoutDefinition } from "./site-header/layout-registry";
import { normalizeHeaderBehavior, normalizeHeaderLayout } from "./site-header/layout-options";

export function Header({ children }: { children?: React.ReactNode }) {
  const profile = useContext(ProfileContext);
  const siteConfig = useSiteConfig();
  const headerLayout = normalizeHeaderLayout(siteConfig.headerLayout);
  const headerBehavior = normalizeHeaderBehavior(siteConfig.headerBehavior);
  const layoutDefinition = getHeaderLayoutDefinition(headerLayout);
  const [isRevealed, setIsRevealed] = useState(true);
  const [isAtTop, setIsAtTop] = useState(true);
  const headerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let lastScrollY = window.scrollY;
    let ticking = false;
    let frame = 0;
    let atTop = true;
    let revealed = true;

    const update = () => {
      ticking = false;
      const currentScrollY = window.scrollY;
      const nearTop = currentScrollY <= 24;
      const scrollingUp = currentScrollY < lastScrollY;
      const nextRevealed = headerBehavior !== "reveal" || nearTop || scrollingUp;

      // Coalesced to one rAF and only commit state when a boolean flips:
      // the header must never re-render on every scroll frame.
      if (nearTop !== atTop) {
        atTop = nearTop;
        setIsAtTop(atTop);
      }
      if (nextRevealed !== revealed) {
        revealed = nextRevealed;
        setIsRevealed(revealed);
      }
      lastScrollY = currentScrollY;
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      frame = requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    update();

    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [headerBehavior]);

  useEffect(() => {
    const root = document.documentElement;
    const setHeaderScrollOffset = () => {
      const headerHeight = headerRef.current?.getBoundingClientRect().height ?? 0;
      root.style.setProperty("--header-scroll-offset", `${Math.ceil(headerHeight + 16)}px`);
    };

    setHeaderScrollOffset();

    const resizeObserver = new ResizeObserver(() => {
      setHeaderScrollOffset();
    });

    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    window.addEventListener("resize", setHeaderScrollOffset);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("resize", setHeaderScrollOffset);
    };
  }, [headerBehavior, headerLayout]);

  const useTopHeader = layoutDefinition.kind === "top";
  const headerPaddingClassName = headerLayout === "compact" ? "mx-0 mt-0" : "mx-4 mt-4";
  const containerClassName =
    !useTopHeader || headerBehavior === "static"
      ? "relative z-40"
      : `fixed inset-x-0 top-0 z-40 transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${
          headerBehavior === "reveal" && !isRevealed ? "-translate-y-full" : "translate-y-0"
        }`;
  const spacerClassName = !useTopHeader || headerBehavior === "static" ? "h-0" : "h-20";

  return (
    <>
      {headerLayout === "compact" ? (
        <div className="pointer-events-none fixed inset-x-0 top-0 -z-10 h-64 bg-gradient-to-b from-theme/15 to-white/0 dark:from-theme/20 dark:to-transparent" />
      ) : null}
      <div ref={headerRef} className={containerClassName}>
        <div className="w-screen">
          {headerLayout === "compact" ? (
            <div className="w-full">
              {layoutDefinition.renderMobile({ children, profile, siteConfig, behavior: headerBehavior, isAtTop })}
              {layoutDefinition.renderDesktop({ children, profile, siteConfig, behavior: headerBehavior, isAtTop })}
            </div>
          ) : (
            <Padding className={headerPaddingClassName}>
              <div className="w-full">
                {layoutDefinition.renderMobile({ children, profile, siteConfig, behavior: headerBehavior, isAtTop })}
                {layoutDefinition.renderDesktop({ children, profile, siteConfig, behavior: headerBehavior, isAtTop })}
              </div>
            </Padding>
          )}
        </div>
      </div>
      <div className={spacerClassName} />
    </>
  );
}
