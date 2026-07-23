(() => {
  const en = document.documentElement.lang.startsWith("en");
  const t = (ko, english) => en ? english : ko;
  let banner = document.querySelector("#returnBanner");
  const historyEl = document.querySelector("#signalHistory");
  historyEl?.remove();
  const updateEl = document.querySelector("#nextUpdate") || document.querySelector(".update-line span:last-child");
  const key = "wiplabs-last-signal";
  const languageKey = en ? "en" : "ko";

  function countdown() {
    if (!updateEl) return;
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(new Date()).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const kst = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute), Number(parts.second)));
    const target = new Date(kst);
    const hour = kst.getUTCHours();
    target.setUTCHours(hour < 6 ? 6 : hour < 19 ? 19 : 6, 0, 0, 0);
    if (hour >= 19) target.setUTCDate(target.getUTCDate() + 1);
    const minutes = Math.max(0, Math.round((target - kst) / 60000));
    const h = Math.floor(minutes / 60), m = minutes % 60;
    const market = target.getUTCHours() === 19 ? t("한국 장 데이터", "Korea-market data") : t("미국 장 데이터", "U.S.-market data");
    updateEl.textContent = t(`${market} 다음 갱신까지 ${h}시간 ${m}분`, `${market} updates in ${h}h ${m}m`);
  }

  function visitBanner(latest) {
    if (!latest) return;
    if (!banner) {
      const main = document.querySelector("main");
      if (!main) return;
      banner = document.createElement("section");
      banner.id = "returnBanner";
      banner.className = "return-banner";
      banner.setAttribute("aria-live", "polite");
      banner.hidden = true;
      main.prepend(banner);
    }
    const previous = JSON.parse(localStorage.getItem(key) || "null");
    if (previous?.language === languageKey && previous?.signalKey && previous.signalKey !== latest.signalKey) {
      banner.hidden = false;
      banner.textContent = t(`지난 방문 이후 오늘의 신호가 ${previous.label} → ${latest.label}로 바뀌었습니다.`, `Since your last visit, the signal changed from ${previous.label} to ${latest.label}.`);
    } else if (previous?.language === languageKey && previous?.visitedAt && Date.now() - previous.visitedAt >= 86400000) {
      const days = Math.floor((Date.now() - previous.visitedAt) / 86400000);
      banner.hidden = false;
      banner.textContent = t(`${days}일 만의 방문입니다. 오늘의 신호는 ${latest.label}입니다.`, `Welcome back after ${days} day(s). Today's signal is ${latest.label}.`);
    }
    localStorage.setItem(key, JSON.stringify({ label: latest.label, signalKey: latest.signalKey, language: languageKey, visitedAt: Date.now(), date: latest.date }));
  }

  fetch(`/data/regime-history.json?ts=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject())
    .then((data) => {
      const rows = (data.snapshots || []).slice(-7);
      if (!rows.length) {
        if (historyEl) historyEl.textContent = t("신호 이력이 쌓이면 최근 7일 흐름을 표시합니다.", "Recent seven-day signal history will appear as snapshots accumulate.");
        return;
      }
      const latest = rows.at(-1);
      const label = en ? latest.labelEn : latest.labelKo;
      if (historyEl) historyEl.innerHTML = rows.map((row, index) => `<span class="${index === rows.length - 1 ? "is-current" : ""}" title="${row.date}">${row.date.slice(5).replace("-", ".")} | ${en ? row.labelEn : row.labelKo}</span>`).join("");
      visitBanner({ label, signalKey: latest.labelEn || latest.labelKo, date: latest.date });
    })
    .catch(() => {
      if (historyEl) historyEl.textContent = t("신호 이력이 쌓이면 최근 7일 흐름을 표시합니다.", "Recent seven-day signal history will appear as snapshots accumulate.");
    });
  countdown(); setInterval(countdown, 60000);
})();
