import { useEffect, useState } from 'react';
import { isNativeMobile } from '../platform';

export default function useMobileLayout() {
  const [mobile, setMobile] = useState(() => isNativeMobile() || window.matchMedia('(max-width:760px), (pointer:coarse)').matches);
  useEffect(() => {
    const query = window.matchMedia('(max-width:760px), (pointer:coarse)');
    const update = () => setMobile(isNativeMobile() || query.matches);
    if (query.addEventListener) {
      query.addEventListener('change', update);
      return () => query.removeEventListener('change', update);
    }
    // Android 9 can retain a WebView whose MediaQueryList only has addListener.
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  return mobile;
}
