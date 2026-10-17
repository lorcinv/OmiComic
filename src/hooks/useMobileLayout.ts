import { useEffect, useState } from 'react';
import { isAndroid } from '../platform';

export default function useMobileLayout() {
  const [mobile, setMobile] = useState(() => isAndroid() || window.matchMedia('(max-width:760px), (pointer:coarse)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width:760px), (pointer:coarse)');
    const update = () => setMobile(isAndroid() || query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return mobile;
}
