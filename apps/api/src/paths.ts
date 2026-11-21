import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Repo root: apps/api/src (dev) and apps/api/dist (build) are both three levels below it. */
export const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
export const repoPath = (relative: string) => resolve(repoRoot, relative);

export const APP_VERSION: string = JSON.parse(readFileSync(repoPath('apps/api/package.json'), 'utf8')).version;
