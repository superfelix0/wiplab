(() => {
  const english = document.documentElement.lang === "en" || document.body.dataset.lang === "en";
  const copy = english
    ? { current: "L1 · CURRENT CAPACITY", results: "LATEST RESULTS", reading: "HOW TO READ", compare: "L2 · COMPANY COMPARISON", trend: "L3 · QUARTERLY TREND" }
    : { current: "L1 · 현재 투자 여력", results: "최근 결산 핵심", reading: "해석", compare: "L2 · 기업별 비교", trend: "L3 · 분기 추세" };

  const main = document.querySelector("main");
  if (!main) return;
  main.classList.add("wl");

  const hero = main.querySelector(".service-hero");
  if (hero) {
    hero.classList.remove("hero", "service-hero");
    hero.classList.add("wl-head");
    hero.querySelector(".eyebrow")?.classList.add("wl-eyebrow");
    hero.querySelector("h1")?.classList.add("wl-title");
    hero.querySelector(".hero-copy")?.classList.add("wl-lede");
  }

  const dashboard = main.querySelector(".earnings-dashboard");
  if (!dashboard) return;
  dashboard.classList.add("wl-section");
  const addKicker = (target, label) => {
    if (!target || target.querySelector(":scope > .wl-kicker")) return;
    const kicker = document.createElement("p");
    kicker.className = "wl-kicker";
    kicker.textContent = label;
    target.prepend(kicker);
  };

  addKicker(dashboard, copy.current);
  addKicker(dashboard.querySelector(".earnings-release-panel"), copy.results);
  addKicker(dashboard.querySelector(".earnings-takeaway-panel"), copy.reading);

  const observeDynamicPanels = () => {
    const compare = dashboard.querySelector("#capex-compare .capex-structure-head > div > span");
    const trend = dashboard.querySelector("#capex-trend .capex-structure-head > div > span");
    if (compare && compare.textContent !== copy.compare) compare.textContent = copy.compare;
    if (trend && trend.textContent !== copy.trend) trend.textContent = copy.trend;
  };
  observeDynamicPanels();
  new MutationObserver(observeDynamicPanels).observe(dashboard, { childList: true, subtree: true });
})();
