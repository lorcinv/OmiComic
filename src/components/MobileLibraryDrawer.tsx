import { tr, t } from '../i18n';
import { useEffect, useRef, useState } from 'react';
import type { LibraryRoot } from '../types';
import MobileSheet, { dismissMobileSheet, MOBILE_SHEET_MOTION_MS } from './MobileSheet';
import MobileReorderList from './MobileReorderList';
import MobileIcon from './MobileIcon';

import { cachedMobileTree, loadMobileTree, type TreeNode } from '../library/mobileTreeIndex';
export { clearMobileTreeCache } from '../library/mobileTreeIndex';
export default function MobileLibraryDrawer(p: {
  roots: LibraryRoot[]; current: string | null; onOpen: (path: string, root: string) => void;
  onClose: () => void; onReorder: (keys: string[]) => void; onAdd: () => void; onFile: () => void; onManage: (root: LibraryRoot) => void;
}) {
  const [initial] = useState(() => {
    const expanded=new Set<string>(), nodes:Record<string,TreeNode[]>={};
    const root=p.roots.find(root=>p.current===root.path||p.current?.startsWith(root.path+'/')||p.current?.startsWith(root.path+'\\'));
    if(root&&p.current&&p.current!==root.path){let path=root.path;for(const part of p.current.slice(root.path.length).split(/[\\/]/).filter(Boolean)){expanded.add(path);path+=(root.path.includes('\\')?'\\':'/')+part;}}
    const paths=new Set([...p.roots.map(root=>root.path),...expanded]);
    for(const path of paths){const cached=cachedMobileTree(path);if(cached)nodes[path]=cached;}
    return {expanded,nodes,paths};
  });
  const [nodes, setNodes] = useState<Record<string, TreeNode[]>>(initial.nodes);
  const [expanded, setExpanded] = useState<Set<string>>(initial.expanded);
  const [error, setError] = useState('');
  const loading = useRef(new Set<string>());
  const mounted = useRef(true);
  async function load(path: string) {
    if (loading.current.has(path)) return;
    loading.current.add(path);
    const cached = cachedMobileTree(path);
    if (cached) { setNodes(old => ({ ...old, [path]: cached })); loading.current.delete(path); return; }
    try {
      const children = await loadMobileTree(path);
      if (!mounted.current) return;
      setNodes(old => ({ ...old, [path]: children }));
    } catch { if (mounted.current) setError('目录读取失败，请重试。'); }
    finally { loading.current.delete(path); }
  }
  useEffect(() => {
    mounted.current = true;
    // Render the saved tree in the first frame. Cold directory work starts only
    // after the drawer has settled, so it cannot repaint each animation frame.
    let timer:number;
    const warm=()=>{
      if(document.querySelector<HTMLElement>('.is-side-drawer .mobile-sheet')?.style.willChange==='transform'){timer=window.setTimeout(warm,80);return;}
      for(const path of initial.paths)if(!initial.nodes[path])void load(path);
    };
    timer=window.setTimeout(warm,MOBILE_SHEET_MOTION_MS+20);
    return () => { mounted.current = false; clearTimeout(timer); };
  }, []);
  function toggle(path: string) {
    setExpanded(old => { const next = new Set(old); next.has(path) ? next.delete(path) : next.add(path); return next; });
    if (!nodes[path]) void load(path);
  }
  function row(path: string, name: string, root: string, depth: number, expandable=true) {
    const children=nodes[path] ?? cachedMobileTree(path);
    const canExpand=children ? children.length>0 : expandable;
    return <div className="mobile-tree-node" key={path}>
      <div className={`mobile-tree-row ${p.current === path ? 'is-active' : ''}`} style={{ paddingLeft: 12 + Math.min(depth, 8) * 14 }}>
        {canExpand ? <button className="mobile-tree-toggle" aria-label={`${expanded.has(path) ? '折叠' : '展开'} ${name}`} aria-expanded={expanded.has(path)} onClick={() => toggle(path)}><MobileIcon name="chevron" style={{transform:expanded.has(path) ? 'rotate(90deg)' : undefined}}/></button> : <span className="mobile-tree-spacer" aria-hidden="true"/>}
        <button style={{ fontSize: Math.max(12, 16 - depth) }} onClick={() => dismissMobileSheet(() => p.onOpen(path, root))}>{name}</button>
        {depth === 0 && <button className="mobile-tree-manage" aria-label={tr`管理资源库 ${name}`} onClick={() => { const item=p.roots.find(item=>item.path===root); if(item)p.onManage(item); }}><MobileIcon name="more"/></button>}
      </div>
      {canExpand && expanded.has(path) && <div className="mobile-tree-children" aria-busy={!children}>{children?.map(child => row(child.path, child.name, root, depth + 1,child.expandable))}</div>}
    </div>;
  }
  return <MobileSheet side title={t("资源库")} onClose={p.onClose}>
    <MobileReorderList items={p.roots} itemKey={root => root.path} onReorder={p.onReorder} render={root => row(root.path, root.name, root.path, 0)} />
    {error && <p role="alert">{t(error ?? '')}</p>}
    {!p.roots.length && <p>{t("添加漫画目录后即可开始阅读。")}</p>}
    <div className="mobile-drawer-footer"><button onClick={p.onAdd}><MobileIcon name="add"/>{t("添加目录")}</button><button onClick={p.onFile}><MobileIcon name="library"/>{t("打开文件")}</button></div>
  </MobileSheet>;
}
