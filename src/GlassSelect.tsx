import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from "react";

export type GlassSelectValue = string | number;

export interface GlassSelectOption<T extends GlassSelectValue> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface GlassSelectProps<T extends GlassSelectValue> {
  value: T;
  options: readonly GlassSelectOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  title?: string;
  disabled?: boolean;
  className?: string;
}

interface 下拉位置 {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
  placement: "top" | "bottom";
}

const 下拉边距 = 8;
const 下拉间距 = 6;
const 下拉最大高度 = 280;
const 下拉最小宽度 = 164;
const 键入搜索重置延迟 = 650;

function 值相同(左值: GlassSelectValue, 右值: GlassSelectValue): boolean {
  return typeof 左值 === typeof 右值 && Object.is(左值, 右值);
}

export default function GlassSelect<T extends GlassSelectValue>({
  value,
  options,
  onChange,
  ariaLabel,
  title,
  disabled = false,
  className = "",
}: GlassSelectProps<T>) {
  const [已打开, 设置已打开] = useState(false);
  const [活动索引, 设置活动索引] = useState(0);
  const [下拉位置, 设置下拉位置] = useState<下拉位置 | null>(null);
  const 触发按钮 = useRef<HTMLButtonElement>(null);
  const 下拉菜单 = useRef<HTMLDivElement>(null);
  const 键入搜索 = useRef({ 内容: "", 时间: 0 });
  const 触发Id = useId();
  const 列表Id = useId();
  const 选中索引 = useMemo(() => {
    const 索引 = options.findIndex((选项) => 值相同(选项.value, value));
    if (索引 >= 0) return 索引;
    const 首个可用索引 = options.findIndex((选项) => !选项.disabled);
    return 首个可用索引 >= 0 ? 首个可用索引 : 0;
  }, [options, value]);
  const 选中选项 = options[选中索引];
  const 没有可用选项 = options.length === 0 || options.every((选项) => 选项.disabled);
  const 实际禁用 = disabled || 没有可用选项;

  function 获取可用索引(起始索引: number, 方向: 1 | -1): number {
    if (options.length === 0) return -1;
    let 索引 = 起始索引;
    for (let 次数 = 0; 次数 < options.length; 次数 += 1) {
      索引 = (索引 + 方向 + options.length) % options.length;
      if (!options[索引]?.disabled) return 索引;
    }
    return -1;
  }

  function 计算下拉位置(): 下拉位置 | null {
    const 按钮 = 触发按钮.current;
    if (!按钮) return null;
    const 矩形 = 按钮.getBoundingClientRect();
    const 视口 = window.visualViewport;
    const 视口左侧 = 视口?.offsetLeft ?? 0;
    const 视口顶部 = 视口?.offsetTop ?? 0;
    const 视口宽度 = 视口?.width ?? window.innerWidth;
    const 视口高度 = 视口?.height ?? window.innerHeight;
    const 视口右侧 = 视口左侧 + 视口宽度;
    const 视口底部 = 视口顶部 + 视口高度;
    const 估算内容高度 = Math.max(46, options.length * 36 + 12);
    const 下方空间 = Math.max(0, 视口底部 - 矩形.bottom - 下拉间距 - 下拉边距);
    const 上方空间 = Math.max(0, 矩形.top - 视口顶部 - 下拉间距 - 下拉边距);
    const 下方足够 = 下方空间 >= Math.min(估算内容高度, 下拉最大高度);
    const 向上展开 = !下方足够 && 上方空间 > 下方空间;
    const 可用高度 = 向上展开 ? 上方空间 : 下方空间;
    const maxHeight = Math.max(0, Math.min(下拉最大高度, 可用高度));
    const 实际高度 = Math.min(估算内容高度, maxHeight);
    const 视口可用宽度 = Math.max(0, 视口宽度 - 下拉边距 * 2);
    const width = Math.min(
      Math.max(矩形.width, 下拉最小宽度),
      视口可用宽度,
    );
    const left = Math.min(
      Math.max(矩形.left, 视口左侧 + 下拉边距),
      Math.max(视口左侧 + 下拉边距, 视口右侧 - 下拉边距 - width),
    );
    const top = 向上展开
      ? Math.max(视口顶部 + 下拉边距, 矩形.top - 下拉间距 - 实际高度)
      : Math.min(视口底部 - 下拉边距 - 实际高度, 矩形.bottom + 下拉间距);
    return { left, top, width, maxHeight, placement: 向上展开 ? "top" : "bottom" };
  }

  function 更新下拉位置(): void {
    const 新位置 = 计算下拉位置();
    if (!新位置) return;
    设置下拉位置((原位置) => (
      原位置
      && 原位置.left === 新位置.left
      && 原位置.top === 新位置.top
      && 原位置.width === 新位置.width
      && 原位置.maxHeight === 新位置.maxHeight
      && 原位置.placement === 新位置.placement
        ? 原位置
        : 新位置
    ));
  }

  function 打开下拉(初始索引 = 选中索引): void {
    if (实际禁用) return;
    const 可用索引 = options[初始索引] && !options[初始索引].disabled
      ? 初始索引
      : 获取可用索引(-1, 1);
    if (可用索引 < 0) return;
    设置活动索引(可用索引);
    设置下拉位置(计算下拉位置());
    设置已打开(true);
  }

  function 关闭下拉(): void {
    设置已打开(false);
    键入搜索.current = { 内容: "", 时间: 0 };
  }

  function 选择选项(索引: number): void {
    const 选项 = options[索引];
    if (!选项 || 选项.disabled) return;
    if (!值相同(选项.value, value)) onChange(选项.value);
    关闭下拉();
    window.requestAnimationFrame(() => 触发按钮.current?.focus());
  }

  function 处理按键(事件: ReactKeyboardEvent<HTMLButtonElement>): void {
    if (实际禁用) return;
    if (事件.key === "ArrowDown" || 事件.key === "ArrowUp") {
      事件.preventDefault();
      const 方向 = 事件.key === "ArrowDown" ? 1 : -1;
      if (!已打开) {
        打开下拉();
        return;
      }
      const 下一索引 = 获取可用索引(活动索引, 方向);
      if (下一索引 >= 0) 设置活动索引(下一索引);
      return;
    }
    if (事件.key === "Home" || 事件.key === "End") {
      if (!已打开) return;
      事件.preventDefault();
      const 起点 = 事件.key === "Home" ? -1 : 0;
      const 方向 = 事件.key === "Home" ? 1 : -1;
      const 下一索引 = 获取可用索引(起点, 方向);
      if (下一索引 >= 0) 设置活动索引(下一索引);
      return;
    }
    if (事件.key === "Enter" || 事件.key === " ") {
      事件.preventDefault();
      if (已打开) 选择选项(活动索引);
      else 打开下拉();
      return;
    }
    if (事件.key === "Escape" && 已打开) {
      事件.preventDefault();
      事件.stopPropagation();
      关闭下拉();
      return;
    }
    if (事件.key === "Tab" && 已打开) {
      关闭下拉();
      return;
    }
    if (
      事件.key.length === 1
      && !事件.ctrlKey
      && !事件.altKey
      && !事件.metaKey
      && !/^\s$/u.test(事件.key)
    ) {
      const 当前时间 = performance.now();
      const 原搜索 = 当前时间 - 键入搜索.current.时间 <= 键入搜索重置延迟
        ? 键入搜索.current.内容
        : "";
      const 新搜索 = `${原搜索}${事件.key}`.toLocaleLowerCase("zh-CN");
      键入搜索.current = { 内容: 新搜索, 时间: 当前时间 };
      const 起始索引 = 已打开 ? 活动索引 : 选中索引;
      let 匹配索引 = -1;
      for (let 偏移 = 1; 偏移 <= options.length; 偏移 += 1) {
        const 索引 = (起始索引 + 偏移) % options.length;
        const 选项 = options[索引];
        if (!选项?.disabled && 选项.label.toLocaleLowerCase("zh-CN").startsWith(新搜索)) {
          匹配索引 = 索引;
          break;
        }
      }
      if (匹配索引 >= 0) {
        事件.preventDefault();
        if (!已打开) 打开下拉(匹配索引);
        else 设置活动索引(匹配索引);
      }
    }
  }

  useLayoutEffect(() => {
    if (!已打开) return;
    更新下拉位置();
  }, [已打开, options.length]);

  useLayoutEffect(() => {
    if (!已打开 || 活动索引 < 0) return;
    const 动画帧 = window.requestAnimationFrame(() => {
      const 活动选项 = 下拉菜单.current?.querySelector<HTMLElement>(`[data-option-index="${活动索引}"]`);
      活动选项?.scrollIntoView({ block: "nearest" });
    });
    return () => window.cancelAnimationFrame(动画帧);
  }, [已打开, 活动索引]);

  useEffect(() => {
    if (!已打开) return;

    function 处理外部点击(事件: PointerEvent): void {
      const 目标 = 事件.target;
      if (!(目标 instanceof Node)) return;
      if (触发按钮.current?.contains(目标) || 下拉菜单.current?.contains(目标)) return;
      关闭下拉();
    }

    function 处理外部焦点(事件: FocusEvent): void {
      const 目标 = 事件.target;
      if (!(目标 instanceof Node)) return;
      if (触发按钮.current?.contains(目标) || 下拉菜单.current?.contains(目标)) return;
      关闭下拉();
    }

    let 位置动画帧: number | null = null;
    function 处理窗口变化(): void {
      if (位置动画帧 !== null) return;
      位置动画帧 = window.requestAnimationFrame(() => {
        位置动画帧 = null;
        更新下拉位置();
      });
    }

    function 处理窗口失焦(): void {
      关闭下拉();
    }

    document.addEventListener("pointerdown", 处理外部点击, true);
    document.addEventListener("focusin", 处理外部焦点, true);
    window.addEventListener("resize", 处理窗口变化);
    window.addEventListener("scroll", 处理窗口变化, true);
    window.addEventListener("blur", 处理窗口失焦);
    window.visualViewport?.addEventListener("resize", 处理窗口变化);
    window.visualViewport?.addEventListener("scroll", 处理窗口变化);
    const 尺寸观察器 = new ResizeObserver(处理窗口变化);
    if (触发按钮.current) 尺寸观察器.observe(触发按钮.current);
    return () => {
      document.removeEventListener("pointerdown", 处理外部点击, true);
      document.removeEventListener("focusin", 处理外部焦点, true);
      window.removeEventListener("resize", 处理窗口变化);
      window.removeEventListener("scroll", 处理窗口变化, true);
      window.removeEventListener("blur", 处理窗口失焦);
      window.visualViewport?.removeEventListener("resize", 处理窗口变化);
      window.visualViewport?.removeEventListener("scroll", 处理窗口变化);
      尺寸观察器.disconnect();
      if (位置动画帧 !== null) window.cancelAnimationFrame(位置动画帧);
    };
  }, [已打开, options.length]);

  useEffect(() => {
    if (实际禁用 && 已打开) 关闭下拉();
  }, [实际禁用, 已打开]);

  useEffect(() => {
    if (!已打开) return;
    if (options[活动索引] && !options[活动索引].disabled) return;
    const 下一索引 = options[选中索引] && !options[选中索引].disabled
      ? 选中索引
      : 获取可用索引(-1, 1);
    if (下一索引 < 0) 关闭下拉();
    else 设置活动索引(下一索引);
  }, [已打开, 活动索引, options, 选中索引]);

  const 下拉样式: CSSProperties | undefined = 下拉位置
    ? {
        left: 下拉位置.left,
        top: 下拉位置.top,
        width: 下拉位置.width,
        maxHeight: 下拉位置.maxHeight,
      }
    : undefined;

  return (
    <div className={`glass-select ${className}`.trim()}>
      <button
        ref={触发按钮}
        id={触发Id}
        type="button"
        role="combobox"
        className="glass-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={已打开}
        aria-controls={已打开 ? 列表Id : undefined}
        aria-activedescendant={已打开 && options[活动索引] ? `${列表Id}-option-${活动索引}` : undefined}
        title={title}
        disabled={实际禁用}
        onClick={() => 已打开 ? 关闭下拉() : 打开下拉()}
        onKeyDown={处理按键}
      >
        <span className="glass-select-label">{选中选项?.label ?? String(value)}</span>
        <span className="root-library-chevron" aria-hidden="true" />
      </button>
      {已打开 && 下拉位置 && createPortal(
        <div
          ref={下拉菜单}
          id={列表Id}
          className="glass-select-options is-portal"
          data-placement={下拉位置.placement}
          style={下拉样式}
          role="listbox"
          aria-labelledby={触发Id}
        >
          {options.map((选项, 索引) => (
            <button
              id={`${列表Id}-option-${索引}`}
              type="button"
              role="option"
              tabIndex={-1}
              aria-selected={值相同(选项.value, value)}
              aria-disabled={选项.disabled || undefined}
              data-option-index={索引}
              className={`glass-select-option ${值相同(选项.value, value) ? "is-active" : ""} ${活动索引 === 索引 ? "is-highlighted" : ""}`}
              key={`${typeof 选项.value}:${String(选项.value)}`}
              disabled={选项.disabled}
              onPointerDown={(事件) => 事件.preventDefault()}
              onPointerEnter={() => {
                if (!选项.disabled) 设置活动索引(索引);
              }}
              onClick={() => 选择选项(索引)}
            >
              <span>{选项.label}</span>
              {值相同(选项.value, value) && <span className="glass-select-check" aria-hidden="true">✓</span>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}
