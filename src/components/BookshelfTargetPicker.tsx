import {t,tr} from '../i18n';
import type {Bookshelf,VirtualFolder} from '../types';
import '../styles/bookshelfPicker.css';
import PickerScrollArea from './PickerScrollArea';

export default function BookshelfTargetPicker({mobile,query,onQuery,groups,categoryId,onCategory,busy,state,onChoose,onCreateCategory,onCreateShelf}:{
  mobile:boolean;query:string;onQuery:(query:string)=>void;
  groups:Array<{bookshelf:Bookshelf;folders:VirtualFolder[];total:number}>;categoryId?:string;
  onCategory:(id:string)=>void;busy:boolean;state:(folder:VirtualFolder)=>'all'|'partial'|'none';
  onChoose:(id:string)=>void;onCreateCategory:()=>void;onCreateShelf:()=>void;
}){
  const current=groups.find(group=>group.bookshelf.id===categoryId)??groups[0];
  const search=<label className="shelf-picker-search"><span className="sr-only">{t('搜索书架')}</span><input type="search" value={query} disabled={busy} placeholder={t('搜索书架')} onChange={event=>onQuery(event.target.value)}/></label>;
  return <div className={`shelf-picker ${mobile?'is-mobile':''}`}>
    {mobile&&search}
    <section className="shelf-picker-categories shelf-picker-surface" aria-label={t('书架分类')}>
      {!mobile&&search}
      <PickerScrollArea className="shelf-picker-category-list" label="书架分类滚动条" hideScrollbar={mobile}>
        {!groups.length?<p className="drawer-muted">{t('没有匹配的书架分类。')}</p>:groups.map(group=><button key={group.bookshelf.id} type="button" disabled={busy} aria-pressed={current?.bookshelf.id===group.bookshelf.id} onMouseEnter={mobile?undefined:()=>onCategory(group.bookshelf.id)} onFocus={mobile?undefined:()=>onCategory(group.bookshelf.id)} onClick={()=>onCategory(group.bookshelf.id)}>
          <span>{group.bookshelf.name}</span><em>{group.total}</em>
        </button>)}
      </PickerScrollArea>
    </section>
    <section className="shelf-picker-books shelf-picker-surface" aria-label={t('书架')}>
      <PickerScrollArea className="shelf-picker-book-list" label="书架滚动条" hideScrollbar={mobile}>
      {!current?.folders.length?<p className="drawer-muted">{query?t('没有匹配的书架。'):t('当前书架分类暂无可加入的书架。')}</p>:current.folders.map(folder=>{
        const added=state(folder);
        return <button key={folder.id} type="button" disabled={busy||added==='all'} className={added==='all'?'is-already-added':''} onClick={()=>onChoose(folder.id)}>
          <span>{folder.name}</span><em>{added==='all'?t('已加入'):added==='partial'?tr`部分已加入 · ${folder.items.length}`:folder.items.length}</em>
        </button>;
      })}
      </PickerScrollArea>
    </section>
    <footer className="shelf-picker-actions">
      <button className="shelf-picker-surface" type="button" disabled={busy} onClick={onCreateCategory}>{t('新建书架分类')}</button>
      <button className="shelf-picker-surface" type="button" disabled={busy} onClick={onCreateShelf}>{t('新建书架并加入')}</button>
    </footer>
  </div>;
}
