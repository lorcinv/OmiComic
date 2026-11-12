import { useEffect, useState } from 'react';
import { isNativeMobile } from '../platform';

export default function useMobileLayout() {
  const [mobile, setMobile] = useState(() => isNativeMobile() || window.matchMedia('(max-width:760px), (pointer:coarse)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width:760px), (pointer:coarse)');
    const update = () => setMobile(isNativeMobile() || query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}
