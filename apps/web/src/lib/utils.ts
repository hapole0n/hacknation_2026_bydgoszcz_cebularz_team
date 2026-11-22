/** Joins the class names that are truthy: `cn('a', cond && 'b')`. */
export const cn = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(' ');
