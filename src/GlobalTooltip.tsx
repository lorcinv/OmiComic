import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface TooltipState {
  text: string;
  left: number;
  top: number;
  transform: string;
}

interface ActiveTitle {
  element: HTMLElement;
  text: string;
}

interface PointerPosition {
  x: number;
  y: number;
}

const TOOLTIP_DELAY = 320;
const TOOLTIP_DISABLED_ATTRIBUTE = "data-tooltip-disabled";

function GlobalTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const activeTitleRef = useRef<ActiveTitle | null>(null);
  const timerRef = useRef<number | null>(null);
  const pointerPositionRef = useRef<PointerPosition | null>(null);

  useEffect(() => {
    let lastPointerDownAt = 0;

    const isTooltipDisabled = (element: HTMLElement) => (
      element.hasAttribute(TOOLTIP_DISABLED_ATTRIBUTE)
      || Boolean(element.closest(`[${TOOLTIP_DISABLED_ATTRIBUTE}]`))
    );

    const clearTimer = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const restoreActiveTitle = () => {
      const activeTitle = activeTitleRef.current;
      if (
        activeTitle
        && activeTitle.element.isConnected
        && !isTooltipDisabled(activeTitle.element)
        && !activeTitle.element.hasAttribute("title")
      ) {
        activeTitle.element.setAttribute("title", activeTitle.text);
      }
      activeTitleRef.current = null;
    };

    const hideTooltip = () => {
      clearTimer();
      restoreActiveTitle();
      pointerPositionRef.current = null;
      setTooltip(null);
    };

    const dismissTooltip = () => {
      clearTimer();
      setTooltip(null);
    };

    const positionTooltip = (
      element: HTMLElement,
      text: string,
      pointerPosition: PointerPosition | null,
    ): TooltipState => {
      const rect = element.getBoundingClientRect();
      const viewportPadding = 12;
      const viewportWidth = Math.max(120, window.innerWidth - viewportPadding * 2);
      const estimatedWidth = Math.min(480, viewportWidth, Math.max(120, Array.from(text).length * 12 + 24));
      const estimatedHeight = Math.max(34, Math.ceil(Array.from(text).length / 36) * 18 + 16);

      if (pointerPosition) {
        const horizontalGap = 14;
        const verticalGap = 18;
        const placeLeft = pointerPosition.x + horizontalGap + estimatedWidth > window.innerWidth - viewportPadding;
        const placeAbove = pointerPosition.y + verticalGap + estimatedHeight > window.innerHeight - viewportPadding;
        return {
          text,
          left: placeLeft ? pointerPosition.x - horizontalGap : pointerPosition.x + horizontalGap,
          top: placeAbove ? pointerPosition.y - 12 : pointerPosition.y + verticalGap,
          transform: placeLeft
            ? placeAbove ? "translate(-100%, -100%)" : "translateX(-100%)"
            : placeAbove ? "translateY(-100%)" : "none",
        };
      }

      const center = rect.left + rect.width / 2;
      const minimumCenter = viewportPadding + estimatedWidth / 2;
      const maximumCenter = Math.max(minimumCenter, window.innerWidth - viewportPadding - estimatedWidth / 2);
      const left = Math.min(maximumCenter, Math.max(minimumCenter, center));
      const placeAbove = rect.bottom + estimatedHeight + 12 > window.innerHeight && rect.top > estimatedHeight + 12;

      return {
        text,
        left,
        top: placeAbove ? rect.top - 8 : rect.bottom + 8,
        transform: placeAbove ? "translate(-50%, -100%)" : "translateX(-50%)",
      };
    };

    const showTooltip = (element: HTMLElement, delay: number, pointerPosition: PointerPosition | null) => {
      if (activeTitleRef.current?.element === element) {
        pointerPositionRef.current = pointerPosition;
        const refreshedText = element.getAttribute("title")?.trim();
        if (refreshedText) {
          activeTitleRef.current.text = refreshedText;
          element.removeAttribute("title");
        }
        return;
      }

      hideTooltip();
      pointerPositionRef.current = pointerPosition;
      const text = element.getAttribute("title")?.trim();
      if (!text) return;

      element.removeAttribute("title");
      activeTitleRef.current = { element, text };
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        const activeTitle = activeTitleRef.current;
        if (activeTitle?.element !== element || !element.isConnected) return;
        if (isTooltipDisabled(element)) {
          activeTitleRef.current = null;
          pointerPositionRef.current = null;
          setTooltip(null);
          return;
        }
        setTooltip(positionTooltip(element, activeTitle.text, pointerPositionRef.current));
      }, delay);
    };

    const findTitledElement = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return null;
      if (target.closest(`[${TOOLTIP_DISABLED_ATTRIBUTE}]`)) return null;
      return target.closest<HTMLElement>("[title]");
    };

    const clearDisabledRegionTitle = (target: EventTarget | null) => {
      if (!(target instanceof Element)) return false;
      const disabledRegion = target.closest<HTMLElement>(`[${TOOLTIP_DISABLED_ATTRIBUTE}]`);
      if (!disabledRegion) return false;
      const titledElement = target.closest<HTMLElement>("[title]");
      if (titledElement && disabledRegion.contains(titledElement)) titledElement.removeAttribute("title");
      hideTooltip();
      return true;
    };

    const clearDisabledTooltipState = () => {
      document.querySelectorAll<HTMLElement>(
        `[${TOOLTIP_DISABLED_ATTRIBUTE}][title], [${TOOLTIP_DISABLED_ATTRIBUTE}] [title]`,
      ).forEach((element) => element.removeAttribute("title"));

      const activeTitle = activeTitleRef.current;
      if (!activeTitle) {
        clearTimer();
        pointerPositionRef.current = null;
        setTooltip(null);
        return;
      }
      if (activeTitle.element.isConnected && !isTooltipDisabled(activeTitle.element)) return;
      clearTimer();
      activeTitleRef.current = null;
      pointerPositionRef.current = null;
      setTooltip(null);
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (clearDisabledRegionTitle(event.target)) return;
      const titledElement = findTitledElement(event.target);
      if (titledElement) showTooltip(titledElement, TOOLTIP_DELAY, { x: event.clientX, y: event.clientY });
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (clearDisabledRegionTitle(event.target)) return;
      const activeTitle = activeTitleRef.current;
      if (!activeTitle) return;
      if (!(event.target instanceof Node) || !activeTitle.element.contains(event.target)) {
        hideTooltip();
        return;
      }
      pointerPositionRef.current = { x: event.clientX, y: event.clientY };
      setTooltip((current) => current
        ? positionTooltip(activeTitle.element, activeTitle.text, pointerPositionRef.current)
        : current);
    };

    const handlePointerDown = (event: PointerEvent) => {
      lastPointerDownAt = performance.now();
      const activeTitle = activeTitleRef.current;
      if (activeTitle && event.target instanceof Node && activeTitle.element.contains(event.target)) {
        dismissTooltip();
      } else {
        hideTooltip();
      }
    };

    const handlePointerOut = (event: PointerEvent) => {
      const activeTitle = activeTitleRef.current;
      if (!activeTitle) return;
      if (event.relatedTarget instanceof Node && activeTitle.element.contains(event.relatedTarget)) return;
      if (event.target instanceof Node && activeTitle.element.contains(event.target)) hideTooltip();
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (clearDisabledRegionTitle(event.target)) return;
      if (performance.now() - lastPointerDownAt < 500) return;
      const titledElement = findTitledElement(event.target);
      if (titledElement) showTooltip(titledElement, 100, null);
    };

    const handleFocusOut = (event: FocusEvent) => {
      const activeTitle = activeTitleRef.current;
      if (!activeTitle) return;
      if (event.relatedTarget instanceof Node && activeTitle.element.contains(event.relatedTarget)) return;
      if (event.target instanceof Node && activeTitle.element.contains(event.target)) hideTooltip();
    };

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointermove", handlePointerMove, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    window.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);
    window.addEventListener("blur", hideTooltip);
    const tooltipGuardObserver = new MutationObserver(clearDisabledTooltipState);
    tooltipGuardObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: [TOOLTIP_DISABLED_ATTRIBUTE, "title"],
    });
    clearDisabledTooltipState();

    return () => {
      tooltipGuardObserver.disconnect();
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointermove", handlePointerMove, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      window.removeEventListener("scroll", hideTooltip, true);
      window.removeEventListener("resize", hideTooltip);
      window.removeEventListener("blur", hideTooltip);
      clearTimer();
      restoreActiveTitle();
    };
  }, []);

  if (!tooltip) return null;

  return createPortal(
    <div
      className="global-glass-tooltip"
      role="tooltip"
      style={{ left: tooltip.left, top: tooltip.top, transform: tooltip.transform }}
    >
      {tooltip.text}
    </div>,
    document.body,
  );
}

export default GlobalTooltip;
