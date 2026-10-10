import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface PointerPosition { x: number; y: number }
interface TooltipState {
  element: HTMLElement;
  text: string;
  pointer: PointerPosition | null;
}

const TOOLTIP_DELAY = 320;
const DISABLED = "data-tooltip-disabled";
const OWNER_SELECTOR = '[data-tooltip], [title], button, a[href], input, textarea, select, summary, [role="button"], [role="slider"], [role="checkbox"], [contenteditable="true"]';

function GlobalTooltip() {
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const popup = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!tooltip || !popup.current) return;
    const box = popup.current.getBoundingClientRect();
    const anchor = tooltip.element.getBoundingClientRect();
    const padding = 12;
    const compact = anchor.width < 180 && anchor.height < 80;
    const x = tooltip.pointer?.x ?? anchor.left + anchor.width / 2;
    const below = tooltip.pointer && !compact ? tooltip.pointer.y + 18 : anchor.bottom + 8;
    const above = tooltip.pointer && !compact ? tooltip.pointer.y - 12 : anchor.top - 8;
    let left = tooltip.pointer ? x + 14 : x - box.width / 2;
    if (left + box.width > innerWidth - padding) left = x - box.width - 14;
    let top = below + box.height <= innerHeight - padding ? below : above - box.height;
    // 小按钮优先向侧面让开，三个点的提示不会压在下方收藏按钮上。
    if (compact && (anchor.right + box.width + 8 <= innerWidth - padding || anchor.left - box.width - 8 >= padding)) {
      left = anchor.right + box.width + 8 <= innerWidth - padding ? anchor.right + 8 : anchor.left - box.width - 8;
      top = anchor.top + (anchor.height - box.height) / 2;
    }
    // 按实际渲染尺寸避让触发控件，并限制在窗口内；长路径也不越界。
    popup.current.style.left = `${Math.max(padding, Math.min(left, innerWidth - box.width - padding))}px`;
    popup.current.style.top = `${Math.max(padding, Math.min(top, innerHeight - box.height - padding))}px`;
  }, [tooltip]);

  useEffect(() => {
    let active: TooltipState | null = null;
    let timer: number | null = null;
    let dismissed: HTMLElement | null = null;
    let lastPointerDownAt = 0;

    const clearTimer = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    const hide = () => {
      clearTimer();
      active = null;
      setTooltip(null);
    };
    const dismiss = () => {
      dismissed = active?.element ?? null;
      hide();
    };
    const findOwner = (target: EventTarget | null): HTMLElement | null => {
      if (!(target instanceof Element) || target.closest(`[${DISABLED}]`)) return null;
      // 先取最近交互元素；没有自己的提示时也不能穿透到父卡片。
      const owner = target.closest<HTMLElement>(OWNER_SELECTOR);
      return owner?.dataset.tooltip?.trim() ? owner : null;
    };
    const show = (element: HTMLElement, delay: number, pointer: PointerPosition | null) => {
      const text = element.dataset.tooltip?.trim();
      if (dismissed === element || !text) return;
      dismissed = null;
      if (active?.element === element && active.text === text) {
        active = { element, text, pointer };
        setTooltip(current => current ? active : null);
        return;
      }
      hide();
      active = { element, text, pointer };
      timer = window.setTimeout(() => {
        timer = null;
        if (active?.element === element && element.isConnected && !element.closest(`[${DISABLED}]`)) {
          setTooltip({ ...active });
        }
      }, delay);
    };

    // 提前接管原生 title，而不是悬停时删除/离开时恢复。
    // 保留空 title 阻断浏览器的父级提示继承，React 后续更新仍由观察器同步。
    const convertTitle = (element: HTMLElement) => {
      // iframe 的 title 是文档的无障碍名称，不属于应用工具提示。
      if (element instanceof HTMLIFrameElement) return;
      const text = element.getAttribute("title")?.trim();
      if (text) {
        element.dataset.tooltip = text;
        element.dataset.tooltipNative = "";
        element.setAttribute("title", "");
      } else if (element.hasAttribute("data-tooltip-native")) {
        element.removeAttribute("data-tooltip");
        element.removeAttribute("data-tooltip-native");
      }
    };
    const convertTree = (node: Node) => {
      if (!(node instanceof HTMLElement)) return;
      if (node.getAttribute("title")) convertTitle(node);
      node.querySelectorAll<HTMLElement>('[title]:not([title=""])').forEach(convertTitle);
    };
    const observer = new MutationObserver(records => {
      // 暂停观察自身的属性转换，避免把内部清空 title 当作业务删除。
      observer.disconnect();
      const changedTitles = new Set<HTMLElement>();
      for (const record of records) {
        if (record.attributeName === "title" && record.target instanceof HTMLElement) changedTitles.add(record.target);
      }
      changedTitles.forEach(convertTitle);
      for (const record of records) {
        if (record.type === "childList") record.addedNodes.forEach(convertTree);
      }
      observe();
      if (!active) return;
      if (!active.element.isConnected || active.element.closest(`[${DISABLED}]`) || !active.element.dataset.tooltip) hide();
      else if (active.text !== active.element.dataset.tooltip) {
        active = { ...active, text: active.element.dataset.tooltip };
        setTooltip(current => current ? active : null);
      }
    });
    const observe = () => observer.observe(document.documentElement, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: [DISABLED, "title", "data-tooltip"],
    });
    convertTree(document.documentElement);
    observe();

    const handlePointer = (event: PointerEvent) => {
      // Ctrl 悬停由备注浮层负责，避免与普通提示叠加。
      if (event.ctrlKey || event.buttons) { hide(); return; }
      const owner = findOwner(event.target);
      if (owner !== dismissed) dismissed = null;
      if (!owner) { hide(); return; }
      show(owner, TOOLTIP_DELAY, { x: event.clientX, y: event.clientY });
    };
    const handlePointerOut = (event: PointerEvent) => {
      if (active && findOwner(event.relatedTarget) !== active.element) hide();
      if (findOwner(event.relatedTarget) !== dismissed) dismissed = null;
    };
    const handlePointerDown = () => { lastPointerDownAt = performance.now(); dismiss(); };
    const handleFocus = (event: FocusEvent) => {
      if (performance.now() - lastPointerDownAt < 500) return;
      const owner = findOwner(event.target);
      if (owner) { dismissed = null; show(owner, 100, null); }
      else hide();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" || event.key === "Control") dismiss();
    };
    document.addEventListener("pointerover", handlePointer, true);
    document.addEventListener("pointermove", handlePointer, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("pointerdown", handlePointerDown, true);
    document.addEventListener("focusin", handleFocus, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("keydown", handleKey, true);
    window.addEventListener("wheel", dismiss, { capture: true, passive: true });
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    window.addEventListener("blur", dismiss);
    return () => {
      observer.disconnect();
      document.removeEventListener("pointerover", handlePointer, true);
      document.removeEventListener("pointermove", handlePointer, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("pointerdown", handlePointerDown, true);
      document.removeEventListener("focusin", handleFocus, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("keydown", handleKey, true);
      window.removeEventListener("wheel", dismiss, true);
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
      window.removeEventListener("blur", dismiss);
      clearTimer();
      document.querySelectorAll<HTMLElement>("[data-tooltip-native]").forEach(element => {
        element.setAttribute("title", element.dataset.tooltip ?? "");
        element.removeAttribute("data-tooltip");
        element.removeAttribute("data-tooltip-native");
      });
    };
  }, []);

  if (!tooltip) return null;
  return createPortal(
    <div ref={popup} className="global-glass-tooltip" role="tooltip" style={{ left: 0, top: 0 }}>
      {tooltip.text}
    </div>, document.body,
  );
}

export default GlobalTooltip;
