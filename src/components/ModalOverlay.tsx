import type { HTMLAttributes } from 'react';
import useMobileLayout from '../hooks/useMobileLayout';
import { useMobileScrim } from '../hooks/mobileScrim';

export default function ModalOverlay(props: HTMLAttributes<HTMLDivElement>) {
  const mobile = useMobileLayout();
  useMobileScrim(mobile);
  return <div {...props} data-shared-scrim={mobile || undefined} />;
}
