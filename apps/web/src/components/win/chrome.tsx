import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNotifications } from '@/api/client';
import { BevelButton, BevelLink, ChildWindow, inputClass } from '@/components/win/controls';
import { APP_NAME } from '@/config/app';
import { LANGUAGES } from '@/i18n';
import { ANALYST_KEY, altCombo, clearReserved, openDialog, useDialog, useKeyLabel, useNotice, useOpenWindow, useOpenWindows, useReservedKeys } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { Link, navigate, usePath } from '@/router';

/** The first letter of a menu title is underlined (the classic mnemonic). */
const Mnemonic = ({ text }: { text: string }) => (
  <>
    <span className="underline">{text.charAt(0)}</span>
    {text.slice(1)}
  </>
);

function TitleBar({ title }: { title: string }) {
  const box = 'flex h-[22px] w-6 items-center justify-center bevel text-[11px] text-ink';
  return (
    <div className="flex items-center gap-2 bg-navy px-1 py-[3px] text-[15px] font-semibold text-white">
      <span aria-hidden="true" className={cn(box, 'text-[12px]')}>
        —
      </span>
      <h1 className="m-0 min-w-0 flex-1 text-[15px] font-semibold">{title}</h1>
      <span aria-hidden="true" className={box}>
        ▼
      </span>
      <span aria-hidden="true" className={box}>
        ▲
      </span>
    </div>
  );
}

interface MenuItem {
  label: string;
  key?: string;
  to?: string;
  href?: string;
  onSelect?: () => void;
}

function Menu({ title, items }: { title: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const label = useKeyLabel();
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc, true);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc, true);
    };
  }, [open]);
  const row = 'flex min-h-[44px] w-full items-center justify-between gap-6 px-3 text-left text-[14px] text-ink no-underline hover:bg-navy hover:text-white';
  return (
    <div className="relative" ref={box}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={cn('inline-flex min-h-[44px] cursor-pointer items-center px-2.5 text-[14px] text-ink hover:bg-face-pressed', open && 'bevel-pressed')}>
        <Mnemonic text={title} />
      </button>
      {open && (
        <div role="menu" aria-label={title} className="bevel absolute left-0 top-full z-30 min-w-[240px] p-0.5">
          {items.map((it) => {
            const close = () => setOpen(false);
            const text = (
              <>
                <span>{it.label}</span>
                {it.key && <span className="text-[12px] opacity-80">{label(it.key)}</span>}
              </>
            );
            if (it.to)
              return (
                <Link key={it.label} to={it.to} role="menuitem" className={row} onClick={close}>
                  {text}
                </Link>
              );
            if (it.href)
              return (
                <a key={it.label} href={it.href} role="menuitem" className={row} onClick={close} download>
                  {text}
                </a>
              );
            return (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                className={cn(row, 'cursor-pointer')}
                onClick={() => {
                  close();
                  it.onSelect?.();
                }}
              >
                {text}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MenuBar({ runId }: { runId?: string }) {
  const { t, i18n } = useTranslation();
  const report: MenuItem[] = runId
    ? [
        { label: t('menu.reportView'), to: `/runs/${runId}/report` },
        { label: t('menu.reportPdf'), key: 'F7', href: `/api/runs/${runId}/report.pdf` },
        { label: t('menu.reportJson'), href: `/api/runs/${runId}/report.json` },
        { label: t('menu.graph'), key: 'F6', to: `/runs/${runId}/graph` },
      ]
    : [{ label: t('menu.noRun') }];
  return (
    <nav aria-label={t('menu.label')} className="flex flex-wrap gap-0.5 border-b border-shadow px-1 py-0.5 text-[14px] shadow-[0_1px_0_#fff]">
      <Menu
        title={t('menu.case')}
        items={[
          { label: t('menu.new'), key: 'F2', to: '/' },
          { label: t('menu.cases'), key: 'F4', to: '/cases' },
          { label: t('menu.audit'), key: 'F8', to: '/audit' },
        ]}
      />
      <Menu
        title={t('menu.view')}
        items={[
          { label: t('menu.notifications'), key: 'F9', to: '/notifications' },
          ...LANGUAGES.map((l) => ({ label: `${t('menu.language')}: ${t(`menu.lang.${l}`)}${i18n.language === l ? ' ✓' : ''}`, onSelect: () => void i18n.changeLanguage(l) })),
        ]}
      />
      <Menu title={t('menu.report')} items={report} />
      <Menu
        title={t('menu.help')}
        items={[
          { label: t('menu.shortcuts'), key: 'F1', onSelect: () => openDialog('help') },
          { label: t('menu.settings'), key: 'F10', onSelect: () => openDialog('settings') },
        ]}
      />
    </nav>
  );
}

/** The right end of every toolbar: language and the notifications button with its count. */
function GlobalTools() {
  const { t, i18n } = useTranslation();
  const unread = useNotifications().data?.unread ?? 0;
  const key = useKeyLabel();
  return (
    <div className="ml-auto flex flex-wrap items-center gap-1.5">
      <div className="flex gap-1.5" role="group" aria-label={t('app.language')}>
        {LANGUAGES.map((l) => (
          <BevelButton key={l} pressed={i18n.language === l} className="min-w-12 px-2.5" onClick={() => void i18n.changeLanguage(l)}>
            {l.toUpperCase()}
          </BevelButton>
        ))}
      </div>
      <BevelLink to="/notifications" aria-label={unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.bell')}>
        {t('notifications.title')}
        {unread > 0 && <span className="bg-navy px-1.5 font-bold text-white">{unread}</span>}
        <span className="sr-only">{key('F9')}</span>
      </BevelLink>
    </div>
  );
}

export interface ShortcutItem {
  id: string;
  label: string;
  to?: string;
  onClick?: () => void;
}

function ShortcutBar({ items, status }: { items: ShortcutItem[]; status?: ReactNode }) {
  const { t } = useTranslation();
  const label = useKeyLabel();
  const notice = useNotice();
  const cls = 'cell inline-flex min-h-[36px] items-center px-3 text-[13px] text-ink no-underline hover:text-ink';
  return (
    <nav aria-label={t('menu.shortcutBar')} className="no-print flex flex-wrap gap-[3px] p-[3px] text-[13px]">
      {items.map((it) =>
        it.to ? (
          <Link key={it.id} to={it.to} className={cls}>
            <b>{label(it.id)}</b>&nbsp;{it.label}
          </Link>
        ) : (
          <button key={it.id} type="button" className={cn(cls, 'cursor-pointer font-[inherit]')} onClick={it.onClick}>
            <b>{label(it.id)}</b>&nbsp;{it.label}
          </button>
        ),
      )}
      <span className="cell inline-flex min-h-[36px] min-w-[200px] flex-1 items-center px-3" role="status">
        {notice ?? status}
      </span>
    </nav>
  );
}

const clock = () => new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit' }).format(new Date());

function Taskbar() {
  const { t } = useTranslation();
  const path = usePath();
  const windows = useOpenWindows();
  const [time, setTime] = useState(clock);
  useEffect(() => {
    const id = window.setInterval(() => setTime(clock()), 15_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <footer className="no-print flex flex-wrap items-center gap-1.5 border-t-2 border-white bg-face px-2 py-[5px] shadow-[inset_0_1px_0_#dfdfdf]">
      <BevelLink to="/cases" compact className="min-h-[40px] px-4 font-bold">
        {APP_NAME}
      </BevelLink>
      {windows.map((w) => (
        <BevelLink key={w.path} to={w.path} pressed={w.path === path} compact className="min-h-[40px] max-w-[260px] px-4">
          <span className="truncate">{w.label}</span>
        </BevelLink>
      ))}
      <div className="cell ml-auto flex min-h-[36px] flex-wrap items-center gap-x-3.5 gap-y-1 px-3 text-[13px]">
        <span className="font-semibold text-navy">{t('app.prototype')}</span>
        <span>Powered by Etherscan.io APIs</span>
        <span aria-label={t('app.time')}>{time}</span>
      </div>
    </footer>
  );
}

function HelpDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const rows: [string, string][] = [
    ['F1', t('keys.F1')],
    ['F2', t('keys.F2')],
    ['F3', t('keys.F3')],
    ['F4', t('keys.F4')],
    ['F5', t('keys.F5')],
    ['F6', t('keys.F6')],
    ['F7', t('keys.F7')],
    ['F8', t('keys.F8')],
    ['F9', t('keys.F9')],
    ['F10', t('keys.F10')],
  ];
  return (
    <Modal id="help-title" title={t('help.title')} onClose={onClose}>
      <p className="m-0 leading-relaxed">{t('help.intro')}</p>
      <table className="dt compact">
        <thead>
          <tr>
            <th>{t('help.key')}</th>
            <th>{t('help.alt')}</th>
            <th>{t('help.action')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, text]) => (
            <tr key={k}>
              <td className="font-semibold">{k}</td>
              <td>{altCombo(k)}</td>
              <td>{text}</td>
            </tr>
          ))}
          <tr>
            <td className="font-semibold">Esc</td>
            <td>—</td>
            <td>{t('keys.Esc')}</td>
          </tr>
        </tbody>
      </table>
      <p className="m-0 text-[13px] leading-relaxed text-sub">{t('help.browser')}</p>
    </Modal>
  );
}

function SettingsDialog({ onClose }: { onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const [name, setName] = useState(() => localStorage.getItem(ANALYST_KEY) ?? '');
  const reserved = useReservedKeys();
  return (
    <Modal id="settings-title" title={t('settings.title')} onClose={onClose}>
      <label htmlFor="settings-analyst" className="font-semibold">
        {t('settings.analyst')}
      </label>
      <input
        id="settings-analyst"
        className={inputClass}
        value={name}
        maxLength={100}
        placeholder={t('decision.analystPlaceholder')}
        onChange={(e) => {
          setName(e.target.value);
          localStorage.setItem(ANALYST_KEY, e.target.value.trim());
        }}
      />
      <p className="m-0 text-[13px] text-sub">{t('settings.analystHint')}</p>
      <div className="font-semibold">{t('app.language')}</div>
      <div className="flex gap-1.5">
        {LANGUAGES.map((l) => (
          <BevelButton key={l} pressed={i18n.language === l} onClick={() => void i18n.changeLanguage(l)}>
            {t(`menu.lang.${l}`)}
          </BevelButton>
        ))}
      </div>
      <div className="font-semibold">{t('settings.keys')}</div>
      <p className="m-0 text-[13px] text-sub">{reserved.length === 0 ? t('settings.keysNone') : t('settings.keysTaken', { list: reserved.map((k) => `${k} → ${altCombo(k)}`).join(', ') })}</p>
      {reserved.length > 0 && (
        <div>
          <BevelButton onClick={clearReserved}>{t('settings.keysReset')}</BevelButton>
        </div>
      )}
    </Modal>
  );
}

/** A dialog window over the screen: Esc or a click outside closes it; focus goes in and comes back. */
function Modal({ id, title, onClose, children }: { id: string; title: string; onClose: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', esc, true);
    return () => {
      window.removeEventListener('keydown', esc, true);
      previous?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="no-print fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 pt-[8vh]">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true" />
      <div role="dialog" aria-modal="true" aria-labelledby={id} className="relative w-full max-w-[640px]">
        <ChildWindow
          id={id}
          title={title}
          footer={
            <div className="flex justify-end p-1.5">
              <BevelButton ref={closeRef} primary onClick={onClose}>
                {t('common.close')}
              </BevelButton>
            </div>
          }
        >
          {children}
        </ChildWindow>
      </div>
    </div>
  );
}

function Dialogs() {
  const d = useDialog();
  const close = () => openDialog(null);
  return d === 'help' ? <HelpDialog onClose={close} /> : d === 'settings' ? <SettingsDialog onClose={close} /> : null;
}

/**
 * One screen of the application: the teal desktop, the main window (title bar, menu, toolbar, content, shortcut bar) and the
 * taskbar. `runId` enables the report items of the menu; `windowLabel` is the entry this screen has in the taskbar.
 */
export function Screen({ title, windowLabel, toolbar, shortcuts, status, runId, children }: { title: string; windowLabel: string; toolbar?: ReactNode; shortcuts: ShortcutItem[]; status?: ReactNode; runId?: string; children: ReactNode }) {
  const path = usePath();
  useOpenWindow(path, windowLabel);
  useEffect(() => {
    document.title = `${title} — ${APP_NAME}`;
  }, [title]);
  return (
    <div className="flex min-h-screen flex-col bg-desktop text-ink">
      <div className="mx-auto flex w-full max-w-[1320px] flex-1 px-6 pb-5 pt-6 max-sm:px-2 max-sm:pt-2">
        <div className="bevel flex min-w-0 flex-1 flex-col p-[3px]">
          <TitleBar title={`${APP_NAME} — ${title}`} />
          <div className="no-print">
            <MenuBar runId={runId} />
            <div className="flex flex-wrap items-center gap-1.5 border-t border-white p-2">
              {toolbar}
              <GlobalTools />
            </div>
          </div>
          <main className="flex min-w-0 flex-1 flex-col gap-[22px] px-[22px] pb-[26px] pt-3.5 max-sm:px-3">{children}</main>
          <ShortcutBar items={shortcuts} status={status} />
        </div>
      </div>
      <Taskbar />
      <Dialogs />
    </div>
  );
}

/** Go to a route from a key handler (the router is a plain function, not a hook). */
export const go = (to: string) => () => navigate(to);
