import { readFileSync } from 'node:fs';
import { Injectable } from '@nestjs/common';
import { parseRules, type Rules } from '@olcys/core';
import { repoPath } from './paths.js';

/** Loads the scoring rules once at startup; an invalid file stops the API (fail fast). */
@Injectable()
export class RulesService {
  readonly rules: Rules;

  constructor() {
    this.rules = parseRules(readFileSync(repoPath(process.env.SCORING_RULES_FILE ?? 'config/scoring-rules.v1.yaml'), 'utf8'));
  }
}
