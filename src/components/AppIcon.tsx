import type { CSSProperties } from 'react';

export type AppIconName = 'menu' | 'search' | 'grid' | 'list' | 'more' | 'dots' | 'close' | 'back' | 'next' | 'chevron' | 'rename' | 'info' | 'shelf' | 'delete' | 'select' | 'pin' | 'sort' | 'add' | 'move' | 'remove' | 'cover' | 'reset' | 'refresh' | 'settings' | 'library' | 'heart' | 'bookmark' | 'history' | 'open-folder' | 'shuffle' | 'temporary';
const paths: Record<Exclude<AppIconName, 'more' | 'dots'>, string> = {
  shuffle: 'M3 5h3c5 0 7 14 12 14h3m-4-4 4 4-4 3M3 19h3c2 0 4-3 6-7m3-5c1-1 2-2 3-2h3m-4-3 4 3-4 4',
  temporary: 'M3.6 6h16.8l1.2 13.2H2.4L3.6 6Zm-.6 8.4h5.4l1.8 2.4h3.6l1.8-2.4H21M8.4 3.6h7.2',
  menu: 'M4 6h16M4 12h16M4 18h16', search: 'm16 16 4 4M17.5 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0',
  grid: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z', list: 'M4 5h4v5H4zM4 14h4v5H4zM12 6h8M12 9h6M12 15h8M12 18h6',
  close: 'm6 6 12 12M6 18 18 6', back: 'm10 5-7 7 7 7M3 12h18', next: 'm14 5 7 7-7 7M21 12H3', chevron: 'm9 5 7 7-7 7',
  rename: 'm14 5 5 5M4 20l5-1L20 8a2 2 0 0 0-4-4L5 15z', info: 'M12 10v7M12 7h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  shelf: 'M4 5.5h5v13H4zM10.5 5.5h4v13h-4zm5.3.8 3.4-.9 3 11.9-3.4.9zM3 19.5h18', delete: 'M3 6h18M9 6V3h6v3M6 6l1 14h10l1-14M10 10v6M14 10v6',
  select: 'M9 4H5a1 1 0 0 0-1 1v4M15 4h4a1 1 0 0 1 1 1v4M4 15v4a1 1 0 0 0 1 1h4M20 15v4a1 1 0 0 1-1 1h-4m-7-8 3 3 6-6',
  pin: 'm8 9 1-6h6l1 6 3 4v2H5v-2zM12 15v6', sort: 'M8 4v16m-4-4 4 4 4-4M16 20V4m-4 4 4-4 4 4', add: 'M12 4v16M4 12h16',
  move: 'M4 5h6l2 3h8v12H4zM8 14h8m-3-3 3 3-3 3', remove: 'M4 5h6l2 3h8v12H4zM8 14h8',
  'open-folder': 'M4 5h6l2 3h8v12H4zM15 14a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  cover: 'M4 4h16v16H4zM4 16l5-5 4 4 3-3 4 4M14 8h.01', reset: 'M4 4v6h6M4 10a8 8 0 1 1 1 7', refresh: 'M20 4v6h-6M4 20v-6h6M4 10a8 8 0 0 1 14-5l2 5M4 14l2 5a8 8 0 0 0 14-5',
  settings: 'M5 4v16M12 4v16M19 4v16M2 9h6M9 15h6M16 7h6', library: 'M3 5h7l2 2 2-2h7v15h-7l-2 1-2-1H3zM12 7v14',
  heart: 'M12 20 4 12a5 5 0 0 1 8-6 5 5 0 0 1 8 6z', bookmark: 'M6 4h12v17l-6-4-6 4z', history: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M12 7v5l3 2',
};
export default function AppIcon({ name, style, className = "" }: { name: AppIconName; style?: CSSProperties; className?: string }) {
  return <svg className={`mobile-svg-icon app-svg-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === 'shelf' ? 1.8 : 1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}>
    {name === 'more' || name === 'dots' ? [5,12,19].map(n => <circle key={n} cx={name === 'more' ? 12 : n} cy={name === 'more' ? n : 12} r="1.5" fill="currentColor" stroke="none"/>) : <path d={paths[name]}/>}
  </svg>;
}
