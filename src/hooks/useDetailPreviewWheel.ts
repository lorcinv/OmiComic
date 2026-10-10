import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";

interface DetailPreviewWheelOptions {
  enabled: boolean;
  panel: RefObject<HTMLElement>;
  preview: RefObject<HTMLDivElement>;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
}

export function useDetailPreviewWheel({ enabled, panel, preview, collapsed, setCollapsed }: DetailPreviewWheelOptions) {
  const motion = useRef({ collapsed, lockedUntil: 0, upward: 0, lastUpwardAt: 0 });

  useLayoutEffect(() => {
    if (motion.current.collapsed !== collapsed) {
      motion.current.collapsed = collapsed;
      motion.current.lockedUntil = performance.now() + 240;
      motion.current.upward = 0;
    }
  }, [collapsed]);

  useEffect(() => {
    const surface = panel.current;
    if (!enabled || !surface) return;
    motion.current.upward = 0;
    motion.current.lockedUntil = 0;

    function resetResistance() {
      motion.current.upward = 0;
      motion.current.lastUpwardAt = 0;
    }

    function switchDetails(nextCollapsed: boolean) {
      const state = motion.current;
      state.collapsed = nextCollapsed;
      // 收起动画期间吞掉同一拨滚轮的余量，先完成折叠再开始移动首排。
      state.lockedUntil = performance.now() + 240;
      resetResistance();
      surface!.scrollTo({ top: 0, behavior: "instant" });
      preview.current?.scrollTo({ top: 0, behavior: "instant" });
      setCollapsed(nextCollapsed);
    }

    function onWheel(event: WheelEvent) {
      const grid = preview.current;
      if (!grid || event.ctrlKey || Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      // 编辑和浮层保留自己的滚动，不吞掉输入操作。
      if (event.target instanceof Element && event.target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? grid.clientHeight : 1;
      const delta = event.deltaY * unit;
      if (!Number.isFinite(delta) || delta === 0) return;
      event.preventDefault();

      const state = motion.current;
      const now = performance.now();
      if (now < state.lockedUntil) return;

      if (!state.collapsed) {
        resetResistance();
        if (delta > 0) switchDetails(true);
        else surface!.scrollTo({ top: 0, behavior: "instant" });
        return;
      }

      if (delta > 0 || grid.scrollTop > 1) {
        resetResistance();
        // 到顶的这一笔只负责回到首排，剩余滚动量不用于展开详情。
        grid.scrollBy({ top: delta, behavior: "instant" });
        return;
      }

      if (now - state.lastUpwardAt > 360) state.upward = 0;
      state.lastUpwardAt = now;
      // 两次明确的上滚或一小段连续触控板手势才越过顶部阻力。
      state.upward += Math.min(-delta, 70);
      if (state.upward >= 140) switchDetails(false);
    }

    // 使用可取消的原生滚轮监听，避免 React 的被动监听导致内外层同时滚动。
    surface.addEventListener("wheel", onWheel, { passive: false, capture: true });
    surface.addEventListener("pointerdown", resetResistance, true);
    surface.addEventListener("keydown", resetResistance, true);
    return () => {
      surface.removeEventListener("wheel", onWheel, true);
      surface.removeEventListener("pointerdown", resetResistance, true);
      surface.removeEventListener("keydown", resetResistance, true);
      resetResistance();
      motion.current.lockedUntil = 0;
    };
  }, [enabled, panel, preview, setCollapsed]);
}
