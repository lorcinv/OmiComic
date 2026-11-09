import { useEffect, useState } from 'react';
import type { 阅读资源结果, 阅读打开上下文 } from '../types';
import { originalDirectoryContext } from '../reader/originalDirectoryContext';

export function useOriginalDirectoryContext(resource: 阅读资源结果 | null, requested: 阅读打开上下文 | null, active: boolean): 阅读打开上下文 | null {
  const [resolved, setResolved] = useState<{ identity: string; context: 阅读打开上下文 | null } | null>(null);
  const fromHistory = requested?.source === 'recent';
  const key = resource?.resourceKey, path = resource?.sourcePath, type = resource?.sourceType;
  const identity = JSON.stringify([key, path, type]);
  useEffect(() => {
    if (!fromHistory || !active || !key || !path || !type) return;
    let cancelled = false;
    setResolved(null);
    void originalDirectoryContext({ resourceKey: key, sourcePath: path, sourceType: type }, window.omicomic)
      .then(context => { if (!cancelled) setResolved({ identity, context }); })
      .catch(() => { if (!cancelled) setResolved({ identity, context: null }); });
    return () => { cancelled = true; };
  }, [fromHistory, active, key, path, type, identity]);
  return fromHistory ? resolved?.identity === identity ? resolved.context : null : requested;
}
