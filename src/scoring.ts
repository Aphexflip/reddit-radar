export type DirectionHint = "bullish" | "bearish" | "neutral" | "mixed";
export type OptionType = "call" | "put";

export interface SignalForScoring {
  id: string;
  signal_type: string;
  observed_at: string;
  normalized_value: number | null;
  direction_hint: DirectionHint | null;
  confidence: number;
}

export interface OptionCandidate {
  contract_symbol: string;
  option_type: OptionType;
  strike: number;
  expiration_date: string;
  observed_at: string;
  provider: string;
  underlying_price: number;
  bid: number;
  ask: number;
  mark?: number;
  volume?: number;
  open_interest?: number;
  implied_volatility?: number;
  delta?: number;
  gamma?: number;
  theta?: number;
  vega?: number;
}

export interface SignalScore {
  directionalScore: number;
  confidence: number;
  dataQuality: number;
  opportunityScore: number;
  bullishSignalIds: string[];
  bearishSignalIds: string[];
  neutralSignalIds: string[];
}

export interface ScoredOption {
  option: OptionCandidate;
  score: number;
  liquidityScore: number;
  deltaFit: number;
  dteFit: number;
  spreadPct: number;
  dte: number;
}

export interface OpportunityDecision {
  recommendation: "CALL" | "PUT" | "PASS";
  direction: "bullish" | "bearish" | "neutral";
  signalScore: SignalScore;
  selectedOption: ScoredOption | null;
  optionExpressionScore: number;
  estimatedEvScore: number;
  moonshotScore: number;
  reasons: string[];
}

const clamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, value));

const directionSign = (direction: DirectionHint | null): number => {
  if (direction === "bullish") return 1;
  if (direction === "bearish") return -1;
  return 0;
};

export function scoreSignals(signals: SignalForScoring[]): SignalScore {
  if (signals.length === 0) {
    return {
      directionalScore: 0,
      confidence: 0,
      dataQuality: 0,
      opportunityScore: 0,
      bullishSignalIds: [],
      bearishSignalIds: [],
      neutralSignalIds: [],
    };
  }

  let weightedDirection = 0;
  let confidenceWeight = 0;
  let confidenceTotal = 0;
  const bullishSignalIds: string[] = [];
  const bearishSignalIds: string[] = [];
  const neutralSignalIds: string[] = [];

  for (const signal of signals) {
    const confidence = clamp(signal.confidence);
    const sign = directionSign(signal.direction_hint);
    // Upstream features are expected to normalize comparable signal strength into 0..1.
    // Missing normalized strength is deliberately treated as weak evidence rather than
    // guessing how an arbitrary raw number should scale.
    const strength = signal.normalized_value === null
      ? 0.35
      : clamp(Math.abs(signal.normalized_value));

    weightedDirection += sign * strength * confidence;
    confidenceWeight += confidence;
    confidenceTotal += confidence;

    if (sign > 0) bullishSignalIds.push(signal.id);
    else if (sign < 0) bearishSignalIds.push(signal.id);
    else neutralSignalIds.push(signal.id);
  }

  const directionalScore = confidenceWeight > 0
    ? clamp(weightedDirection / confidenceWeight, -1, 1)
    : 0;
  const averageConfidence = confidenceTotal / signals.length;
  const evidenceDepth = clamp(signals.length / 6);
  const dataQuality = clamp((0.55 * averageConfidence) + (0.45 * evidenceDepth));
  const confidence = clamp((0.60 * Math.abs(directionalScore)) + (0.40 * averageConfidence));
  const opportunityScore = clamp(
    (0.55 * Math.abs(directionalScore)) +
    (0.25 * averageConfidence) +
    (0.20 * dataQuality),
  );

  return {
    directionalScore,
    confidence,
    dataQuality,
    opportunityScore,
    bullishSignalIds,
    bearishSignalIds,
    neutralSignalIds,
  };
}

export function daysToExpiration(expirationDate: string, nowIso: string): number {
  const expiration = new Date(`${expirationDate}T20:00:00.000Z`).getTime();
  const now = new Date(nowIso).getTime();
  return Math.max(0, (expiration - now) / 86_400_000);
}

export function optionSpreadPct(option: OptionCandidate): number {
  if (option.ask <= 0 || option.bid < 0 || option.ask < option.bid) return Number.POSITIVE_INFINITY;
  const mid = (option.ask + option.bid) / 2;
  if (mid <= 0) return Number.POSITIVE_INFINITY;
  return (option.ask - option.bid) / mid;
}

export function scoreOptionCandidate(option: OptionCandidate, nowIso: string): ScoredOption | null {
  const spreadPct = optionSpreadPct(option);
  const dte = daysToExpiration(option.expiration_date, nowIso);
  const openInterest = option.open_interest ?? 0;
  const volume = option.volume ?? 0;

  // v0.1 quality gate. This is intentionally not a budget filter; the best contract
  // can be recommended even when execution policy later requires escalation.
  if (
    !Number.isFinite(spreadPct) ||
    spreadPct > 0.25 ||
    dte < 7 ||
    option.ask <= 0 ||
    openInterest < 25 ||
    volume < 5
  ) {
    return null;
  }

  const spreadScore = clamp(1 - (spreadPct / 0.25));
  const oiScore = clamp(Math.log10(openInterest + 1) / 4);
  const volumeScore = clamp(Math.log10(volume + 1) / 3);
  const liquidityScore = clamp((0.50 * spreadScore) + (0.30 * oiScore) + (0.20 * volumeScore));

  const absDelta = Math.abs(option.delta ?? 0.35);
  const deltaFit = clamp(1 - (Math.abs(absDelta - 0.35) / 0.35));

  let dteFit = 0.55;
  if (dte >= 14 && dte <= 45) dteFit = 1;
  else if (dte >= 7 && dte <= 60) dteFit = 0.75;

  const score = clamp((0.55 * liquidityScore) + (0.30 * deltaFit) + (0.15 * dteFit));
  return { option, score, liquidityScore, deltaFit, dteFit, spreadPct, dte };
}

export function decideOpportunity(
  signals: SignalForScoring[],
  options: OptionCandidate[],
  nowIso: string,
): OpportunityDecision {
  const signalScore = scoreSignals(signals);
  const reasons: string[] = [];

  if (signals.length === 0) {
    reasons.push("No timestamped signals are available for the entity.");
    return {
      recommendation: "PASS",
      direction: "neutral",
      signalScore,
      selectedOption: null,
      optionExpressionScore: 0,
      estimatedEvScore: 0,
      moonshotScore: 0,
      reasons,
    };
  }

  if (signalScore.opportunityScore < 0.60 || Math.abs(signalScore.directionalScore) < 0.20) {
    reasons.push("Evidence does not clear the v0.1 opportunity threshold.");
    return {
      recommendation: "PASS",
      direction: "neutral",
      signalScore,
      selectedOption: null,
      optionExpressionScore: 0,
      estimatedEvScore: 0,
      moonshotScore: 0,
      reasons,
    };
  }

  const direction = signalScore.directionalScore > 0 ? "bullish" : "bearish";
  const requiredOptionType: OptionType = direction === "bullish" ? "call" : "put";
  const scored = options
    .filter((option) => option.option_type === requiredOptionType)
    .map((option) => scoreOptionCandidate(option, nowIso))
    .filter((item): item is ScoredOption => item !== null)
    .sort((a, b) => b.score - a.score);

  const selectedOption = scored[0] ?? null;
  if (!selectedOption) {
    reasons.push(`Underlying thesis is ${direction}, but no ${requiredOptionType} passes liquidity/DTE quality gates.`);
    reasons.push("A good stock thesis is not enough to justify a bad option.");
    return {
      recommendation: "PASS",
      direction,
      signalScore,
      selectedOption: null,
      optionExpressionScore: 0,
      estimatedEvScore: 0,
      moonshotScore: 0,
      reasons,
    };
  }

  const optionExpressionScore = selectedOption.score;
  // This is a ranking score, NOT a calibrated dollar EV estimate. Calibration will be
  // learned from the immutable outcome ledger before live capital is allowed to scale.
  const estimatedEvScore = clamp(signalScore.opportunityScore * optionExpressionScore);
  const absDelta = Math.abs(selectedOption.option.delta ?? 0.35);
  const leverageProxy = clamp((0.50 - Math.min(absDelta, 0.50)) / 0.50);
  const moonshotScore = clamp((0.65 * estimatedEvScore) + (0.35 * leverageProxy));

  reasons.push(`${signals.length} timestamped signal(s) clear the underlying evidence threshold.`);
  reasons.push(`Selected ${selectedOption.option.contract_symbol} after liquidity, spread, delta, and DTE gates.`);

  return {
    recommendation: direction === "bullish" ? "CALL" : "PUT",
    direction,
    signalScore,
    selectedOption,
    optionExpressionScore,
    estimatedEvScore,
    moonshotScore,
    reasons,
  };
}
