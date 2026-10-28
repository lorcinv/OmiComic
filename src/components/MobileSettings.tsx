import { t } from '../i18n';
import { setUiLanguage, normalizeLanguage, uiOptions } from '../i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { AppSettings, AndroidCacheInfo, MobileDisplayScope } from '../types';
import { getMobileDisplay, mobileDisplayLabels, patchMobileDisplay } from '../library/mobileDisplay';
import { clearResourceThumbnailCache } from '../reader/thumbnailClient';
import GlassSelect from '../GlassSelect';
import MobileIcon, { type MobileIconName } from './MobileIcon';
import AboutOmiComic from './AboutOmiComic';
import { mobileNavigate } from '../hooks/mobileNavigation';
import { useMobileScrim } from '../hooks/mobileScrim';

const categories: Array<{id:string;title:string;note:string;icon:MobileIconName}> = [
  {id:'appearance',title:'外观与主题',note:'配色、卡片布局与缩略预览',icon:'grid'},
  {id:'library',title:'资源库',note:'分页、排序与最近阅读',icon:'library'},
  {id:'reading',title:'默认阅读',note:'阅读方式、双页与音量键',icon:'bookmark'},
  {id:'book',title:'漫画阅读设置',note:'页面排序与自动阅读速度',icon:'shelf'},
  {id:'performance',title:'性能与缓存',note:'图片缓存、预加载与并发',icon:'settings'},
  {id:'safety',title:'安全与确认',note:'收藏、书签和历史删除确认',icon:'select'},
  {id:'about',title:'关于 OmiComic',note:'版本、介绍与操作说明',icon:'info'},
];
export default function MobileSettings({ settings, onSaved, onClose, bookSettings, displayScope = 'directory' }: { settings:AppSettings; onSaved:(s:AppSettings)=>void; onClose:()=>void; bookSettings:ReactNode; displayScope?:MobileDisplayScope }) {
  useMobileScrim();
  const [category,setCategory]=useState(''), [value,setValue]=useState(settings), [error,setError]=useState('');
  const [displayPage,setDisplayPage]=useState<MobileDisplayScope>(displayScope);
  const display=getMobileDisplay(value,displayPage);
  const [cacheInfo,setCacheInfo]=useState<AndroidCacheInfo|null>(null), [clearing,setClearing]=useState(false);
  useEffect(() => { let cancelled=false; if(category==='performance')void queue.current.then(()=>window.omicomic.getAndroidCacheInfo?.()).then(r=>{if(!cancelled&&r?.ok)setCacheInfo(r.data);}).catch(()=>{});return()=>{cancelled=true;}; },[category,value.androidReaderDiskCacheSizeMb,value.androidThumbnailCacheSizeMb]);
  const queue=useRef(Promise.resolve()), mounted=useRef(true);
  useEffect(() => {mounted.current=true;return () => {mounted.current=false;};},[]);
  const back=() => {
    if (!window.dispatchEvent(new Event('omi-guide-back', { cancelable: true }))) return;
    return category ? void mobileNavigate(()=>setCategory(''),'back') : onClose();
  };
  useEffect(() => { const listener=(event:Event) => {if(document.querySelector('[role="listbox"]')) return;event.preventDefault();event.stopImmediatePropagation();back();};const key=(event:KeyboardEvent) => {if(event.key==='Escape')listener(event);};window.addEventListener('omi-library-back',listener,true);window.addEventListener('keydown',key,true);return () => {window.removeEventListener('omi-library-back',listener,true);window.removeEventListener('keydown',key,true);};});
  function save(patch:Partial<AppSettings>) { setValue(old => ({...old,...patch})); queue.current=queue.current.then(async () => {const result=await window.omicomic.updateSettings(patch);if(result.ok){setUiLanguage(result.data.language);if(patch.showHomePage!==undefined)window.dispatchEvent(new CustomEvent('omi-home-visibility-changed',{detail:result.data.showHomePage!==false}));onSaved(result.data);}else if(mounted.current)setError(result.error.message);}).catch(() => {if(mounted.current)setError('设置保存失败，请重试。');}); }
  function select<K extends keyof AppSettings>(key:K,label:string,options:Array<{value:string|number;label:string}>,fallback?:string|number) {return <div className="settings-row"><span>{label}</span><GlassSelect ariaLabel={label} value={(value[key] as string|number) ?? fallback ?? ''} options={uiOptions(options)} onChange={v => save({[key]:v} as Partial<AppSettings>)}/></div>;}
  function toggle<K extends keyof AppSettings>(key:K,label:string) {return <label className="settings-toggle"><span>{label}</span><input type="checkbox" checked={Boolean(value[key])} onChange={event => save({[key]:event.target.checked})}/></label>;}
  function range<K extends keyof AppSettings>(key:K,label:string,min:number,max:number,step:number,fallback:number,unit='') {const shown=Math.min(max,Math.max(min,Number(value[key] ?? fallback)));return <label className="mobile-option-row"><span>{label}<output>{shown}{t(unit)}</output></span><input type="range" aria-label={label} min={min} max={max} step={step} value={shown} onChange={event => save({[key]:Number(event.target.value)})}/></label>;}
  return createPortal(<div className="settings-window-overlay mobile-settings-surface"><section className="mobile-settings-page" role="dialog" aria-modal="true" aria-label={t("设置")}>
    <header><button className="mobile-icon-button" aria-label={category?t("返回设置"):t("关闭设置")} onClick={back}><MobileIcon name="back"/></button><h2>{categories.find(item=>item.id===category)?.title ? t(categories.find(item=>item.id===category)!.title) : t("设置")}</h2></header>
    <div className="mobile-settings-body">{!category ? <nav aria-label={t("设置分类")}>{categories.map(item => <button key={item.id} className="mobile-setting-category" onClick={() => void mobileNavigate(() => setCategory(item.id))}><MobileIcon name={item.icon}/><span><strong>{t(item.title)}</strong><small>{t(item.note)}</small></span><MobileIcon name="chevron"/></button>)}</nav> : <>
      {category==='appearance' && <>
        <label className="settings-toggle"><span>{t("显示主界面")}</span><input type="checkbox" checked={value.showHomePage !== false} onChange={event => save({showHomePage:event.target.checked})}/></label>
        <div className="settings-row"><span>{t('语言 / Language')}</span><GlassSelect ariaLabel="语言 / Language" value={normalizeLanguage(value.language)} options={[{value:'zh-CN',label:'简体中文'},{value:'en',label:'English'},{value:'ja',label:'日本語'}]} onChange={language=>save({language:normalizeLanguage(language)})}/></div>
        {select('colorTheme',t("界面主题"),[{value:'mist',label:'雾蓝'},{value:'nord',label:'北境'},{value:'sand',label:'暖沙'},{value:'night',label:'夜色'}])}
        <div className="settings-row"><span>{t("显示设置页面")}</span><GlassSelect ariaLabel={t("显示设置页面")} value={displayPage} options={uiOptions(Object.entries(mobileDisplayLabels).map(([key,label])=>({value:key as MobileDisplayScope,label})))} onChange={setDisplayPage}/></div>
        <div className="settings-row"><span>{t("卡片布局")}</span><GlassSelect ariaLabel={t("卡片布局")} value={display.layout} options={uiOptions([{value:'grid' as const,label:'网格'},{value:'list' as const,label:'缩略图与说明'}])} onChange={layout=>save(patchMobileDisplay(value,displayPage,{layout}))}/></div>
        <label className="mobile-option-row"><span>{t("网格列数")}<output>{display.columns}</output></span><input type="range" aria-label={t("网格列数")} min="2" max="6" step="1" value={display.columns} onChange={event=>save(patchMobileDisplay(value,displayPage,{columns:Number(event.target.value)}))}/></label>
        <label className="mobile-option-row"><span>{t("列表封面尺寸")}<output>{display.coverSize} px</output></span><input type="range" aria-label={t("列表封面尺寸")} min="64" max="132" step="4" value={display.coverSize} onChange={event=>save(patchMobileDisplay(value,displayPage,{coverSize:Number(event.target.value)}))}/></label>
        {range('mobilePreviewWidth',t("缩略预览行宽"),64,144,8,88,' px')}
      </>}
      {category==='library' && <>
        {select('tagSearchMode',t("多条件匹配方式"),[{value:'fuzzy',label:'任一条件'},{value:'exact',label:'全部条件'}],'fuzzy')}
        {toggle('searchSplitSpaces',t("空格分隔搜索条件"))}
        <p className="settings-hint">{t("默认保留关键词中的空格。开启后，空格分隔的条件必须同时满足。")}</p>
        <p className="settings-hint">{t("逗号分隔条件；| 表示满足任一条件。此设置也控制多个标签的筛选关系。")}</p>
        {select('mobilePageSize',t("每页数量"),[50,100,150,200,500].map(n=>({value:n,label:String(n)})),50)}
        {select('sortMode',t("资源库默认排序"),[{value:'name-asc',label:'名称升序'},{value:'name-desc',label:'名称降序'},{value:'time-desc',label:'最新修改'},{value:'time-asc',label:'最早修改'},{value:'type',label:'资源类型'}])}
        {toggle('folderFirst',t("文件夹优先"))}{toggle('hideBookshelfItemsInLibrary',t("资源库隐藏已加入书架的资源"))}
        {select('recentOpenedLimit',t("最近阅读记录上限"),[50,100,150,200].map(n=>({value:n,label:String(n)})))}
      </>}
      {category==='reading' && <>

        <div className="settings-row"><span>{t("打开漫画时的缩放")}</span><strong>{t("适应窗口")}</strong></div>
        {toggle('readerDefaultPanorama',t("默认开启全景模式"))}
        {select('readerDefaultFlow',t("默认阅读流向"),[{value:'horizontal',label:'横向'},{value:'vertical',label:'纵向'}])}
        {select('readerPageMode',t("默认单双页"),[{value:'single',label:'单页'},{value:'double',label:'双页'}])}
        {select('doublePageDirection',t("默认翻页方向"),[{value:'left-to-right',label:'从左到右'},{value:'right-to-left',label:'从右到左'}])}
        {toggle('doublePageFirstSingle',t("封面单独显示"))}{toggle('smartDetectSpreadPage',t("智能识别跨页图"))}
        {toggle('readerVolumeKeys',t("音量键翻页"))}{toggle('readerVolumeKeysReversed',t("反转音量键翻页方向"))}
        {range('readerVolumePanoramaPages',t("全景音量键翻页间隔"),.25,2,.25,1,' 页')}
      </>}
      {category==='book' && <>
        <label className="settings-toggle"><span>{t('阅读工具栏 3 秒自动隐藏')}</span><input type="checkbox" checked={value.mobileReaderAutoHide !== false} onChange={event=>save({mobileReaderAutoHide:event.target.checked})}/></label>
        {bookSettings}
      </>}
      {category==='performance' && <>
        {range('androidReaderDiskCacheSizeMb',t("阅读页面磁盘缓存"),0,2048,128,512,' MB')}
        {range('androidThumbnailCacheSizeMb',t("封面与预览磁盘缓存"),64,512,64,128,' MB')}
        {cacheInfo && <p className="settings-hint">{t("已用：阅读 ")}{(cacheInfo.readerBytes/1048576).toFixed(1)}{t(" MB · 封面 ")}{(cacheInfo.thumbnailBytes/1048576).toFixed(1)} MB</p>}
        {window.omicomic.clearAndroidReadCache && <button type="button" className="secondary-action" disabled={clearing} onClick={async()=>{setClearing(true);try{await queue.current;const r=await window.omicomic.clearAndroidReadCache!();if(r.ok){clearResourceThumbnailCache();setCacheInfo(r.data);}else setError(r.error.message);}catch{setError('缓存清理失败，请重试。');}finally{setClearing(false);}}}>{clearing?t("正在清理…"):t("清理磁盘缓存")}</button>}
        {range('readerMemoryCacheSizeMb',t("阅读图片内存缓存"),0,500,25,100,' MB')}
        {range('readerPreloadPages',t("预加载范围"),0,20,1,2,' 页')}
        {range('readerImageLoadConcurrency',t("图片并发加载数"),1,4,1,2)}
      </>}
      {category==='safety' && <>{(['favorites','bookmarks','recent'] as const).map((key,index) => <label className="settings-toggle" key={key}><span>{t(['删除收藏前确认','删除书签前确认','删除历史前确认'][index])}</span><input type="checkbox" checked={value.confirmBeforeBatchDelete[key]} onChange={event => save({confirmBeforeBatchDelete:{...value.confirmBeforeBatchDelete,[key]:event.target.checked}})}/></label>)}{toggle('confirmBeforeDeleteTags',t("删除标签前确认"))}</>}
      {category==='about' && <AboutOmiComic />}
    </>}{error && <p role="alert">{t(error ?? '')}</p>}</div>
  </section></div>, document.body);
}
