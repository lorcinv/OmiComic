import { useEffect, useState } from "react";
import type { 阅读资源结果 } from "../types";
import type { DocumentSource } from "./documentSource";

export function useReaderDocument(input: 阅读资源结果 | null) {
  const isDocument = input?.sourceType === "pdf" || input?.sourceType === "epub";
  const [state, setState] = useState<{ input: 阅读资源结果; resource?: 阅读资源结果; source?: DocumentSource; error?: string }>();
  useEffect(() => {
    if (!input || !isDocument) return;
    let cancelled = false;
    let source: DocumentSource | undefined;
    void import("./documentSource").then(async ({ DocumentSource }) => {
      if (cancelled) return;
      source = new DocumentSource(input);
      const resource = await source.open();
      if (!cancelled) setState({ input, source, resource });
    }).catch(reason => {
      source?.dispose();
      if (!cancelled) setState({ input, error: reason instanceof Error ? reason.message : "文档读取失败。" });
    });
    return () => { cancelled = true; source?.dispose(); };
  }, [input, isDocument]);
  const current = state?.input === input ? state : undefined;
  return {
    resource: isDocument ? current?.resource ?? null : input,
    source: isDocument ? current?.source : undefined,
    error: isDocument ? current?.error : undefined,
    loading: isDocument && !current?.resource && !current?.error,
  };
}
