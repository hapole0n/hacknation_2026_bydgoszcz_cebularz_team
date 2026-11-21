import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Injectable } from '@nestjs/common';
import { parseRules, type Rules } from '@olcys/core';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

/** Loads the scoring rules once at startup; an invalid file stops the API (fail fast). */
@Injectable()
export class RulesService {
  readonly rules: Rules;

  constructor() {
    const file = resolve(repoRoot, process.env.SCORING_RULES_FILE ?? 'config/scoring-rules.v1.yaml');
    this.rules = parseRules(readFileSync(file, 'utf8'));
  }
}
