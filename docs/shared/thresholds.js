/* Single source of truth for WIP Labs regime labels. See RENEWAL/THRESHOLDS.md. */
export const VALUATION = {
  enter: { low: 30, high: 70 }, exit: { low: 35, high: 65 },
  labels: { low: "역사적 하단", mid: "역사적 중심", high: "역사적 상단" },
};
export const CAPEX = { level: { enter: { elevated: 70, over: 100 }, exit: { elevated: 65, over: 90 } }, persistence: { strainedQuarters: 2, risingQuarters: 3, exitQuarters: 2 } };
export const MEMORY = { cycle: { dirQuarters: 2, marginDeadband: 0.5, marginMedianQuarters: 32 }, price: { bigOpQoQ: 10, mutedPrice: 5 } };
export const FLOW = { window: 60, recentWindow: 20, flatReturnPct: 0.05, enter: { aligned: 63, contrarian: 37 }, exit: { aligned: 57, contrarian: 43 }, leader: { maxAlignedSubjects: 1, sizeRankWithin: 2 } };
export const RISK = { stages: ["normal", "watch", "caution", "alert", "danger"], labels: { normal: "정상", watch: "관찰", caution: "주의", alert: "경계", danger: "위험" }, bands: [{ stage: "danger", minPct: 80 }, { stage: "alert", minPct: 60 }, { stage: "caution", minPct: 40 }, { stage: "watch", minPct: 20 }, { stage: "normal", minPct: 0 }], deescalateWeeks: 2, indicatorMax: 2 };
export function riskStageFor(totalScore, maxScore) { return RISK.bands.find((band) => (totalScore / maxScore) * 100 >= band.minPct).stage; }
export function riskStageWithHysteresis(rawStage, prevStage, lowerWeeks = 0) { if (!prevStage) return rawStage; const raw = RISK.stages.indexOf(rawStage), prev = RISK.stages.indexOf(prevStage); if (raw >= prev) return rawStage; return lowerWeeks >= RISK.deescalateWeeks ? rawStage : prevStage; }
export function applyHysteresis(previous, candidate, stillHolds) { return previous == null || previous === candidate || !stillHolds(previous) ? candidate : previous; }
