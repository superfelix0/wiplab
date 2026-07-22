(() => {
  const path = window.location.pathname.replace(/\/+$/, "") || "/";
  const isEn = document.documentElement.lang?.toLowerCase().startsWith("en");
  const glossary = "/glossary/";
  const termsByPath = {
    "/valuation": [
      ["PER", "per"], ["Forward PER", "forward-per"],
      [isEn ? "Historical PER" : "역사적 평균 PER", "historical-per"],
    ],
    "/sentiment-risk": [
      ["VKOSPI", "vkospi"], [isEn ? "Retail net-buying z-score" : "개인 순매수 z-score", "retail-zscore"],
      [isEn ? "Bear-market risk score" : "약세장 위험 점수", "bear-market-risk-score"],
    ],
    "/ai-capex": [["CAPEX/OCF", "capex-ratio"], [isEn ? "Hyperscaler" : "하이퍼스케일러", "hyperscaler"]],
    "/memory-earnings": [["QoQ / YoY", "qoq-yoy"], ["PER", "per"]],
    "/market-flow": [[isEn ? "Investor types" : "매매주체", "investor-types"], [isEn ? "Foreign spot/futures flow" : "외국인 현물·선물 수급", "foreign-spot-futures"]],
  };
  const key = path.replace(/^\/en/, "") || "/";
  const terms = termsByPath[key];
  if (isEn) {
    document.querySelectorAll(".footer-glossary").forEach((link) => { link.textContent = "Glossary (KO)"; });
  }
  if (!terms || document.querySelector(".glossary-deep-links")) return;
  const target = document.querySelector("main .source-panel") || document.querySelector("main");
  if (!target) return;
  const section = document.createElement("nav");
  section.className = "glossary-deep-links";
  section.setAttribute("aria-label", isEn ? "Glossary links" : "용어해설 바로가기");
  section.innerHTML = `<span>${isEn ? "Korean glossary terms" : "이 페이지의 용어"}</span>${terms.map(([label, slug]) => `<a href="${glossary}${slug}/">${label}</a>`).join("")}`;
  target.before(section);
})();
