(() => {
  const english = document.documentElement.lang === "en" || document.body.dataset.lang === "en";
  const copy = english
    ? { retail: "L1 · RETAIL SENTIMENT", risk: "L2 · STRUCTURAL RISK", history: "L3 · RISK HISTORY" }
    : { retail: "L1 · 개인 수급 심리", risk: "L2 · 구조적 약세장 위험", history: "L3 · 위험 이력" };

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

  const addKicker = (section, label) => {
    if (!section || section.querySelector(":scope > .wl-kicker")) return;
    const kicker = document.createElement("p");
    kicker.className = "wl-kicker";
    kicker.textContent = label;
    section.prepend(kicker);
  };

  const retail = main.querySelector(".sentiment-dashboard");
  if (retail) {
    retail.id = "retail-sentiment";
    retail.classList.add("wl-section");
    addKicker(retail, copy.retail);
  }

  const risk = main.querySelector(".risk-dashboard");
  if (risk) {
    risk.id = "risk-score";
    risk.classList.add("wl-section");
    addKicker(risk, copy.risk);
    const chart = risk.querySelector(".chart-panel");
    if (chart && !chart.previousElementSibling?.classList.contains("wl-kicker")) {
      const kicker = document.createElement("p");
      kicker.className = "wl-kicker wl-history-kicker";
      kicker.textContent = copy.history;
      chart.before(kicker);
    }
  }
})();
