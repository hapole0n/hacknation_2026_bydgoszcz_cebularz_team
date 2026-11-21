// Pure domain logic (no I/O): extraction, classification, scoring — indicators and diff come later.
export * from './chain.js';
export * from './types.js';
export * from './extract/validate.js';
export * from './extract/extract.js';
export * from './context/classify.js';
export * from './scoring/rules.js';
export * from './scoring/score.js';
export * from './identity.js';
export * from './labels.js';
export * from './chain/model.js';
export * from './chain/classify.js';
export * from './chain/indicators.js';
export * from './app.js';
export * from './report/pl.js';
export * from './report/build.js';
export * from './report/hash.js';
