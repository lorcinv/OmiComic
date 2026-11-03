import { useLayoutEffect, useRef, type HTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

/** Keep grouped menus on-screen after localization or a selection changes their height. */
export default function ContextMenu(props: HTMLAttributes<HTMLDivElement>) {
  const menu = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = menu.current;
    if (!element) return;
    const bounds = element.getBoundingClientRect();
    const x = Number(props.style?.left) || 0, y = Number(props.style?.top) || 0;
    element.style.left = `${Math.max(8, Math.min(x, innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(y, innerHeight - bounds.height - 8))}px`;
  });
  return createPortal(<div {...props} ref={menu} />, document.body);
}
