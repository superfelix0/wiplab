(() => {
  window.WIPLabs = window.WIPLabs || {};
  window.WIPLabs.loadData = async (url) => { const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}ts=${Date.now()}`, { cache: "no-store" }); if (!response.ok) throw new Error(`Could not load ${url}`); return response.json(); };
  window.WIPLabs.wireDeepLinks = (root = document) => {
    const focus = () => { const target = document.getElementById(location.hash.slice(1)); if (!target) return; target.classList.add("wl-flash"); target.tabIndex = -1; target.focus({ preventScroll: true }); window.setTimeout(() => target.classList.remove("wl-flash"), 1800); };
    root.querySelectorAll('a[href*="#"]').forEach((link) => link.addEventListener("click", () => window.setTimeout(focus, 0)));
    window.addEventListener("hashchange", focus); focus();
  };
  const stateCopy = {
    valuation: { ko: { low: "역사적 하단", mid: "역사적 중심", high: "역사적 상단" }, en: { low: "Historical lower range", mid: "Historical middle range", high: "Historical upper range" } },
    risk: { ko: { normal: "정상", watch: "관찰", caution: "주의", alert: "경계", danger: "위험" }, en: { normal: "Normal", watch: "Watch", caution: "Caution", alert: "Alert", danger: "Risk" } },
    flow: { ko: { aligned: "수급 동행", unrelated: "방향 주도 불명", insufficient: "데이터 부족" }, en: { aligned: "Flow aligned", unrelated: "Direction leader unclear", insufficient: "Insufficient history" } },
    capex: { ko: { normal: "투자 여력", elevated: "투자 확대", strained: "투자 부담" }, en: { normal: "Capacity available", elevated: "Investment elevated", strained: "Investment strain" } },
    memory: { ko: { expanding: "실적 확장", flat: "실적 보합", contracting: "실적 둔화" }, en: { expanding: "Earnings expanding", flat: "Earnings flat", contracting: "Earnings contracting" } },
  };
  const pageAxis = () => {
    const path = location.pathname;
    if (path.includes("valuation")) return "valuation";
    if (path.includes("sentiment-risk")) return "risk";
    if (path.includes("market-flow")) return "flow";
    if (path.includes("ai-capex")) return "capex";
    if (path.includes("memory-earnings")) return "memory";
    return null;
  };
  const addRegimeBanner = async () => {
    const axisId = pageAxis();
    const hero = document.querySelector(".service-hero");
    if (!axisId || !hero || document.querySelector(".wl-regime-banner")) return;
    try {
      const state = await window.WIPLabs.loadData("/data/daily-state.json");
      const axis = state?.regime?.axes?.find((item) => item.id === axisId);
      if (!axis) return;
      const locale = document.documentElement.lang.startsWith("en") ? "en" : "ko";
      const label = stateCopy[axisId]?.[locale]?.[axis.state] || axis.state;
      const banner = document.createElement("p");
      banner.className = "wl-regime-banner";
      banner.textContent = locale === "en" ? `Current shared regime: ${label} · data date ${state.meta?.basisDate || "--"}` : `공통 상태: ${label} · 데이터 기준일 ${state.meta?.basisDate || "--"}`;
      hero.append(banner);
    } catch { /* Individual page data remains usable if the common state is unavailable. */ }
  };
  document.addEventListener("DOMContentLoaded", () => { window.WIPLabs.wireDeepLinks(); addRegimeBanner(); });
})();
