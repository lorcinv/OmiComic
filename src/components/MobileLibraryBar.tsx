import { t } from '../i18n';
import { useEffect, useRef } from 'react';
import Icon from "./MobileIcon";
interface Props {
  title: string; onDrawer?: () => void; drawerLabel?: string; onOptions: () => void;
  layout: 'grid' | 'list'; onLayout: () => void;
  searchOpen: boolean; query: string; onQuery: (value: string) => void; onSearch: (open: boolean) => void;
  suggestions: string[]; detail?: boolean;
}
export default function MobileLibraryBar(p: Props) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (p.searchOpen) input.current?.focus(); }, [p.searchOpen]);
  useEffect(() => { const hidden=() => {if(p.searchOpen && document.activeElement===input.current)p.onSearch(false);};window.addEventListener('omi-keyboard-hidden',hidden);return () => window.removeEventListener('omi-keyboard-hidden',hidden);},[p.searchOpen,p.onSearch]);
  return <header className={`mobile-library-bar ${p.searchOpen ? 'is-searching' : ''}`}>
    {p.searchOpen ? <>
      <Icon name="search"/>
      <input ref={input} type="search" aria-label={t("搜索漫画、名称或标签")} placeholder={t("搜索名称、标签、备注")} value={p.query} onChange={event => p.onQuery(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') input.current?.blur(); }} />
      <button className="mobile-icon-button" aria-label={t("关闭搜索")} onClick={() => p.onSearch(false)}><Icon name="close"/></button>
      {p.suggestions.length > 0 && <div className="mobile-search-suggestions">{p.suggestions.map(tag => <button key={tag} onClick={() => { const previous = p.query.replace(/(?:[^\s"]*"[^"]*|\S+)$/, '').trim(); p.onQuery(`${previous ? previous + ' ' : ''}tag:"${tag}" `); input.current?.focus(); }}># {tag}</button>)}</div>}
    </> : <>
      {p.onDrawer && <button className="mobile-icon-button" onClick={p.onDrawer} aria-label={p.drawerLabel ?? t("资源库目录")}><Icon name="menu"/></button>}
      <h1 className="mobile-library-title">{p.title}</h1>
      {!p.detail && <><button className={`mobile-icon-button ${p.query ? 'is-active' : ''}`} onClick={() => p.onSearch(true)} aria-label={t("搜索")}><Icon name="search"/></button><button className="mobile-icon-button" onClick={p.onLayout} aria-label={p.layout === 'grid' ? t("切换列表卡片") : t("切换网格卡片")}><Icon name={p.layout === 'grid' ? 'list' : 'grid'}/></button><button className="mobile-icon-button" onClick={p.onOptions} aria-label={t("显示选项")}><Icon name="more"/></button></>}
    </>}
  </header>;
}

