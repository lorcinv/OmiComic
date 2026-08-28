import { useCallback, useEffect, useRef, useState } from "react";

interface OmiBrandIconProps {
  onActivate: (getOrigin: OmiBrandOriginGetter) => void | Promise<void>;
  disabled?: boolean;
  ariaLabel?: string;
}

interface OmiBrandOrigin {
  x: number;
  y: number;
}

type OmiBrandOriginGetter = () => OmiBrandOrigin | null;

const TRACKING_RADIUS = 150;
const MAX_GAZE_X = 2.6;
const MAX_GAZE_Y = 2;

const OMI_BRAND_ICON_STYLES = `
.omi-brand-icon {
  --omi-gaze-x: 0px;
  --omi-gaze-y: 0px;
  position: relative;
  display: inline-grid;
  width: var(--omi-brand-icon-size, 48px);
  height: var(--omi-brand-icon-size, 48px);
  flex: 0 0 auto;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: inherit;
  cursor: pointer;
  -webkit-app-region: no-drag;
  isolation: isolate;
}

.omi-brand-icon:disabled {
  cursor: default;
  opacity: 0.58;
}

.omi-brand-icon:focus-visible {
  outline: 2px solid rgba(105, 128, 151, 0.64);
  outline-offset: 3px;
}

.omi-brand-icon__graphic {
  display: block;
  width: 100%;
  height: 100%;
  overflow: visible;
}

.omi-brand-icon__disc {
  transform-origin: 32px 32px;
  transform-box: view-box;
  transition: transform 380ms cubic-bezier(0.22, 1, 0.36, 1);
}

.omi-brand-icon:not(:disabled):hover .omi-brand-icon__disc {
  transform: rotate(18deg);
}

.omi-brand-icon__eye {
  transform-box: fill-box;
  transform-origin: center;
  transform: translate(var(--omi-gaze-x), var(--omi-gaze-y)) scaleY(1);
  transition: transform 86ms ease-out;
}

.omi-brand-icon.is-blinking .omi-brand-icon__eye {
  transform: translate(var(--omi-gaze-x), var(--omi-gaze-y)) scaleY(0.08);
}

.omi-brand-icon.is-activating {
  cursor: progress;
}

@media (prefers-reduced-motion: reduce) {
  .omi-brand-icon__disc,
  .omi-brand-icon__eye {
    transition-duration: 30ms;
  }

  .omi-brand-icon:not(:disabled):hover .omi-brand-icon__disc {
    transform: none;
  }
}
`;

function OmiBrandIcon({
  onActivate,
  disabled = false,
  ariaLabel = "继续上次阅读",
}: OmiBrandIconProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const pointerFrameRef = useRef<number | null>(null);
  const gazeFrameRef = useRef<number | null>(null);
  const blinkTimerRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const targetGazeRef = useRef({ x: 0, y: 0 });
  const currentGazeRef = useRef({ x: 0, y: 0 });
  const mountedRef = useRef(true);
  const activatingRef = useRef(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [isActivating, setIsActivating] = useState(false);

  const animateGaze = useCallback(() => {
    gazeFrameRef.current = null;
    const element = buttonRef.current;
    if (!element) return;

    const current = currentGazeRef.current;
    const target = targetGazeRef.current;
    const nextX = current.x + (target.x - current.x) * 0.2;
    const nextY = current.y + (target.y - current.y) * 0.2;
    const settled = Math.abs(target.x - nextX) < 0.015 && Math.abs(target.y - nextY) < 0.015;

    currentGazeRef.current = settled ? { ...target } : { x: nextX, y: nextY };
    element.style.setProperty("--omi-gaze-x", `${currentGazeRef.current.x.toFixed(3)}px`);
    element.style.setProperty("--omi-gaze-y", `${currentGazeRef.current.y.toFixed(3)}px`);

    if (!settled) gazeFrameRef.current = window.requestAnimationFrame(animateGaze);
  }, []);

  const startGazeAnimation = useCallback(() => {
    if (gazeFrameRef.current === null) {
      gazeFrameRef.current = window.requestAnimationFrame(animateGaze);
    }
  }, [animateGaze]);

  const getActivationOrigin = useCallback<OmiBrandOriginGetter>(() => {
    const element = buttonRef.current;
    if (!element?.isConnected) return null;
    const bounds = element.getBoundingClientRect();
    return {
      x: bounds.left + bounds.width / 2,
      y: bounds.top + bounds.height / 2,
    };
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resetGaze = (): void => {
      lastPointerRef.current = null;
      targetGazeRef.current = { x: 0, y: 0 };
      if (reduceMotion) {
        currentGazeRef.current = { x: 0, y: 0 };
        buttonRef.current?.style.setProperty("--omi-gaze-x", "0px");
        buttonRef.current?.style.setProperty("--omi-gaze-y", "0px");
      } else {
        startGazeAnimation();
      }
    };

    const updateGazeTarget = (): void => {
      pointerFrameRef.current = null;
      const element = buttonRef.current;
      const pointer = lastPointerRef.current;
      if (!element || !pointer || disabled || reduceMotion) {
        targetGazeRef.current = { x: 0, y: 0 };
        startGazeAnimation();
        return;
      }

      const bounds = element.getBoundingClientRect();
      const deltaX = pointer.x - (bounds.left + bounds.width / 2);
      const deltaY = pointer.y - (bounds.top + bounds.height / 2);
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > TRACKING_RADIUS) {
        targetGazeRef.current = { x: 0, y: 0 };
      } else {
        const strength = Math.min(1, distance / 70);
        const directionX = distance > 0 ? deltaX / distance : 0;
        const directionY = distance > 0 ? deltaY / distance : 0;
        targetGazeRef.current = {
          x: directionX * MAX_GAZE_X * strength,
          y: directionY * MAX_GAZE_Y * strength,
        };
      }
      startGazeAnimation();
    };

    const handlePointerMove = (event: PointerEvent): void => {
      if (!document.hasFocus() || document.visibilityState !== "visible") return;
      lastPointerRef.current = { x: event.clientX, y: event.clientY };
      if (pointerFrameRef.current === null) {
        pointerFrameRef.current = window.requestAnimationFrame(updateGazeTarget);
      }
    };

    const handleVisibilityChange = (): void => {
      if (document.visibilityState !== "visible" || !document.hasFocus()) resetGaze();
    };

    if (!disabled && !reduceMotion) {
      document.addEventListener("pointermove", handlePointerMove, { passive: true });
      document.addEventListener("visibilitychange", handleVisibilityChange);
      window.addEventListener("blur", resetGaze);
    } else {
      resetGaze();
    }

    return () => {
      mountedRef.current = false;
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("blur", resetGaze);
      if (pointerFrameRef.current !== null) window.cancelAnimationFrame(pointerFrameRef.current);
      if (gazeFrameRef.current !== null) window.cancelAnimationFrame(gazeFrameRef.current);
      if (blinkTimerRef.current !== null) window.clearTimeout(blinkTimerRef.current);
      pointerFrameRef.current = null;
      gazeFrameRef.current = null;
      blinkTimerRef.current = null;
    };
  }, [disabled, startGazeAnimation]);

  const handleActivate = (): void => {
    if (disabled || activatingRef.current) return;

    activatingRef.current = true;
    setIsBlinking(true);
    setIsActivating(true);
    targetGazeRef.current = { x: 0, y: 0 };
    startGazeAnimation();

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    blinkTimerRef.current = window.setTimeout(() => {
      blinkTimerRef.current = null;
      if (!mountedRef.current) return;
      setIsBlinking(false);

      void Promise.resolve()
        .then(() => onActivate(getActivationOrigin))
        .catch((error: unknown) => {
          console.error("OmiComic brand activation failed", error);
        })
        .finally(() => {
          activatingRef.current = false;
          if (mountedRef.current) setIsActivating(false);
        });
    }, reduceMotion ? 45 : 190);
  };

  return (
    <>
      <style>{OMI_BRAND_ICON_STYLES}</style>
      <button
        ref={buttonRef}
        type="button"
        className={`omi-brand-icon${isBlinking ? " is-blinking" : ""}${
          isActivating ? " is-activating" : ""
        }`}
        aria-label={ariaLabel}
        aria-busy={isActivating}
        disabled={disabled}
        onClick={handleActivate}
      >
        <svg
          className="omi-brand-icon__graphic"
          viewBox="0 0 64 64"
          aria-hidden="true"
          focusable="false"
        >
          {/* The white insert is a fixed, recessed full-ring bed. The wider shell above it
              hides every part except the rotating aperture, so the insert never protrudes. */}
          <g className="omi-brand-icon__insert">
            <circle cx="32" cy="32" r="23" fill="none" stroke="#e9edef" strokeWidth="10.5" />
            <circle
              cx="32"
              cy="32"
              r="23"
              fill="none"
              stroke="#ffffff"
              strokeWidth="8.2"
            />
            <circle cx="32" cy="32" r="28.25" fill="none" stroke="#d4d9de" strokeWidth="0.7" />
            <circle cx="32" cy="32" r="17.75" fill="none" stroke="#c8cfd5" strokeWidth="0.7" />
          </g>

          {/* A deliberately asymmetric C-shell makes rotation legible. It is flat, matte and
              wider than the insert on both edges, like an inlaid print panel under a cover. */}
          <g className="omi-brand-icon__disc" fill="none" strokeLinecap="butt">
            <path
              d="M48.26 15.74A23 23 0 1 0 48.26 48.26"
              stroke="#78838e"
              strokeWidth="12"
            />
            <path
              d="M52.51 11.49A29 29 0 1 0 52.51 52.51"
              stroke="#5f6a75"
              strokeWidth="0.8"
            />
            <path
              d="M44.02 19.98A17 17 0 1 0 44.02 44.02"
              stroke="#aab2ba"
              strokeWidth="0.8"
            />
            <path d="M44.02 19.98L52.51 11.49" stroke="#68737e" strokeWidth="1.1" />
            <path d="M44.02 44.02L52.51 52.51" stroke="#68737e" strokeWidth="1.1" />
            <path
              d="M47.55 16.45A22 22 0 0 0 16.45 47.55"
              stroke="#9099a2"
              strokeWidth="0.75"
              opacity="0.58"
            />
          </g>

          <g className="omi-brand-icon__eyes">
            <g className="omi-brand-icon__eye">
              <rect x="23.6" y="25.6" width="5.8" height="12.8" rx="2.9" fill="#4b5662" />
            </g>
            <g className="omi-brand-icon__eye">
              <rect x="34.6" y="25.6" width="5.8" height="12.8" rx="2.9" fill="#4b5662" />
            </g>
          </g>
        </svg>
      </button>
    </>
  );
}

export type { OmiBrandIconProps, OmiBrandOrigin, OmiBrandOriginGetter };
export default OmiBrandIcon;
