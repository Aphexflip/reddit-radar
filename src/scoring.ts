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
  rawSignalCount: number;
  effectiveSignalCount: number;
  effectiveSignalTypes: string[];
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

export interface DecisionPolicy {
  opportunityThreshold: number;
  directionalThreshold: number;
  maxOptionDebitUsd?: number;
  lane?: "strategy" | "exploration";
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

const DEFAULT_DECISION_POLICY: DecisionPolicy = {
  opportunityThreshold: 0.60,
  directionalThreshold: 0.20,
  lane: "strategy",
};

const clamp = (value: number, min = 0, max = 1): number =>
  Math.max(min, Math.min(max, value));

const directionSign = (direction: DirectionHint | null): number => {
  if (direction === "bullish") return 1;
  if (direction === "bearish") return -1;
  return 0;
};

function observedTime(signal: SignalForScoring): number {
  const parsed = Date.parse(signal.observed_at);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * A rolling data collector can emit the same feature type many times during the
 * scoring lookback. Those observations remain immutable evidence, but they are
 * not independent votes. For a point-in-time decision we use the newest value
 * for each feature type so polling frequency cannot manufacture confidence.
 */
export function latestSignalPerType(signals: SignalForScoring[]): SignalForScoring[] {
  const latest = new Map<string, SignalForScoring>();

  for (const signal of signals) {
    const type = signal.signal_type.trim() || "unknown";
    const existing = latest.get(type);
    if (!existing) {
      latest.set(type, signal);
      continue;
    }

    const candidateTime = observedTime(signal);
    const existingTime = observedTime(existing);
    if (
      candidateTime > existingTime ||
      (candidateTime === existingTime && signal.confidence > existing.confidence)
    ) {
      latest.set(type, signal);
    }
  }

  return [...latest.values()].sort((a, b) => observedTime(b) - observedTime(a));
}

export function scoreSignals(signals: SignalForScoring[]): SignalScore {
  const effectiveSignals = latestSignalPerType(signals);
  if (effectiveSignals.length === 0) {
    return {
      directionalScore: 0,
      confidence: 0,
      dataQuality: 0,
      opportunityScore: 0,
      bullishSignalIds: [],
      bearishSignalIds: [],
      neutralSignalIds: [],
      rawSignalCount: signals.length,
      effectiveSignalCount: 0,
      effectiveSignalTypes: [],
    };
  }

  let weightedDirection = 0;
  let directionalConfidenceWeight = 0;
  let confidenceTotal = 0;
  const bullishSignalIds: string[] = [];
  const bearishSignalIds: string[] = [];
  const neutralSignalIds: string[] = [];

  for (const signal of effectiveSignals) {
    const confidence = clamp(signal.confidence);
    const sign = directionSign(signal.direction_hint);
    const strength = signal.normalized_value === null
      ? 0.35
      : clamp(Math.abs(signal.normalized_value));

    if (sign !== 0) {
      weightedDirection += sign * strength * confidence;
      directionalConfidenceWeight += confidence;
    }
    confidenceTotal += confidence;

    if (sign > 0) bullishSignalIds.push(signal.id);
    else if (sign < 0) bearishSignalIds.push(signal.id);
    else neutralSignalIds.push(signal.id);
  }

  const directionalScore = directionalConfidenceWeight > 0
    ? clamp(weightedDirection / directionalConfidenceWeight, -1, 1)
    : 0;
  const averageConfidence = confidenceTotal / effectiveSignals.length;
  const evidenceDepth = clamp(effectiveSignals.length / 6);
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
    rawSignalCount: signals.length,
    effectiveSignalCount: effectiveSignals.length,
    effectiveSignalTypes: effectiveSignals.map((signal) => signal.signal_type),
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
  policy: DecisionPolicy = DEFAULT_DECISION_POLICY,
): OpportunityDecision {
  const signalScore = scoreSignals(signals);
  const reasons: string[] = [];
  const opportunityThreshold = clamp(policy.opportunityThreshold);
  const directionalThreshold = clamp(policy.directionalThreshold);

  if (signalScore.effectiveSignalCount === 0) {
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

  if (
    signalScore.opportunityScore < opportunityThreshold ||
    Math.abs(signalScore.directionalScore) < directionalThreshold
  ) {
    reasons.push(
      `Evidence does not clear the ${policy.lane ?? "strategy"} gate ` +
      `(opportunity ${signalScore.opportunityScore.toFixed(3)}/${opportunityThreshold.toFixed(2)}, ` +
      `|direction| ${Math.abs(signalScore.directionalScore).toFixed(3)}/${directionalThreshold.toFixed(2)}).`,
    );
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
  const maxDebit = policy.maxOptionDebitUsd;
  const scored = options
    .filter((option) => option.option_type === requiredOptionType)
    .filter((option) => maxDebit === undefined || (option.ask * 100) <= maxDebit)
    .map((option) => scoreOptionCandidate(option, nowIso))
    .filter((item): item is ScoredOption => item !== null)
    .sort((a, b) => b.score - a.score);

  const selectedOption = scored[0] ?? null;
  if (!selectedOption) {
    reasons.push(`Underlying thesis is ${direction}, but no ${requiredOptionType} passes liquidity/DTE quality gates${maxDebit === undefined ? "" : ` within the $${maxDebit.toFixed(0)} exploration debit cap`}.`);
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
  const estimatedEvScore = clamp(signalScore.opportunityScore * optionExpressionScore);
  const absDelta = Math.abs(selectedOption.option.delta ?? 0.35);
  const leverageProxy = clamp((0.50 - Math.min(absDelta, 0.50)) / 0.50);
  const moonshotScore = clamp((0.65 * estimatedEvScore) + (0.35 * leverageProxy));

  reasons.push(
    `${signalScore.effectiveSignalCount} distinct timestamped signal type(s) clear the ${policy.lane ?? "strategy"} evidence gate ` +
    `(${signalScore.rawSignalCount} raw observations in lookback).`,
  );
  reasons.push(`Selected ${selectedOption.option.contract_symbol} after liquidity, spread, delta, DTE${maxDebit === undefined ? "" : ", and exploration debit"} gates.`);

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
