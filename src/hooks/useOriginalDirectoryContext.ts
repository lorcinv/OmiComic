import { useEffect, useState } from 'react';
import type { 阅读资源结果, 阅读打开上下文 } from '../types';
import { originalDirectoryContext } from '../reader/originalDirectoryContext';

export function useOriginalDirectoryContext(resource: 阅读资源结果 | null, requested: 阅读打开上下文 | null, active: boolean): 阅读打开上下文 | null {
  const [resolved, setResolved] = useState<{ identity: string; context: 阅读打开上下文 | null } | null>(null);
  const fromHistory = requested?.source === 'recent';
  const key = resource?.resourceKey, path = resource?.sourcePath, type = resource?.sourceType;
  const settings = resource?.readerInit?.settings;
  const identity = JSON.stringify([key, path, type, settings?.sortMode, settings?.folderFirst]);
  useEffect(() => {
    if (!fromHistory || !active || !key || !path || !type) return;
    let cancelled = false;
    setResolved(null);
    const load = async () => {
      const data = !settings && window.omicomic.getAppData ? await window.omicomic.getAppData() : null;
      if (cancelled) return null;
      return originalDirectoryContext({ resourceKey: key, sourcePath: path, sourceType: type }, window.omicomic, settings ?? (data?.ok ? data.data.settings : undefined));
    };
    void load()
      .then(context => { if (!cancelled) setResolved({ identity, context }); })
      .catch(() => { if (!cancelled) setResolved({ identity, context: null }); });
    return () => { cancelled = true; };
  }, [fromHistory, active, key, path, type, identity, settings]);
  return fromHistory ? resolved?.identity === identity ? resolved.context : null : requested;
}
