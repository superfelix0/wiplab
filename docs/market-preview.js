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
    root.innerHTML = `<div class="section-title"><div><p class="eyebrow">U.S. MARKET PREVIEW</p><h2 id="preview-title">${t("미국 장 전·후와 예정 실적", "U.S. pre/post market and earnings")}</h2></div></div><p class="us-preview-summary" data-preview-summary>${t("미국 시세와 일정 변화를 불러오는 중입니다.", "Loading U.S. quote and event changes.")}</p><div class="us-preview-grid"><section><h3>${t("미국 시장 미리보기", "U.S. market preview")}</h3><div class="us-preview-quotes" data-preview-quotes></div><small data-preview-source></small></section><section><h3>${t("관심 기업 실적 일정", "Watchlist earnings")}</h3><ul class="us-preview-events" data-preview-events></ul><small>${t("출처: Nasdaq Earnings Calendar", "Source: Nasdaq Earnings Calendar")}</small></section></div>`;
    document.querySelector(".market-sentiment-panel")?.after(root);
  }

  const pct = (value) => Number.isFinite(value) ? `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%` : "--";
  const eventTime = (value) => {
    if (value === "time-after-hours") return t("장 마감 후", "After market close");
    if (value === "time-pre-market") return t("장 전", "Before market open");
    return value || t("시간 미정", "Time TBD");
  };
  const todayKst = () => {
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const daysUntil = (date) => Math.round((new Date(`${date}T00:00:00Z`) - new Date(`${todayKst()}T00:00:00Z`)) / 86400000);
  const dDay = (date) => {
    const days = daysUntil(date);
    return days === 0 ? "D-day" : days > 0 ? `D-${days}` : t("발표일 경과", "Reported date passed");
  };
  const eventText = (event, releaseSymbols) => {
    const days = daysUntil(event.date);
    const releaseState = days < 0
      ? releaseSymbols.has(event.symbol)
        ? t("데이터 반영 완료", "Data update complete")
        : t("발표 확인 대기", "Awaiting data confirmation")
      : dDay(event.date);
    return `${event.name} (${event.symbol}) · ${releaseState} · ${event.date} · ${eventTime(event.time)}`;
  };

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
    const lead = items.find((item) => item.id === "nasdaq-futures") || items[0];
    const semi = items.find((item) => item.id === "semiconductor");
    const summary = root.querySelector("[data-preview-summary]");
    if (summary) summary.textContent = lead
      ? t(
        `미국 시장 미리보기: ${lead.label} ${pct(lead.changePct)}${semi ? ` · ${semi.label} ${pct(semi.changePct)}` : ""}.`,
        `U.S. preview: ${lead.label} ${pct(lead.changePct)}${semi ? ` · ${semi.label} ${pct(semi.changePct)}` : ""}.`
      )
      : t("미국 시장 미리보기 원천 응답을 기다리고 있습니다.", "Waiting for the U.S. market-preview source.");
  }

  function renderEvents(data, earnings) {
    const events = data?.events || [];
    const symbolsByCompany = new Map((earnings?.companies || []).map((company) => [company.id, company.symbol]));
    const releaseSymbols = new Set((earnings?.releaseHistory || []).map((release) => symbolsByCompany.get(release.companyId)).filter(Boolean));
    root.querySelector("[data-preview-events]").innerHTML = events.length
      ? events.slice(0, 4).map((event) => `<li>${eventText(event, releaseSymbols)}</li>`).join("")
      : `<li>${t("다음 자동 수집 후 관심 기업의 실적 일정이 표시됩니다.", "Watchlist earnings dates will appear after the next successful collection.")}</li>`;
    const summary = root.querySelector("[data-preview-summary]");
    if (summary && events.length) summary.textContent += ` ${t(`다음 실적: ${eventText(events[0], releaseSymbols)}.`, `Next earnings: ${eventText(events[0], releaseSymbols)}.`)}`;
  }

  Promise.all([
    fetch(`/api/us-market-preview?ts=${Date.now()}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    fetch(`/data/us-market-events.json?ts=${Date.now()}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
    fetch(`/data/ai-earnings.json?ts=${Date.now()}`, { cache: "no-store" }).then((response) => response.ok ? response.json() : null),
  ]).then(([quotes, events, earnings]) => { renderQuotes(quotes); renderEvents(events, earnings); }).catch(() => { renderQuotes(null); renderEvents(null, null); });
})();
