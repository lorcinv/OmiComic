import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import MobileReaderPreviews from '../src/components/MobileReaderPreviews';
import '../src/styles/theme.css';
import '../src/styles/global.css';
import '../src/styles/mobile.css';

document.documentElement.dataset.platform = 'android';
document.documentElement.dataset.colorTheme = 'mist';
window.omicomic = { getPageImage: async (input: { archiveInnerPath: string }) => ({ ok: true, data: { url: `/__page-preview/${input.archiveInnerPath}` } }) } as unknown as Window['omicomic'];
const pages = Array.from({ length: 500 }, (_, index) => ({ index, sourcePath: '/fixture/book.cbz', archiveInnerPath: `${index}.svg`, type: 'archive-image' as const, name: `${index}.png` }));
function Fixture() {
  const [current, setCurrent] = useState(10), [open, setOpen] = useState(true);
  return <main style={{ minHeight: '100dvh', background: '#c1cedd' }}>
    <button onClick={() => setCurrent(200)}>Seek 201</button>
    <button onClick={() => setOpen(!open)}>Toggle previews</button>
    {open && <MobileReaderPreviews pages={pages} current={current} width={96} onPage={setCurrent} />}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Fixture />);
