import { useEffect, useState } from "react";

function WindowControls() {
  const [已最大化, 设置已最大化] = useState(false);
  const [全屏状态, 设置全屏状态] = useState(false);

  useEffect(() => {
    let 已卸载 = false;
    let 状态同步定时器: number | null = null;

    const 同步窗口状态 = async (): Promise<void> => {
      const [最大化结果, 全屏结果] = await Promise.all([
        window.omicomic.isWindowMaximized(),
        window.omicomic.isFullscreen(),
      ]);
      if (已卸载) return;
      if (最大化结果.ok) 设置已最大化(最大化结果.data);
      if (全屏结果.ok) 设置全屏状态(全屏结果.data);
    };

    const 安排同步窗口状态 = (): void => {
      if (状态同步定时器 !== null) window.clearTimeout(状态同步定时器);
      状态同步定时器 = window.setTimeout(() => {
        状态同步定时器 = null;
        void 同步窗口状态();
      }, 140);
    };

    void 同步窗口状态();
    window.addEventListener("resize", 安排同步窗口状态);
    return () => {
      已卸载 = true;
      if (状态同步定时器 !== null) window.clearTimeout(状态同步定时器);
      window.removeEventListener("resize", 安排同步窗口状态);
    };
  }, []);

  if (全屏状态) return null;

  return (
    <div className="window-controls" role="group" aria-label="窗口操作">
      <button
        type="button"
        className="window-control-button"
        aria-label="最小化窗口"
        title="最小化"
        onClick={() => window.omicomic.minimizeWindow()}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3 8h10" />
        </svg>
      </button>
      <button
        type="button"
        className="window-control-button"
        aria-label={已最大化 ? "还原窗口" : "最大化窗口"}
        title={已最大化 ? "还原" : "最大化"}
        onClick={() => {
          void window.omicomic.toggleMaximizeWindow().then((结果) => {
            if (结果.ok) 设置已最大化(结果.data);
          });
        }}
      >
        {已最大化 ? (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="5" y="3" width="8" height="8" rx="0.5" />
            <path d="M11 11v2H3V5h2" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <rect x="3" y="3" width="10" height="10" rx="0.5" />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="window-control-button window-control-close"
        aria-label="关闭窗口"
        title="关闭"
        onClick={() => window.omicomic.closeWindow()}
      >
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="m4 4 8 8M12 4l-8 8" />
        </svg>
      </button>
    </div>
  );
}

export default WindowControls;
