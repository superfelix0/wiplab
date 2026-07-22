(() => {
  const en = document.documentElement.lang.startsWith("en");
  const t = (ko, english) => en ? english : ko;
  let banner = document.querySelector("#returnBanner");
  const historyEl = document.querySelector("#signalHistory");
  const updateEl = document.querySelector("#nextUpdate") || document.querySelector(".update-line span:last-child");
  const key = "wiplabs-last-signal";

  function countdown() {
    if (!updateEl) return;
    const now = new Date();
    const kst = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
    const target = new Date(kst);
    const hour = kst.getHours();
    target.setHours(hour < 6 ? 6 : hour < 19 ? 19 : 6, 0, 0, 0);
    if (hour >= 19) target.setDate(target.getDate() + 1);
    const minutes = Math.max(0, Math.round((target - kst) / 60000));
    const h = Math.floor(minutes / 60), m = minutes % 60;
    const market = target.getHours() === 19 ? t("한국 장 데이터", "Korea-market data") : t("미국 장 데이터", "U.S.-market data");
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
    if (previous?.label && previous.label !== latest.label) {
      banner.hidden = false;
      banner.textContent = t(`지난 방문 이후 오늘의 신호가 ${previous.label} → ${latest.label}로 바뀌었습니다.`, `Since your last visit, the signal changed from ${previous.label} to ${latest.label}.`);
    } else if (previous?.visitedAt) {
      const days = Math.max(1, Math.floor((Date.now() - previous.visitedAt) / 86400000));
      banner.hidden = false;
      banner.textContent = t(`${days}일 만의 방문입니다. 오늘의 신호는 ${latest.label}입니다.`, `Welcome back after ${days} day(s). Today's signal is ${latest.label}.`);
    }
    localStorage.setItem(key, JSON.stringify({ label: latest.label, visitedAt: Date.now(), date: latest.date }));
  }

  fetch(`/data/signal-history.json?ts=${Date.now()}`, { cache: "no-store" })
    .then((response) => response.ok ? response.json() : Promise.reject())
    .then((data) => {
      const rows = (data.snapshots || []).slice(-7);
      if (!rows.length) return;
      const latest = rows.at(-1);
      const label = en ? latest.labelEn : latest.labelKo;
      if (historyEl) historyEl.innerHTML = rows.map((row, index) => `<span class="${index === rows.length - 1 ? "is-current" : ""}" title="${row.date}">${row.date.slice(5).replace("-", ".")} · ${en ? row.labelEn : row.labelKo}</span>`).join("");
      visitBanner({ label, date: latest.date });
    })
    .catch(() => {
      if (historyEl) historyEl.textContent = t("신호 이력이 쌓이면 최근 7일 흐름을 표시합니다.", "Recent seven-day signal history will appear as snapshots accumulate.");
    });
  countdown(); setInterval(countdown, 60000);
})();
