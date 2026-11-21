import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** A side panel for the address card: closes on Esc or a click outside, moves focus in and back. */
export function Drawer({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-foreground/30" onClick={onClose} aria-hidden="true" />
      <aside role="dialog" aria-modal="true" aria-label={label} className="relative flex h-full w-full max-w-2xl flex-col border-l bg-background">
        <div className="flex items-center justify-between border-b bg-card px-5 py-3">
          <p className="text-sm font-semibold">{label}</p>
          <Button ref={closeRef} variant="outline" size="sm" onClick={onClose}>{t('common.close')}</Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5">{children}</div>
      </aside>
    </div>
  );
}
