(() => {
  if (window.__wipMarketPreviewLoaded) return;
  window.__wipMarketPreviewLoaded = true;
  let root = document.querySelector("#usMarketPreview");
  const en = document.documentElement.lang?.startsWith("en");
  const t = (ko, english) => en ? english : ko;
  const number = new Intl.NumberFormat(en ? "en-US" : "ko-KR", { maximumFractionDigits: 2 });
  if (!root) {
    const path = window.location.pathname.replace(/\/$/, "");
    if (path !== "" && path !== "/en") return;
    root = document.createElement("section");
    root.className = "us-market-preview";
    root.id = "usMarketPreview";
    root.setAttribute("aria-labelledby", "preview-title");
    root.innerHTML = `<div class="section-title"><div><p class="eyebrow">U.S. MARKET PREVIEW</p><h2 id="preview-title">${t("미국 장 전·후와 예정 실적", "U.S. pre/post market and earnings")}</h2></div></div><div class="us-preview-grid"><section><h3>${t("미국 시장 미리보기", "U.S. market preview")}</h3><div class="us-preview-quotes" data-preview-quotes></div><small data-preview-source></small></section><section><h3>${t("관심 기업 실적 일정", "Watchlist earnings")}</h3><ul class="us-preview-events" data-preview-events></ul><small>${t("출처: Nasdaq Earnings Calendar", "Source: Nasdaq Earnings Calendar")}</small></section></div>`;
    document.querySelector(".market-sentiment-panel")?.after(root);
  }

  const pct = (value) => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%` : "--";
  const eventTime = (value) => {
    if (value === "time-after-hours") return t("장 마감 후", "After market close");
    if (value === "time-pre-market") return t("장 전", "Before market open");
    return value || t("시간 미정", "Time TBD");
  };
  const eventText = (event) => `${event.name} (${event.symbol}) · ${event.date} · ${eventTime(event.time)}`;

  function renderQuotes(data) {
    const items = data?.items || [];
    const state = (item) => {
      const value = String(item.marketState || "").toUpperCase();
      if (value === "PRE") return t("장 전", "Pre-market");
      if (value === "POST") return t("시간 외", "After-hours");
      if (value === "REGULAR") return t("정규장", "Regular session");
      return t("최근 시세", "Latest quote");
    };
    root.querySelector("[data-preview-quotes]").innerHTML = items.length
      ? items.map((item) => `<article><span>${item.label}</span><strong>${number.format(item.price)}</strong><small class="${item.changePct > 0 ? "positive" : item.changePct < 0 ? "negative" : ""}">${pct(item.changePct)} · ${state(item)}</small></article>`).join("")
      : `<p class="empty-note">${t("미국 장 전·후 시세 원천 응답을 기다리고 있습니다.", "Waiting for the U.S. pre/post-market quote source.")}</p>`;
    root.querySelector("[data-preview-source]").textContent = items.length
      ? t("출처: Yahoo Finance 공개 차트 시세 · 무료 시세는 지연될 수 있습니다.", "Source: Yahoo Finance public chart quotes · free quotes may be delayed.")
      : t("시세 원천: Yahoo Finance 공개 차트 시세", "Quote source: Yahoo Finance public chart endpoint");
  }

  function renderEvents(data) {
    const events = data?.events || [];
    root.querySelector("[data-preview-events]").innerHTML = events.length
      ? events.slice(0, 4).map((event) => `<li>${eventText(event)}</li>`).join("")
      : `<li>${t("다음 자동 수집 후 관심 기업의 실적 일정이 표시됩니다.", "Watchlist earnings dates will appear after the next successful collection.")}</li>`;
  }

  Promise.all([
    fetch(`/api/us-market-preview?ts=${Date.now()}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    fetch(`/data/us-market-events.json?ts=${Date.now()}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
  ]).then(([quotes, events]) => { renderQuotes(quotes); renderEvents(events); }).catch(() => { renderQuotes(null); renderEvents(null); });
})();
