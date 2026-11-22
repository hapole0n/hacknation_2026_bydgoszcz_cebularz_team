import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AddressCategory, Band, CaseResult } from '@/api/types';
import { Tag } from '@/components/win/controls';
import { BAND_RANGE } from '@/lib/bands';

/** Categories that are an exclusion or an alarm (alert colour); a personal wallet and a plain unknown are not. */
const ALERT_CATEGORIES: readonly string[] = ['CEX_CUSTODIAL', 'CEX_DEPOSIT', 'CONTRACT', 'DEX', 'CASP_KANTOR', 'PAYMENT_GATEWAY', 'CRYPTO_CARD', 'MIXER', 'CHARITY', 'SANCTIONED', 'EXAMPLE_BURN', 'UNKNOWN_SERVICE'];

/** `[ GIEŁDA ]`: the category of an address as a bracketed tag. */
export function CategoryTag({ category }: { category: AddressCategory | string }) {
  const { t } = useTranslation();
  return <Tag alert={ALERT_CATEGORIES.includes(category)}>{t(`categoryTags.${category}`, { defaultValue: category })}</Tag>;
}

/** `BARDZO WYSOKI` and the range `80–100`. */
export function BandName({ band }: { band: Band }) {
  const { t } = useTranslation();
  return <>{t(`bandNames.${band}`)}</>;
}

/** `przedział 80–100 (BARDZO WYSOKI)`. */
export function BandRange({ band }: { band: Band }) {
  const { t } = useTranslation();
  return <>{t('result.bandRange', { range: BAND_RANGE[band], band: t(`bandNames.${band}`) })}</>;
}

/** Pairs of label and value, the way a case file lists its particulars. */
export function Particulars({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-[14px]">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-sub">{i.label}</dt>
          <dd className="m-0 min-w-0 break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** One line of the register: "Adresy: 3 (80–100), 2 (10–39) · 1 przesłanka wypłaty", or the exclusion. */
export function ResultLine({ result }: { result: CaseResult | null }) {
  const { t } = useTranslation();
  if (!result) return <span className="text-sub">—</span>;
  const order = ['VERY_HIGH', 'PROBABLE', 'MEDIUM', 'LOW'] as const;
  const parts = order.filter((b) => result.bands[b] > 0).map((b) => `${result.bands[b]} (${BAND_RANGE[b]})`);
  const assigned = parts.length > 0;
  return (
    <>
      {assigned ? t('result.addressesLine', { list: parts.join(', ') }) : result.excluded > 0 ? <Tag alert>{t('result.excludedOnly')}</Tag> : t('result.none')}
      {result.cashOut > 0 && (
        <>
          {' · '}
          <span className="font-semibold text-alert">{t('result.cashOutCount', { count: result.cashOut })}</span>
        </>
      )}
    </>
  );
}
