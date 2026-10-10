import { useLayoutEffect, useRef, type CSSProperties } from "react";

export default function ReaderCanvas({ canvas, title, style }: { canvas: HTMLCanvasElement; title: string; style: CSSProperties }) {
  const host = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    canvas.className = "reader-image reader-pdf-canvas";
    canvas.style.cssText = "display:block;width:100%;height:100%;";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", title);
    host.current?.append(canvas);
    return () => canvas.remove();
  }, [canvas, title]);
  return <div className="reader-canvas" ref={host} style={{ ...style, flex: "0 0 auto" }} />;
}
