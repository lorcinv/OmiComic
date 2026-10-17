import { t } from '../i18n';
import type { ReactNode } from 'react';
import MobileSheet from './MobileSheet';

export default function ReaderControlsSurface({ mobile, open, onClose, children }: { mobile: boolean; open: boolean; onClose: () => void; children: ReactNode }) {
  if (!mobile) return <>{children}</>;
  return open ? <MobileSheet title={t("阅读设置")} onClose={onClose}>{children}</MobileSheet> : null;
}
