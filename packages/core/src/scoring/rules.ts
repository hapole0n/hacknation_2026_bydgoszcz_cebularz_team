import { parse } from 'yaml';
import {
  EXCLUSION_IDS,
  MODIFIER_IDS,
  SOURCE_TYPES,
  type ExclusionId,
  type Localized,
  type ModifierId,
  type SourceType,
} from '../types.js';

export class RulesError extends Error {}

export interface Band extends Localized {
  id: string;
  min: number;
  max: number;
}

/** Hint condition AST — compiled once from the YAML `when` string. */
export type Condition =
  | { t: 'or' | 'and'; l: Condition; r: Condition }
  | { t: 'not'; e: Condition }
  | { t: 'rule'; id: string } // true when the rule appears in the breakdown
  | { t: 'band'; id: string };

export interface Rules {
  version: string;
  clamp: { min: number; max: number };
  bands: Band[];
  base: Record<SourceType, { score: number } & Localized>;
  modifiers: Record<ModifierId, { delta: number } & Localized>;
  exclusions: Record<ExclusionId, Localized>;
  hints: { when: string; condition: Condition; text: Localized }[];
}

export const EXCLUDED_BAND = 'EXCLUDED';
export const baseRuleId = (t: SourceType) => `BASE_${t}`;

const fail = (path: string, msg: string): never => {
  throw new RulesError(`scoring rules: ${path}: ${msg}`);
};
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const obj = (v: unknown, path: string) => (isObj(v) ? v : fail(path, 'expected an object'));
const list = (v: unknown, path: string) => (Array.isArray(v) ? v : fail(path, 'expected a list'));
const str = (v: unknown, path: string) => (typeof v === 'string' && v !== '' ? v : fail(path, 'expected a non-empty string'));
const num = (v: unknown, path: string) => (typeof v === 'number' && Number.isFinite(v) ? v : fail(path, 'expected a number'));
const loc = (o: Record<string, unknown>, path: string): Localized => ({ pl: str(o.pl, `${path}.pl`), en: str(o.en, `${path}.en`) });

/** A list of `{id, …}` that must contain exactly the ids the code knows (typos fail loudly). */
function byId<T extends string>(v: unknown, ids: readonly T[], path: string): Record<T, Record<string, unknown>> {
  const out: Record<string, Record<string, unknown>> = {};
  list(v, path).forEach((item, i) => {
    const o = obj(item, `${path}[${i}]`);
    const id = str(o.id, `${path}[${i}].id`);
    if (!(ids as readonly string[]).includes(id)) fail(`${path}[${i}]`, `unknown rule id "${id}"`);
    if (id in out) fail(`${path}[${i}]`, `duplicate rule id "${id}"`);
    out[id] = o;
  });
  for (const id of ids) if (!(id in out)) fail(path, `missing rule "${id}"`);
  return out as Record<T, Record<string, unknown>>;
}

// Hint grammar:  or := and ('||' and)* ;  and := not ('&&' not)* ;  not := '!' not | atom
//                atom := 'band' '==' BAND_ID | RULE_ID | '(' or ')'
function compileCondition(src: string, ruleIds: ReadonlySet<string>, bandIds: ReadonlySet<string>, path: string): Condition {
  const toks = src.match(/==|&&|\|\||!|\(|\)|[A-Za-z_]\w*|\S/g) ?? [];
  let pos = 0;
  const peek = () => toks[pos];
  const eat = (expected?: string): string => {
    const tok = toks[pos++];
    if (tok === undefined || (expected !== undefined && tok !== expected)) fail(path, `unexpected "${tok ?? 'end'}" in "${src}"`);
    return tok as string;
  };
  const or = (): Condition => {
    let l = and();
    while (peek() === '||') {
      eat();
      l = { t: 'or', l, r: and() };
    }
    return l;
  };
  const and = (): Condition => {
    let l = not();
    while (peek() === '&&') {
      eat();
      l = { t: 'and', l, r: not() };
    }
    return l;
  };
  const not = (): Condition => {
    if (peek() !== '!') return atom();
    eat();
    return { t: 'not', e: not() };
  };
  const atom = (): Condition => {
    if (peek() === '(') {
      eat();
      const e = or();
      eat(')');
      return e;
    }
    const id = eat();
    if (id === 'band') {
      eat('==');
      const b = eat();
      return bandIds.has(b) ? { t: 'band', id: b } : fail(path, `unknown band "${b}"`);
    }
    return ruleIds.has(id) ? { t: 'rule', id } : fail(path, `unknown rule "${id}"`);
  };
  const c = or();
  if (pos < toks.length) fail(path, `unexpected "${toks[pos]}" in "${src}"`);
  return c;
}

export function evalCondition(c: Condition, band: string, applied: ReadonlySet<string>): boolean {
  switch (c.t) {
    case 'or':
      return evalCondition(c.l, band, applied) || evalCondition(c.r, band, applied);
    case 'and':
      return evalCondition(c.l, band, applied) && evalCondition(c.r, band, applied);
    case 'not':
      return !evalCondition(c.e, band, applied);
    case 'rule':
      return applied.has(c.id);
    case 'band':
      return band === c.id;
  }
}

/** Parses and validates config/scoring-rules.v1.yaml (the caller reads the file — core does no I/O). */
export function parseRules(yamlText: string): Rules {
  const doc = obj(parse(yamlText), 'root');

  const clampDoc = obj(doc.clamp, 'clamp');
  const clamp = { min: num(clampDoc.min, 'clamp.min'), max: num(clampDoc.max, 'clamp.max') };
  if (clamp.min >= clamp.max) fail('clamp', 'min must be lower than max');

  const bands = list(doc.bands, 'bands').map((b, i): Band => {
    const o = obj(b, `bands[${i}]`);
    const band = { id: str(o.id, `bands[${i}].id`), min: num(o.min, `bands[${i}].min`), max: num(o.max, `bands[${i}].max`), ...loc(o, `bands[${i}]`) };
    return band.min <= band.max ? band : fail(`bands[${i}]`, 'min must not exceed max');
  });
  if (!bands.some((b) => b.id === EXCLUDED_BAND)) fail('bands', `missing band "${EXCLUDED_BAND}"`);
  if (bands.length < 2) fail('bands', 'need at least one non-excluded band');

  const baseDoc = obj(doc.base, 'base');
  for (const k of Object.keys(baseDoc)) if (!(SOURCE_TYPES as readonly string[]).includes(k)) fail('base', `unknown source type "${k}"`);
  const base = Object.fromEntries(
    SOURCE_TYPES.map((t) => {
      const o = obj(baseDoc[t], `base.${t}`);
      return [t, { score: num(o.score, `base.${t}.score`), ...loc(o, `base.${t}`) }];
    }),
  ) as Rules['base'];

  const mods = byId(doc.modifiers, MODIFIER_IDS, 'modifiers');
  const modifiers = Object.fromEntries(
    MODIFIER_IDS.map((id) => [id, { delta: num(mods[id].delta, `modifiers.${id}.delta`), ...loc(mods[id], `modifiers.${id}`) }]),
  ) as Rules['modifiers'];

  const excl = byId(doc.exclusions, EXCLUSION_IDS, 'exclusions');
  const exclusions = Object.fromEntries(EXCLUSION_IDS.map((id) => [id, loc(excl[id], `exclusions.${id}`)])) as Rules['exclusions'];

  const ruleIds = new Set<string>([...SOURCE_TYPES.map(baseRuleId), ...MODIFIER_IDS, ...EXCLUSION_IDS]);
  const bandIds = new Set(bands.map((b) => b.id));
  const hints = list(doc.hints ?? [], 'hints').map((h, i) => {
    const o = obj(h, `hints[${i}]`);
    const when = str(o.when, `hints[${i}].when`);
    return { when, condition: compileCondition(when, ruleIds, bandIds, `hints[${i}].when`), text: loc(o, `hints[${i}]`) };
  });

  return { version: str(doc.version, 'version'), clamp, bands, base, modifiers, exclusions, hints };
}
