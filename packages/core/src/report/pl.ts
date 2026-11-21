// Polish wording for the report. Kept in step with apps/web/src/i18n/pl.json (a web test compares the two).

export const IDENTIFIER_TYPES_PL: Record<string, string> = {
  NAME: 'Imię i nazwisko',
  NICK: 'Nick na forum',
  MESSENGER: 'Komunikator (Telegram i inne)',
  SOCIAL_LOGIN: 'Login w serwisie',
  EMAIL: 'Adres e-mail',
  ADDRESS: 'Adres kryptowalutowy',
};
export const BANDS_PL: Record<string, string> = { VERY_HIGH: 'Bardzo wysokie', PROBABLE: 'Prawdopodobne', MEDIUM: 'Średnie', LOW: 'Niskie', EXCLUDED: 'Wykluczone' };
export const CATEGORIES_PL: Record<string, string> = {
  UNHOSTED: 'Niehostowany (portfel osoby)',
  CEX_CUSTODIAL: 'Giełda (powiernicza)',
  CEX_DEPOSIT: 'Adres depozytowy giełdy',
  CONTRACT: 'Smart kontrakt',
  DEX: 'DEX / router',
  CASP_KANTOR: 'Kantor / punkt wymiany',
  PAYMENT_GATEWAY: 'Bramka płatnicza',
  CRYPTO_CARD: 'Karta krypto',
  MIXER: 'Mikser',
  CHARITY: 'Zbiórka charytatywna',
  SANCTIONED: 'Adres sankcjonowany',
  EXAMPLE_BURN: 'Adres przykładowy lub burn',
  UNKNOWN_SERVICE: 'Usługa (ustalone heurystyką)',
};
export const SOURCE_TYPES_PL: Record<string, string> = {
  OFFICIAL_PROFILE: 'Oficjalny profil',
  SALE_AD: 'Ogłoszenie sprzedaży',
  P2P_OFFER: 'Oferta P2P',
  EMAIL_FOOTER: 'Stopka e-maila',
  MESSENGER_SETTLEMENT: 'Komunikator (rozliczenie)',
  FORUM_DISCUSSION: 'Dyskusja na forum',
  MASS_COMMENT: 'Komentarze masowe',
  GIVEAWAY: 'Rozdanie (giveaway)',
};
export const CONTEXT_TYPES_PL: Record<string, string> = {
  SALE: 'sprzedaż',
  P2P: 'P2P / gotówka',
  DONATION: 'wsparcie lub darowizna',
  GIVEAWAY: 'rozdanie',
  SETTLEMENT: 'rozliczenie',
  DISCUSSION: 'dyskusja',
};
export const TAGS_PL: Record<string, string> = {
  SWAP_DEX: 'wymiana na DEX',
  STABLECOIN_CONVERSION: 'zamiana na stablecoin',
  TO_CEX: 'do giełdy',
  TO_CEX_DEPOSIT: 'do adresu depozytowego giełdy',
  FROM_CEX: 'z giełdy',
  TO_KANTOR: 'do kantoru',
  FROM_KANTOR: 'z kantoru',
  TO_GATEWAY: 'do bramki płatniczej',
  TO_CARD: 'do karty krypto',
  MIXER: 'mikser',
  SANCTIONED: 'adres sankcjonowany',
  TO_AD_ADDRESS: 'na adres z ogłoszenia',
  USDT_TO_CASH: 'USDT na gotówkę',
  STABLECOIN_TO_CASH: 'stablecoin na gotówkę',
  OVER_1000_EUR: '≥ 1 000 EUR',
  OVER_10000_EUR: '≥ 10 000 EUR',
  OVER_15000_EUR: '≥ 15 000 EUR',
};
export const CHAIN_MODES_PL: Record<string, string> = { fixture: 'syntetyczne historie', live: 'na żywo', off: 'pominięty' };
export const METHODS_PL: Record<string, string> = { official_api: 'oficjalne API', public_page: 'strona publiczna', synthetic: 'dane sztuczne' };
export const CHAINS_PL: Record<string, string> = { BTC: 'Bitcoin', ETH: 'Ethereum', TRON: 'TRON' };
export const RELATIONS_PL: Record<string, string> = {
  PUBLISHER: 'opublikowało adres',
  SAME_NICK_OTHER_PLATFORM: 'ten sam nick na innej platformie; możliwa inna osoba',
};
export const DECISIONS_PL: Record<string, string> = { CONFIRMED: 'Potwierdzone', REJECTED: 'Odrzucone przez analityka' };

export const label = (dict: Record<string, string>, key: string) => dict[key] ?? key;

/** Polish plural: 1 / 2–4 (not 12–14) / the rest. */
export const plural = (n: number, one: string, few: string, many: string) => (n === 1 ? one : n % 10 >= 2 && n % 10 <= 4 && !(n % 100 >= 12 && n % 100 <= 14) ? few : many);

const tz = 'Europe/Warsaw';
const dateFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat('pl-PL', { timeZone: tz, day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const money = (currency: string) => new Intl.NumberFormat('pl-PL', { style: 'currency', currency });
const plnFmt = money('PLN');
const eurFmt = money('EUR');
const numFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 8 });

export const DASH = '—';
export const fmtDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : DASH);
export const fmtDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : DASH);
export const fmtPln = (v: number | null | undefined) => (v === null || v === undefined ? DASH : plnFmt.format(v));
export const fmtEur = (v: number | null | undefined) => (v === null || v === undefined ? DASH : eurFmt.format(v));
export const fmtNum = (v: number) => numFmt.format(v);
export const shortAddr = (a: string) => (a.length > 16 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a);
export const host = (url: string | null) => {
  if (!url) return DASH;
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Analysis notes (codes from the backend) in Polish; the web keeps the same text in i18n `notes.*`. */
export const NOTES_PL: Record<string, string> = {
  ERROR: 'Błąd techniczny: {{detail}}',
  CHAIN_KEY_MISSING: 'Brak klucza {{key}} w pliku .env — wyszukiwanie w sieci {{chain}} jest wyłączone.',
  PROVIDER_HTTP: 'Dostawca danych {{provider}} zwrócił błąd HTTP {{status}}.',
  PROVIDER_ERROR: 'Dostawca danych {{provider}} zwrócił błąd: {{detail}}',
  NBP_HTTP: 'Wycena w PLN niedostępna: serwer NBP zwrócił błąd HTTP {{status}}.',
  NBP_NO_RATE: 'Wycena w PLN niedostępna: brak kursu NBP {{currency}} sprzed dnia {{day}}.',
  HISTORY_TRUNCATED: 'Historia obcięta do ostatniej strony wyników dostawcy.',
  UNVALUED_TRANSFERS: 'Transfery bez wyceny: {{count}} (brak stablecoina lub źródła ceny).',
  EGRESS_BLOCKED: 'Połączenie z hostem {{host}} zablokowane: brak go na liście dozwolonych.',
  ALL_CONNECTORS_FAILED: 'Wszystkie źródła zwróciły błąd: {{detail}}',
};

export interface NoteLike {
  code: string;
  params?: Record<string, string | number>;
}
export const noteTextPl = (n: NoteLike) => (NOTES_PL[n.code] ?? NOTES_PL.ERROR!).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(n.params?.[k] ?? (k === 'detail' ? n.code : '')));
