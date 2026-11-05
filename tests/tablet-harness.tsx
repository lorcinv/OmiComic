import '../src/android/webviewCompat';
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from '../src/App';
import { installMock } from './mock';
import '../src/styles/theme.css';
import '../src/styles/global.css';
import '../src/styles/desktopLibrary.css';
import '../src/styles/mobile.css';
import '../src/styles/desktopTheme.css';
import '../src/styles/tagData.css';
document.documentElement.dataset.platform = 'android';
if (!window.omicomic) installMock({ count: 12 });
createRoot(document.getElementById('root')!).render(<App />);
// Explicit test entry points exercise the production document code and workers.
Object.assign(window, {
  __openTestDocument: async (type: 'pdf' | 'epub' | 'mobi',purpose:'reader'|'thumbnail'='reader',options={}) => {
    const { DocumentSource } = await import('../src/reader/documentSource');
    const key = `${type}:/test.${type}`;
    return new DocumentSource({ key, resourceKey:key, sourceType:type, sourcePath:`/test.${type}`, title:type, pages:[], total:0,...options },purpose);
  },
  __sanitizeChapter: async (...args: Parameters<typeof import('../src/android/epub').sanitizeAndroidChapter>) => (await import('../src/android/epub')).sanitizeAndroidChapter(...args),
  __mobiTest: async () => (await import('../src/reader/mobiClient')).MobiClient,
});
