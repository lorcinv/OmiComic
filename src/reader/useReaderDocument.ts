import { useEffect, useRef, useState } from "react";
import type { 阅读资源结果 } from "../types";
import type { DocumentSource } from "./documentSource";
import { isAndroid } from '../platform';

export function useReaderDocument(input: 阅读资源结果 | null, initialPageIndex=0, deferEpubIndexing=false) {
  const isDocument = input?.sourceType === "pdf" || (input?.sourceType === "epub" || input?.sourceType==="mobi");
  const [state, setState] = useState<{ input: 阅读资源结果; resource?: 阅读资源结果; source?: DocumentSource; error?: string }>();
  const deferIndexing=useRef(deferEpubIndexing);deferIndexing.current=deferEpubIndexing;
  useEffect(() => {
    if (!input || !isDocument) return;
    let cancelled = false;
    let source: DocumentSource | undefined;let unsubscribe:(()=>void)|undefined;
    const viewport=input.sourceType==='epub'&&isAndroid()?(async()=>{
      try { await window.omicomic.prepareEpubReaderViewport?.(input.sourcePath); } catch { /* Optional preparation must not prevent reading. */ }
    })():undefined;
    void import("./documentSource").then(async ({ DocumentSource }) => {
      if (cancelled) return;
      if (viewport) {
        // EPUB text/layout must start in the final reading viewport. The native
        // host keeps the library screenshot and time bar intact while preparing it.
        await viewport;
        if (cancelled) return;
      }
      const prepared=await DocumentSource.acquirePrepared(input,initialPageIndex);
      if(cancelled){prepared?.source.releaseReader();return;}
      source = prepared?.source??new DocumentSource(input,'reader',initialPageIndex);
      const resource = prepared?.resource??await source.open();
      if (!cancelled) {setState({ input, source, resource });unsubscribe=source.subscribe(()=>{if(!cancelled)setState(old=>old?{...old}:old);});if(input.sourceType!=='epub'||!isAndroid()||!deferIndexing.current)source.startIndexing();}
    }).catch(reason => {
      source?.dispose();
      if (!cancelled) setState({ input, error: reason instanceof Error ? reason.message : "文档读取失败。" });
    });
    return () => { cancelled = true; unsubscribe?.();source?.releaseReader(); };
  }, [input, isDocument, initialPageIndex]);
  const current = state?.input === input ? state : undefined;
  useEffect(()=>{
    if(input?.sourceType==='epub'&&isAndroid()&&!deferEpubIndexing)current?.source?.startIndexing();
  },[input,current?.source,deferEpubIndexing]);
  return {
    resource: isDocument ? current?.resource ?? null : input,
    source: isDocument ? current?.source : undefined,
    error: isDocument ? current?.error : undefined,
    loading: isDocument && !current?.resource && !current?.error,
  };
}
