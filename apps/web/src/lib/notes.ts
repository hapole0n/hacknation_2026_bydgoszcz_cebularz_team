import type { TFunction } from 'i18next';
import type { Note } from '@/api/types';

/** Backend notes are codes; the text lives in i18n `notes.<code>` (pl/en). Unknown codes fall back to the generic error text. */
export const noteText = (t: TFunction, n: Note): string => t(`notes.${n.code}`, { defaultValue: t('notes.ERROR', { detail: n.code }), ...n.params });
