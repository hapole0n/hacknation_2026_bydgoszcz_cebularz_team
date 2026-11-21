const locale = (lang: string) => (lang === 'en' ? 'en-GB' : 'pl-PL');

/** 0x8ae181…3A47: enough to recognise an address, never enough to be mistaken for the full one. */
export function shortAddress(address: string, head = 8, tail = 5): string {
  return address.length <= head + tail + 1 ? address : `${address.slice(0, head)}…${address.slice(-tail)}`;
}

export function formatPln(value: number | null | undefined, lang: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: 'PLN', maximumFractionDigits: 2 }).format(value);
}

export function formatEur(value: number | null | undefined, lang: string): string {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat(locale(lang), { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 }).format(value);
}

export function formatAmount(value: number, lang: string): string {
  return new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 6 }).format(value);
}

/** Dates are shown in Polish time, whatever the browser's zone is. */
export function formatDateTime(iso: string | null | undefined, lang: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(iso));
}

export function formatDate(iso: string | null | undefined, lang: string): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: 'medium', timeZone: 'Europe/Warsaw' }).format(new Date(iso));
}

/** +85, −10, 0 — with a real minus sign, so the sign is readable without colour. */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0';
}

export const shortHash = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-6)}`;

/** Case-insensitive for EVM / bech32, exact for base58 — mirrors core's normAddr. */
export const addressKey = (a: string) => (/^(0x|bc1)/i.test(a) ? a.toLowerCase() : a);

export const loc = (l: { pl: string; en: string }, lang: string) => (lang === 'en' ? l.en : l.pl);
