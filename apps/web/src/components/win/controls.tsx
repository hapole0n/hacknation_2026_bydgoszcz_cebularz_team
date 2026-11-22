import type { ComponentProps, HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { Link } from '@/router';

/** Class of a bevel button (the main action: `primary`; the current tab: `pressed`). Interactive targets are at least 44 px high. */
export const bevelClass = ({ pressed, primary, compact }: { pressed?: boolean; primary?: boolean; compact?: boolean } = {}) =>
  cn(
    'inline-flex cursor-pointer select-none items-center justify-center gap-2 whitespace-nowrap px-3.5 text-[14px] font-semibold text-ink no-underline hover:text-ink disabled:cursor-default disabled:opacity-60',
    compact ? 'min-h-[36px]' : 'min-h-[44px]',
    pressed ? 'bevel-pressed' : 'bevel',
    primary && 'bevel-default',
  );

export function BevelButton({ pressed, primary, compact, className, type = 'button', ...rest }: { pressed?: boolean; primary?: boolean; compact?: boolean } & ComponentProps<'button'>) {
  return <button type={type} aria-pressed={pressed} className={cn(bevelClass({ pressed, primary, compact }), className)} {...rest} />;
}

export function BevelLink({ to, pressed, primary, compact, className, children, ...rest }: { to: string; pressed?: boolean; primary?: boolean; compact?: boolean; className?: string; children: ReactNode } & Omit<ComponentProps<'a'>, 'href'>) {
  return (
    <Link to={to} aria-current={pressed ? 'page' : undefined} className={cn(bevelClass({ pressed, primary, compact }), className)} {...rest}>
      {children}
    </Link>
  );
}

/** A bevel link to a file (download) — same look, plain anchor. */
export function BevelDownload({ href, primary, children }: { href: string; primary?: boolean; children: ReactNode }) {
  return (
    <a href={href} download className={bevelClass({ primary })}>
      {children}
    </a>
  );
}

export function SunkenPanel({ className, children, ...rest }: { className?: string; children: ReactNode } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('sunken', className)} {...rest}>
      {children}
    </div>
  );
}

/** Group box: an etched frame with its title on the top line. `tone="alert"` is only for thresholds, exclusions and cash-out signals. */
export function GroupBox({ id, title, tone, className, children }: { id: string; title: ReactNode; tone?: 'alert'; className?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={cn('groupbox px-3.5 pb-3.5 pt-[22px]', className)}>
      <h2 id={id} className={cn('groupbox-title', tone === 'alert' && 'text-alert')}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** A small window inside the main one, with a navy title bar. */
export function ChildWindow({ id, title, footer, className, children }: { id: string; title: ReactNode; footer?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <aside aria-labelledby={id} className={cn('bevel flex flex-col p-[3px]', className)}>
      <h2 id={id} className="m-0 bg-navy px-2 py-1 text-[14px] font-semibold text-white">
        {title}
      </h2>
      <div className="sunken m-1.5 flex flex-col gap-2.5 px-3.5 py-3 text-[14px]">{children}</div>
      {footer}
    </aside>
  );
}

/** `[ GIEŁDA ]` — a tag in brackets; the alert colour only when it is an exclusion or an alarm. */
export function Tag({ children, alert, className }: { children: ReactNode; alert?: boolean; className?: string }) {
  return <span className={cn('whitespace-nowrap font-semibold', alert ? 'text-alert' : 'text-navy', className)}>[ {children} ]</span>;
}

/** Ten blocks: filled navy / outlined empty, in a small sunken strip. */
export function ScoreBlocks({ score, size = 'm' }: { score: number; size?: 's' | 'm' | 'l' }) {
  const filled = Math.max(0, Math.min(10, Math.round(score / 10)));
  const dim = { s: ['w-[9px] h-3', 'w-[7px] h-2.5'], m: ['w-[10px] h-[13px]', 'w-2 h-[11px]'], l: ['w-[12px] h-3.5', 'w-2.5 h-3'] }[size];
  return (
    <span aria-hidden="true" className="cell inline-flex gap-0.5 bg-paper p-0.5">
      {Array.from({ length: 10 }, (_, i) => (i < filled ? <span key={i} className={cn(dim[0], 'bg-navy')} /> : <span key={i} className={cn(dim[1], 'self-center border border-shadow')} />))}
    </span>
  );
}

/** Fraction meter (thresholds): `blocks` of 10 filled; alert colour once exceeded. */
export function MeterBlocks({ blocks, alert }: { blocks: number; alert?: boolean }) {
  return (
    <span aria-hidden="true" className="cell inline-flex gap-0.5 bg-paper p-[3px]">
      {Array.from({ length: 10 }, (_, i) => (i < blocks ? <span key={i} className={cn('h-[13px] w-2.5', alert ? 'bg-alert' : 'bg-navy')} /> : <span key={i} className="h-[11px] w-2 self-center border border-shadow" />))}
    </span>
  );
}

/** Numbered steps `[1] …`; the current one is selected (navy, white text). */
export function StepList({ steps, current }: { steps: ReactNode[]; current: number }) {
  return (
    <ol className="sunken m-0 list-none p-1.5 text-[14px] leading-normal">
      {steps.map((s, i) => (
        <li key={i} className={cn('px-2.5 py-1.5', i === current && 'sel bg-navy text-white')} aria-current={i === current ? 'step' : undefined}>
          [{i + 1}] {s}
        </li>
      ))}
    </ol>
  );
}

/** The table frame: sunken, scrolls sideways when narrow. */
export function DataTable({ minWidth = 640, caption, className, children }: { minWidth?: number; caption?: string; className?: string; children: ReactNode }) {
  return (
    <div className="sunken overflow-x-auto">
      <table className={cn('dt', className)} style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

/** Label + input of the desktop look. */
export const inputClass = 'sunken min-h-[44px] w-full px-3 font-[inherit] text-[15px] text-ink outline-none focus-visible:outline-2 focus-visible:outline-navy';

export function CheckField({ id, checked, onChange, children, disabled }: { id: string; checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <label htmlFor={id} className="inline-flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[14px]">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="m-0 size-[18px] accent-navy" />
      {children}
    </label>
  );
}

/** `adresy znalezione ........ 6` — a line of the counters block, dot leaders in monospace. */
export function leader(label: string, value: string | number, width = 38) {
  const v = String(value);
  return `${label} ${'.'.repeat(Math.max(3, width - label.length - v.length - 2))} ${v}`;
}

export function ErrorNote({ title, message }: { title: string; message?: string }) {
  return (
    <div role="alert" className="sunken border-l-4 border-l-alert px-3.5 py-2.5 text-[14px]">
      <p className="m-0 font-semibold text-alert">{title}</p>
      {message && <p className="m-0 mt-0.5 text-sub">{message}</p>}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="sunken px-4 py-6 text-center text-[14px]">
      <p className="m-0 font-semibold">{title}</p>
      {children && <p className="m-0 mx-auto mt-1 max-w-[60ch] text-sub">{children}</p>}
      {action && <div className="mt-3 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function LoadState({ pending, error, onRetry, retryLabel, loadingLabel, errorLabel }: { pending: boolean; error: Error | null; onRetry?: () => void; retryLabel: string; loadingLabel: string; errorLabel: string }) {
  if (pending) return <p role="status" className="m-0 py-6 text-[14px] text-sub-face">{loadingLabel}</p>;
  if (!error) return null;
  return (
    <div className="flex flex-col items-start gap-2">
      <ErrorNote title={errorLabel} message={error.message} />
      {onRetry && <BevelButton onClick={onRetry}>{retryLabel}</BevelButton>}
    </div>
  );
}

/** `> tekst` in VT323 — big headings only. */
export function VtHeading({ children, size = 'l', as: As = 'h1', className, id, 'data-testid': testId }: { children: ReactNode; size?: 's' | 'm' | 'l'; as?: 'h1' | 'h2' | 'div'; className?: string; id?: string; 'data-testid'?: string }) {
  const fs = { s: 'text-[34px]', m: 'text-[46px]', l: 'text-[50px]' }[size];
  return (
    <As id={id} data-testid={testId} className={cn('m-0 font-vt font-normal leading-none text-navy [overflow-wrap:anywhere]', fs, className)}>
      {children}
    </As>
  );
}
