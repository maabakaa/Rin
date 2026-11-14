import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { armReveals, replayMainReveal, startMotion } from "./engine";

/**
 * The single decorative layer of the app. It renders no content, only the
 * ambient background and the scroll progress hairline, and boots the
 * animation engine once. Route changes replay the page-level fade.
 */
export function MotionLayer() {
  const [location] = useLocation();
  const firstRender = useRef(true);

  useEffect(() => {
    const stop = startMotion();
    // Cover nodes rendered in the same commit as this effect.
    armReveals(document.body);
    return stop;
  }, []);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const frame = requestAnimationFrame(() => {
      armReveals(document.body);
      replayMainReveal();
    });
    return () => cancelAnimationFrame(frame);
  }, [location]);

  return (
    <div className="motion-layer" aria-hidden="true">
      <div className="motion-aurora">
        <div className="motion-aurora__parallax" data-motion-parallax="a">
          <span className="motion-aurora__blob motion-aurora__blob--a" />
        </div>
        <div className="motion-aurora__parallax" data-motion-parallax="b">
          <span className="motion-aurora__blob motion-aurora__blob--b" />
        </div>
      </div>
      <div className="motion-progress">
        <span className="motion-progress__bar" data-motion-progress="" />
      </div>
    </div>
  );
}
