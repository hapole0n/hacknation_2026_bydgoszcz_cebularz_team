/**
 * Analysis notes are CODES, not sentences: the web app translates `notes.<code>` (pl/en) with `params`,
 * so no English text from the backend reaches the analyst.
 */
export interface Note {
  code: string;
  params?: Record<string, string | number>;
}

export class NoteError extends Error {
  constructor(
    readonly note: Note,
    message: string = note.code,
  ) {
    super(message);
  }
}

/** Any failure as a Note; unknown errors keep their raw text as `detail` (technical diagnostics only). */
export const noteOf = (e: unknown): Note => (e instanceof NoteError ? e.note : { code: 'ERROR', params: { detail: e instanceof Error ? e.message : String(e) } });
