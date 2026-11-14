/* ==========================================================================
   Rin Motion Engine
   --------------------------------------------------------------------------
   Zero-dependency, zero-React-render animation runtime.

   Design rules (kept deliberately strict for 60fps):
   - Only transform / opacity are written on scroll. No layout-triggering
     properties, no per-frame React state.
   - Every scroll handler is coalesced into one requestAnimationFrame.
   - IntersectionObserver drives reveals; MutationObserver picks up cards
     that arrive from async API calls or client-side navigation, so no page
     component needs to know about the animation system.
   - Feature detection + graceful bail-out: touch devices, low-core devices,
     reduced-motion users and `?motion=off` get the original static site.
   ========================================================================== */

type Cleanup = () => void;

const REVEAL_SELECTOR = "[data-reveal]";
const GROUP_SELECTOR = "[data-reveal-group]";
const AUTO_REVEAL_SELECTOR = "main, footer";
const STAGGER_MS = 64;
const MAX_STAGGER_STEPS = 9;

/** Elements whose own scrolling must never be intercepted. */
const NATIVE_SCROLL_SELECTOR = [
  "[data-native-scroll]",
  "textarea",
  "select",
  "input[type='range']",
  "[contenteditable='true']",
  "[role='dialog']",
  ".ReactModal__Content",
  ".overflow-auto",
  ".overflow-y-auto",
  ".overflow-scroll",
  ".overflow-y-scroll",
  ".toc",
  ".wmde-markdown",
  ".w-md-editor",
].join(",");

let teardown: Cleanup | null = null;
let revealObserver: IntersectionObserver | null = null;
let domObserver: MutationObserver | null = null;
let enabled = false;

export function isMotionEnabled(): boolean {
  return enabled;
}

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function finePointer(): boolean {
  return window.matchMedia("(hover: hover) and (pointer: fine)").matches;
}

function lowEndDevice(): boolean {
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
  return cores <= 2 || memory <= 2;
}

function motionDisabledByRequest(): boolean {
  try {
    if (new URLSearchParams(window.location.search).get("motion") === "off") return true;
    return window.localStorage.getItem("rin:motion") === "off";
  } catch {
    return false;
  }
}

/* --------------------------------------------------------------------------
   Reveals
   -------------------------------------------------------------------------- */

function applyStagger(group: Element): void {
  const items = group.querySelectorAll(REVEAL_SELECTOR);
  let index = 0;
  for (const item of items) {
    // Only direct members of this group get a delay; nested groups handle
    // their own children.
    if (item.closest(GROUP_SELECTOR) !== group) continue;
    (item as HTMLElement).style.setProperty(
      "--reveal-delay",
      `${Math.min(index, MAX_STAGGER_STEPS) * STAGGER_MS}ms`,
    );
    index += 1;
  }
}

function watch(el: Element): void {
  if (!revealObserver || el.hasAttribute("data-motion-bound")) return;
  el.setAttribute("data-motion-bound", "");
  el.classList.add("is-armed");
  revealObserver.observe(el);
}

/** Legacy `ani-show` containers already have their own entrance animation. */
function markAutoReveal(el: Element): void {
  if (el.hasAttribute("data-reveal")) return;
  if (el.classList.contains("ani-show") || el.classList.contains("ani-show-fast")) return;
  el.setAttribute("data-reveal", "fade");
}

/**
 * Register every reveal target inside `root`. Safe to call repeatedly: an
 * already-bound element is skipped.
 */
export function armReveals(root: ParentNode = document.body): void {
  if (!enabled) return;

  const self = root as Element;
  const isElement = typeof self?.matches === "function";

  if (isElement) {
    if (self.matches(AUTO_REVEAL_SELECTOR)) markAutoReveal(self);
    if (self.matches(GROUP_SELECTOR)) applyStagger(self);
    if (self.matches(REVEAL_SELECTOR)) watch(self);
  }

  for (const el of root.querySelectorAll(AUTO_REVEAL_SELECTOR)) markAutoReveal(el);
  for (const group of root.querySelectorAll(GROUP_SELECTOR)) applyStagger(group);
  for (const el of root.querySelectorAll(REVEAL_SELECTOR)) watch(el);
}

/** Replay the page-level fade after a client-side route change. */
export function replayMainReveal(): void {
  if (!enabled) return;
  const main = document.querySelector("main");
  if (!main) return;
  if (!main.hasAttribute("data-reveal")) armReveals(main);
  main.classList.remove("is-revealed");
  // Flush the style change so the transition actually restarts.
  void (main as HTMLElement).offsetWidth;
  requestAnimationFrame(() => main.classList.add("is-revealed"));
}

function setupObservers(): Cleanup {
  revealObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        el.classList.add("is-revealed");
        revealObserver?.unobserve(el);
        // Drop the compositor hint once the transition is over.
        window.setTimeout(() => el.classList.remove("is-armed"), 1200);
      }
    },
    { threshold: 0.06, rootMargin: "0px 0px -6% 0px" },
  );

  domObserver = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE) armReveals(node as Element);
      }
    }
  });
  domObserver.observe(document.body, { childList: true, subtree: true });

  armReveals(document.body);

  return () => {
    revealObserver?.disconnect();
    domObserver?.disconnect();
    revealObserver = null;
    domObserver = null;
    for (const el of document.querySelectorAll("[data-motion-bound]")) {
      el.removeAttribute("data-motion-bound");
      el.classList.remove("is-armed", "is-revealed");
    }
  };
}

/* --------------------------------------------------------------------------
   Scroll-driven visuals: progress hairline, ambient parallax, hero exit.
   One rAF for all of them, one style write per element per frame.
   -------------------------------------------------------------------------- */

function setupScrollVisuals(): Cleanup {
  const root = document.documentElement;
  const progressBar = document.querySelector<HTMLElement>("[data-motion-progress]");
  const parallaxA = document.querySelector<HTMLElement>("[data-motion-parallax='a']");
  const parallaxB = document.querySelector<HTMLElement>("[data-motion-parallax='b']");
  let ticking = false;

  const update = () => {
    ticking = false;
    const y = window.scrollY;
    const max = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
    const progress = Math.min(1, Math.max(0, y / max));

    if (progressBar) progressBar.style.transform = `scaleX(${progress.toFixed(4)})`;
    if (parallaxA) parallaxA.style.transform = `translate3d(0, ${(progress * 90).toFixed(1)}px, 0)`;
    if (parallaxB) parallaxB.style.transform = `translate3d(0, ${(progress * -64).toFixed(1)}px, 0)`;

    const hero = document.querySelector<HTMLElement>("[data-motion-hero]");
    if (hero) {
      const heroProgress = Math.min(1, Math.max(0, y / Math.max(1, window.innerHeight * 0.85)));
      const shift = (-heroProgress * 44).toFixed(1);
      const scale = (1 - heroProgress * 0.045).toFixed(4);
      hero.style.transform = `translate3d(0, ${shift}px, 0) scale(${scale})`;
      hero.style.opacity = (1 - heroProgress * 0.62).toFixed(3);
    }

    root.classList.toggle("is-scrolled", y > 12);
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(update);
  };

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll, { passive: true });
  update();

  return () => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
    root.classList.remove("is-scrolled");
  };
}

/* --------------------------------------------------------------------------
   Inertial wheel scrolling (desktop, fine pointer only)

   Unlike a transform-based fake scroll container this keeps native scroll
   position, so sticky/fixed headers, anchor links and Ctrl+zoom all still
   work. Touch devices keep native momentum scrolling.
   -------------------------------------------------------------------------- */

function setupSmoothScroll(): Cleanup {
  if (!finePointer() || lowEndDevice()) return () => {};

  let target = window.scrollY;
  let current = target;
  let running = false;
  let frame = 0;
  let lastTime = 0;

  const maxScroll = () =>
    Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
  const clamp = (value: number) => Math.min(maxScroll(), Math.max(0, value));

  const syncToNative = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    running = false;
    lastTime = 0;
    current = window.scrollY;
    target = current;
  };

  const step = (now: number) => {
    const deltaTime = Math.min(48, Math.max(1, lastTime ? now - lastTime : 16.7));
    lastTime = now;
    const diff = target - current;

    if (Math.abs(diff) < 0.4) {
      current = target;
      window.scrollTo(0, current);
      syncToNative();
      return;
    }

    // Frame-rate independent lerp: identical feel on 60Hz and 144Hz screens.
    const factor = 1 - Math.pow(1 - 0.14, deltaTime / 16.67);
    current += diff * factor;
    window.scrollTo(0, current);
    frame = requestAnimationFrame(step);
  };

  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey || event.defaultPrevented || event.deltaY === 0) return;
    const source = event.target instanceof Element ? event.target : null;
    if (source?.closest(NATIVE_SCROLL_SELECTOR)) return;
    if (document.body.classList.contains("ReactModal__Body--open")) return;

    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= window.innerHeight;
    if (!Number.isFinite(delta) || delta === 0) return;

    event.preventDefault();

    if (Math.abs(window.scrollY - current) > 2) current = window.scrollY;
    if (!running) target = window.scrollY;
    target = clamp(target + delta * 1.05);

    if (!running) {
      running = true;
      lastTime = 0;
      frame = requestAnimationFrame(step);
    }
  };

  const onScroll = () => {
    if (!running) {
      current = window.scrollY;
      target = current;
      return;
    }
    // A large mismatch means the user grabbed the scrollbar or the browser
    // scrolled on its own; hand control back immediately.
    if (Math.abs(window.scrollY - current) > 14) syncToNative();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if (["PageDown", "PageUp", "Home", "End", "ArrowDown", "ArrowUp", " "].includes(event.key)) {
      syncToNative();
    }
  };

  window.addEventListener("wheel", onWheel, { passive: false });
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("keydown", onKeyDown);

  return () => {
    window.removeEventListener("wheel", onWheel);
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("keydown", onKeyDown);
    syncToNative();
  };
}

/* --------------------------------------------------------------------------
   Pointer-following sheen, delegated to one document listener.
   -------------------------------------------------------------------------- */

function setupSpotlight(): Cleanup {
  if (!finePointer()) return () => {};

  let pending: { el: HTMLElement; x: number; y: number } | null = null;
  let frame = 0;

  const apply = () => {
    frame = 0;
    if (!pending) return;
    const { el, x, y } = pending;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const mx = ((x - rect.left) / rect.width) * 100;
    const my = ((y - rect.top) / rect.height) * 100;
    el.style.setProperty("--mx", `${mx.toFixed(2)}%`);
    el.style.setProperty("--my", `${my.toFixed(2)}%`);
  };

  const onPointerMove = (event: PointerEvent) => {
    if (!(event.target instanceof Element)) return;
    const card = event.target.closest<HTMLElement>(".motion-card-wrap");
    if (!card) return;
    pending = { el: card, x: event.clientX, y: event.clientY };
    if (!frame) frame = requestAnimationFrame(apply);
  };

  document.addEventListener("pointermove", onPointerMove, { passive: true });

  return () => {
    document.removeEventListener("pointermove", onPointerMove);
    if (frame) cancelAnimationFrame(frame);
  };
}

/* --------------------------------------------------------------------------
   Lifecycle
   -------------------------------------------------------------------------- */

export function startMotion(): Cleanup {
  if (teardown) teardown();

  const root = document.documentElement;

  if (reducedMotion() || motionDisabledByRequest()) {
    root.classList.remove("motion-enabled", "is-scrolled");
    root.classList.add("motion-off");
    enabled = false;
    const noopTeardown: Cleanup = () => root.classList.remove("motion-off");
    teardown = noopTeardown;
    return noopTeardown;
  }

  root.classList.remove("motion-off");
  root.classList.add("motion-enabled");
  enabled = true;

  const cleanups = [
    setupObservers(),
    setupScrollVisuals(),
    setupSmoothScroll(),
    setupSpotlight(),
  ];

  const stop: Cleanup = () => {
    for (const cleanup of cleanups) cleanup();
    root.classList.remove("motion-enabled", "is-scrolled");
    enabled = false;
    teardown = null;
  };

  teardown = stop;
  return stop;
}
