/*
 * WIP Labs 상태 판정의 단일 원천.
 * 상세 페이지와 daily-state 생성기는 이 파일의 상수·함수만 사용한다.
 * 근거와 운영 원칙은 RENEWAL/a2/SPEC.md 및 THRESHOLDS.md를 따른다.
 */

export const VALUATION = {
  states: ["low", "mid", "high"],
  labels: { low: "역사적 하단", mid: "역사적 중심", high: "역사적 상단" },
  enter: { low: 30, high: 70 },
  exit: { low: 35, high: 65 },
};

export const CAPEX = {
  states: ["comfortable", "elevated", "strained"],
  level: { enter: { elevated: 70, over: 100 }, exit: { elevated: 65, over: 90 } },
  persistence: { strainedQuarters: 2, risingQuarters: 3, exitQuarters: 2 },
};

export const MEMORY = {
  cycle: { dirQuarters: 2, marginDeadband: 0.5, marginMedianQuarters: 32 },
  price: { bigOpQoQ: 10, mutedPrice: 5 },
};

/*
 * 수급은 사용자가 정한 30영업일 방향 + 5영업일 변화 확인 구조다.
 * 비율 임계값은 창 길이에 따라 계산하므로, 기간만 바꾸고 수치를 고정하면 안 된다.
 */
export const FLOW = {
  window: 30,
  shortWindow: 5,
  flatReturnPct: 0.3,
  sigma: 2,
  exitSigma: 1.1,
  leader: { maxAlignedSubjects: 1, sizeRankWithin: 2 },
};

export function alignedThresholdFor(windowSize, sigma = FLOW.sigma) {
  const standardError = Math.sqrt(0.25 / windowSize) * 100;
  const halfBand = sigma * standardError;
  return {
    aligned: +(50 + halfBand).toFixed(1),
    contrarian: +(50 - halfBand).toFixed(1),
  };
}

export function flowThresholds(windowSize = FLOW.window) {
  return {
    enter: alignedThresholdFor(windowSize, FLOW.sigma),
    exit: alignedThresholdFor(windowSize, FLOW.exitSigma),
  };
}

export const RISK = {
  stages: ["normal", "watch", "caution", "alert", "danger"],
  labels: { normal: "정상", watch: "관찰", caution: "주의", alert: "경계", danger: "위험" },
  bands: [
    { stage: "danger", minPct: 80 }, { stage: "alert", minPct: 60 },
    { stage: "caution", minPct: 40 }, { stage: "watch", minPct: 20 },
    { stage: "normal", minPct: 0 },
  ],
  deescalateWeeks: 2,
  indicatorMax: 2,
};

export function riskStageFor(totalScore, maxScore) {
  const ratio = maxScore ? (totalScore / maxScore) * 100 : 0;
  return RISK.bands.find((band) => ratio >= band.minPct).stage;
}

export function riskStageWithHysteresis(rawStage, prevStage, lowerWeeks = 0) {
  if (!prevStage) return rawStage;
  const raw = RISK.stages.indexOf(rawStage);
  const prev = RISK.stages.indexOf(prevStage);
  if (raw >= prev) return rawStage;
  return lowerWeeks >= RISK.deescalateWeeks ? rawStage : prevStage;
}

export function applyHysteresis(previous, candidate, stillHolds) {
  if (previous == null || previous === candidate) return candidate;
  return stillHolds(previous) ? previous : candidate;
}
