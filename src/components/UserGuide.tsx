import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useUiLanguage } from '../i18n';
import useMobileLayout from '../hooks/useMobileLayout';
import data from '../content/user-guide.json';
import '../styles/user-guide.css';

type Localized = readonly string[];
type Topic = { id: string; title: Localized; platform?: string; body?: Localized; pc?: Localized; android?: Localized; rows?: { label: Localized; text: Localized }[] };
type Section = { id: string; title: Localized; topics: Topic[] };
const sections: Section[] = data.sections;

export default function UserGuide({ onBack }: { onBack: () => void }) {
  const mobile = useMobileLayout();
  const language = useUiLanguage(mobile);
  const column = language === 'en' ? 1 : language === 'ja' ? 2 : 0;
  const text = (value: Localized) => value[column] ?? value[0];
  const [platform, setPlatform] = useState<'pc' | 'android'>(mobile ? 'android' : 'pc');
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const root = useRef<HTMLElement>(null);
  const normalize = (value: string) => value.normalize('NFKC').toLocaleLowerCase();
  const words = normalize(query).trim().split(/\s+/).filter(Boolean);
  const matches = (section: Section, topic: Topic) => {
    const body = [section.title, topic.title, topic.body, topic[platform], ...topic.rows?.flatMap(row => [row.label, row.text]) ?? []];
    const haystack = normalize(body.filter(Boolean).map(value => text(value!)).join(' '));
    return words.every(word => haystack.includes(word));
  };
  const visible = sections.map(section => ({ ...section, topics: section.topics.filter(topic => (!topic.platform || topic.platform === platform) && matches(section, topic)) })).filter(section => section.topics.length);

  useLayoutEffect(() => {
    const scroll = root.current?.closest('.settings-window-content, .mobile-settings-body');
    if (scroll) scroll.scrollTop = 0;
    root.current?.focus({ preventScroll: true });
  }, []);
  useEffect(() => {
    const back = (event: Event) => { event.preventDefault(); event.stopImmediatePropagation(); onBack(); };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[role="listbox"]')) back(event);
    };
    window.addEventListener('omi-guide-back', back);
    window.addEventListener('keydown', key, true);
    return () => { window.removeEventListener('omi-guide-back', back); window.removeEventListener('keydown', key, true); };
  }, [onBack]);

  const jump = (id: string) => {
    setQuery(''); setExpanded(new Set([id]));
    requestAnimationFrame(() => {
      const section = root.current?.querySelector<HTMLElement>(`#guide-${id}`);
      section?.scrollIntoView({ block: 'start' });
      section?.querySelector('summary')?.focus({ preventScroll: true });
    });
  };
  return <section className="omi-guide" ref={root} tabIndex={-1} aria-label={text(data.ui.title)}>
    <button type="button" className="omi-guide__back" onClick={onBack}>‹ {text(data.ui.back)}</button>
    <header className="omi-guide__heading"><h3>{text(data.ui.title)}</h3></header>
    <div className="omi-guide__tools">
      <div className="omi-guide__platform" role="group" aria-label={text(data.ui.platform)}>
        {(['pc', 'android'] as const).map(value => <button type="button" key={value} aria-pressed={platform === value} onClick={() => { setPlatform(value); setExpanded(new Set()); }}>{value === 'pc' ? 'Windows' : 'Android'}</button>)}
      </div>
      <div className="omi-guide__search">
        <input type="search" aria-label={text(data.ui.search)} placeholder={text(data.ui.placeholder)} value={query} onChange={event => setQuery(event.target.value)} />
        {query && <button type="button" aria-label={text(data.ui.clear)} onClick={() => setQuery('')}>×</button>}
      </div>
    </div>
    <nav className="omi-guide__contents" aria-label={text(data.ui.contents)}>{sections.map(section => <button type="button" key={section.id} onClick={() => jump(section.id)}>{text(section.title)}</button>)}</nav>
    <div className="omi-guide__sections">
      {visible.map(section => <details key={`${section.id}-${platform}`} id={`guide-${section.id}`} className="omi-guide__group" open={words.length > 0 || expanded.has(section.id)} onToggle={event => {
        if (event.target !== event.currentTarget || words.length) return;
        const open = event.currentTarget.open;
        setExpanded(previous => { if (previous.has(section.id) === open) return previous; const next = new Set(previous); if (open) next.add(section.id); else next.delete(section.id); return next; });
      }}>
        <summary>{text(section.title)}</summary>
        <div className="omi-guide__topics">{section.topics.map(topic => <details className="omi-guide__topic" key={`${topic.id}-${platform}-${words.length > 0}`} open={words.length > 0 ? true : undefined}>
          <summary>{text(topic.title)}</summary>
          <div className="omi-guide__answer">
            {topic.body && <p>{text(topic.body)}</p>}
            {topic[platform] && <p>{text(topic[platform])}</p>}
            {topic.rows && <dl>{topic.rows.map((row, index) => <div key={index}><dt>{text(row.label)}</dt><dd>{text(row.text)}</dd></div>)}</dl>}
          </div>
        </details>)}</div>
      </details>)}
      {!visible.length && <p className="omi-guide__empty" role="status">{text(data.ui.empty)}</p>}
    </div>
  </section>;
}
