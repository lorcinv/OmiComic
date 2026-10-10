import { useLayoutEffect, useRef, type CSSProperties } from "react";

export const 卡片缩放档位 = [40, 55, 75, 100, 125, 150, 200] as const;
export const 最小卡片缩放 = 40;
export const 最大卡片缩放 = 200;
export const 默认卡片缩放 = 100;

export function 规范卡片缩放(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? 卡片缩放档位[获取卡片缩放档位(value)]
    : 默认卡片缩放;
}

export function 相邻卡片缩放(value: number, direction: number): number {
  return direction > 0
    ? 卡片缩放档位.find(stop => stop > value) ?? 最大卡片缩放
    : [...卡片缩放档位].reverse().find(stop => stop < value) ?? 最小卡片缩放;
}

function 获取卡片缩放档位(value: number): number {
  return 卡片缩放档位.reduce((best, stop, next) => Math.abs(stop - value) < Math.abs(卡片缩放档位[best] - value) ? next : best, 0);
}

export function 获取卡片列数(value: number): number {
  // 兼容已经保存的缩放值；每档控制列数，由网格均分实际可用宽度。
  return 卡片缩放档位.length - 获取卡片缩放档位(value);
}

export interface CardScaleMotion {
  sequence: number;
  direction: number;
  fast: boolean;
  edge: boolean;
}

interface CardScaleControlProps {
  value: number;
  label: string;
  scope: "library" | "detail";
  className?: string;
  disabled?: boolean;
  motion?: CardScaleMotion;
  onChange: (value: number) => void;
  onCommit: () => void;
}

export default function CardScaleControl({ value, label, scope, className = "", disabled, motion, onChange, onCommit }: CardScaleControlProps) {
  const rail = useRef<HTMLDivElement>(null);
  const thumb = useRef<HTMLSpanElement>(null);
  const previous = useRef(value);
  const index = 获取卡片缩放档位(value);
  const columns = 获取卡片列数(value);
  const fill = index / (卡片缩放档位.length - 1) * 100;

  useLayoutEffect(() => {
    const changed = value !== previous.current;
    const direction = Math.sign(value - previous.current) || motion?.direction || 1;
    previous.current = value;
    if ((!changed && !motion) || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // 超出两端时短促回弹；连续切档时滑块沿操作方向拉伸、加速回落。
    const edge = !changed && motion?.edge;
    const element = edge ? rail.current : thumb.current;
    if (!element) return;
    const distance = (edge ? 5 : motion?.fast ? 7 : 4) * direction;
    const animation = element.animate([
      { transform: "translateX(0) scaleX(1)" },
      { transform: `translateX(${distance}px) scaleX(${edge ? 1 : motion?.fast ? 1.2 : 1.1})`, offset: 0.3 },
      { transform: "translateX(0) scaleX(1)" },
    ], { duration: motion?.fast ? 190 : 280, easing: "cubic-bezier(.2,.75,.3,1)" });
    return () => animation.cancel();
  }, [value, motion]);

  return (
    <div className={`card-scale-control ${className}`} role="group" aria-label={label}
      aria-disabled={disabled || undefined} data-card-scale-scope={scope}>
      <div ref={rail} className="card-scale-rail" style={{ "--scale-fill": `${fill}%` } as CSSProperties}>
        <div className="card-scale-track" aria-hidden="true">
          <span className="card-scale-fill" />
          {卡片缩放档位.map((stop, stopIndex) => <i key={stop} className={stopIndex <= index ? "is-filled" : ""}
            style={{ left: `${stopIndex / (卡片缩放档位.length - 1) * 100}%` }} />)}
          <span className="card-scale-thumb-position"><span ref={thumb} className="card-scale-thumb" /></span>
        </div>
        <input type="range" min={0} max={卡片缩放档位.length - 1} step={1} value={index}
          aria-label={label} aria-valuetext={`每行 ${columns} 张`} disabled={disabled}
          data-tooltip="缩放，支持ctrl+滚轮操作。"
          onChange={event => onChange(卡片缩放档位[Number(event.currentTarget.value)])}
          onPointerUp={onCommit} onKeyUp={onCommit} onBlur={onCommit} />
      </div>
      <output aria-hidden="true">{columns} 列</output>
    </div>
  );
}
