import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

export function useCardScaleWheel(surface: RefObject<HTMLElement>, enabled: boolean,
  onZoom: (direction: number, scope: "library" | "detail", fast: boolean) => void) {
  const callback = useRef(onZoom);
  useLayoutEffect(() => { callback.current = onZoom; }, [onZoom]);

  useEffect(() => {
    const element = surface.current;
    if (!enabled || !element) return;
    let lastStep = 0;
    let lastEvent = 0;
    let remainder = 0;
    let lastScope = "";
    function onWheel(event: WheelEvent) {
      if (!event.ctrlKey || !Number.isFinite(event.deltaY) || event.deltaY === 0) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const control = target.closest<HTMLElement>(".card-scale-control");
      if (!control && (!target.closest(".resource-list-scroll, .bookshelf-root-view, .resource-detail-page")
        || target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'))) return;
      // 阻止网页整体缩放，也不让同一笔滚轮触发翻组或详情折叠。
      event.preventDefault();
      event.stopPropagation();
      if (control?.getAttribute("aria-disabled") === "true") return;
      const scope = control?.dataset.cardScaleScope === "detail" || (!control && target.closest(".resource-detail-page"))
        ? "detail" : "library";
      const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? element!.clientHeight : 1);
      const now = performance.now();
      if (now - lastEvent > 180 || lastScope !== scope || Math.sign(remainder) !== Math.sign(delta)) remainder = 0;
      lastEvent = now;
      lastScope = scope;
      remainder += delta;
      // 鼠标一格切一档；触控板细碎事件累积后切档，避免轻触便越过多个档位。
      if (Math.abs(remainder) < 40) return;
      remainder = 0;
      callback.current(delta < 0 ? 1 : -1, scope, now - lastStep < 150);
      lastStep = now;
    }
    element.addEventListener("wheel", onWheel, { capture: true, passive: false });
    return () => element.removeEventListener("wheel", onWheel, true);
  }, [surface, enabled]);
}
