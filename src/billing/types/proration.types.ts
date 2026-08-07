export interface ProrationInput {
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  effectiveAt: Date;
  currentPeriodAmount: number;
}

export interface ProrationResult {
  totalMilliseconds: number;
  remainingMilliseconds: number;
  elapsedMilliseconds: number;
  remainingRatio: number;
  creditAmount: number;
}
