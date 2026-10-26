import { version } from '../../package.json';
import { useRef, useState } from 'react';
import { t } from '../i18n';
import { isAndroid } from '../platform';
import omiIcon from '../../resources/icon.svg';
import '../styles/about.css';
import UserGuide from './UserGuide';

export const OMI_GITHUB_URL = 'https://github.com/lorcinv/OmiComic';

export default function AboutOmiComic({ active = true }: { active?: boolean }) {
  const [guideOpen, setGuideOpen] = useState(false);
  const guideButton = useRef<HTMLButtonElement>(null);
  const scrollPosition = useRef(0);
  const scrollContainer = useRef<Element | null>(null);
  const closeGuide = () => {
    setGuideOpen(false);
    requestAnimationFrame(() => {
      if (scrollContainer.current) scrollContainer.current.scrollTop = scrollPosition.current;
      guideButton.current?.focus({ preventScroll: true });
    });
  };
  if (guideOpen && active) return <UserGuide onBack={closeGuide} />;
  return <div className="omi-about">
    <header className="omi-about__brand">
      <img src={omiIcon} alt="" width="72" height="72" draggable={false} />
      <div><h3>OmiComic</h3><p>Omi · {t('版本 ')}{version}</p></div>
    </header>
    <div className="omi-about__intro">
      <p>{t('OmiComic（Omi）是一款面向 Windows 和 Android 的本地漫画阅读器，让收藏、整理和阅读回到简单、专注的体验。')}</p>
      <p>{t('打开设备中的图片文件夹、ZIP／RAR／7z 压缩包、PDF 或 EPUB，离线阅读自己的收藏。用书架、收藏和标签整理资源，用书签和阅读进度接着上次的位置读下去。')}</p>
      <p>{t('单页、双页、全景、沉浸和自动阅读适应不同的阅读习惯。配色、字号和阅读方式可以自行调整，界面支持简体中文、English 和日本語。')}</p>
    </div>
    <a className="omi-about__action omi-about__github" href={OMI_GITHUB_URL} target={isAndroid() ? undefined : '_blank'} rel="noopener noreferrer">
      <strong>{t('项目主页 · GitHub')}</strong>
      <span>github.com/lorcinv/OmiComic</span>
      <span aria-hidden="true">↗</span>
    </a>
    <button type="button" ref={guideButton} className="omi-about__action omi-about__guide" onClick={() => {
      scrollContainer.current = guideButton.current?.closest('.settings-window-content, .mobile-settings-body') ?? null;
      scrollPosition.current = scrollContainer.current?.scrollTop ?? 0;
      setGuideOpen(true);
    }}>
      <strong>{t('操作说明')}</strong>
      <span>{t('按钮功能、快捷键与手机手势')}</span>
      <span aria-hidden="true">›</span>
    </button>
  </div>;
}
