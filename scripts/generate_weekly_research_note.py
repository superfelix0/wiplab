from __future__ import annotations

import csv
import json
import math
import os
import re
from datetime import datetime, timedelta, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DOCS = ROOT / "docs"
DATA = DOCS / "data"
KST = timezone(timedelta(hours=9))
FORWARD_PER = 6.35


def read_json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def fmt_num(value, digits: int = 2) -> str:
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        return "N/A"
    return f"{value:,.{digits}f}"


def fmt_pct(value, digits: int = 1) -> str:
    if not isinstance(value, (int, float)) or not math.isfinite(value):
        return "N/A"
    return f"{value:+.{digits}f}%"


def pct_change(current: float, previous: float) -> float | None:
    if not previous:
        return None
    return (current / previous - 1) * 100


def read_kospi_csv() -> list[dict]:
    path = DATA / "kospi-sentiment.csv"
    if not path.exists():
        return []
    rows = []
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        for row in csv.DictReader(f):
            try:
                rows.append(
                    {
                        "date": row["date"],
                        "close": float(row["close"]),
                        "indiv_krw": float(row["indiv_krw"]),
                    }
                )
            except (KeyError, TypeError, ValueError):
                continue
    return rows


def weekly_sentiment(rows: list[dict]) -> dict:
    if len(rows) < 2:
        return {
            "label_ko": "데이터 확인 필요",
            "label_en": "Needs data",
            "detail_ko": "개인 수급 데이터가 충분하지 않습니다.",
            "detail_en": "Retail-flow data is not sufficient.",
        }

    latest = rows[-1]
    prev = rows[-6] if len(rows) >= 6 else rows[-2]
    ret = pct_change(latest["close"], prev["close"]) or 0
    recent_flow = sum(row["indiv_krw"] for row in rows[-5:]) / 1e12

    if ret < -2 and recent_flow < 0:
        return {
            "label_ko": "공포 쪽에 가까움",
            "label_en": "Near fear",
            "detail_ko": f"최근 KOSPI는 {fmt_pct(ret)} 움직였고, 최근 5거래일 개인 순매수는 {fmt_num(recent_flow)}조원입니다.",
            "detail_en": f"KOSPI moved {fmt_pct(ret)} recently, while five-session retail net-buying was {fmt_num(recent_flow)}T KRW.",
        }
    if ret > 2 and recent_flow > 0:
        return {
            "label_ko": "탐욕 쪽에 가까움",
            "label_en": "Near greed",
            "detail_ko": f"최근 KOSPI는 {fmt_pct(ret)} 상승했고, 최근 5거래일 개인 순매수는 {fmt_num(recent_flow)}조원입니다.",
            "detail_en": f"KOSPI rose {fmt_pct(ret)} recently, and five-session retail net-buying was {fmt_num(recent_flow)}T KRW.",
        }
    return {
        "label_ko": "중립",
        "label_en": "Neutral",
        "detail_ko": f"최근 KOSPI 변동률은 {fmt_pct(ret)}, 최근 5거래일 개인 순매수는 {fmt_num(recent_flow)}조원입니다.",
        "detail_en": f"Recent KOSPI change was {fmt_pct(ret)}, and five-session retail net-buying was {fmt_num(recent_flow)}T KRW.",
    }


def ai_capex_summary(data: dict) -> dict:
    rows = []
    for company in data.get("companies", []):
        if company.get("group") != "Hyperscaler":
            continue
        latest = (company.get("quarters") or [None])[-1]
        if not latest:
            continue
        capex = abs(latest.get("capex") or 0)
        ocf = abs(latest.get("operatingCashFlow") or 0)
        profit = latest.get("profit") or 0
        capex_ocf = capex / ocf if ocf else None
        capex_profit = capex / profit if profit > 0 else None
        rows.append((company.get("name", "N/A"), capex_ocf, capex_profit))

    valid_ocf = [r[1] for r in rows if isinstance(r[1], (int, float)) and math.isfinite(r[1])]
    valid_profit = [r[2] for r in rows if isinstance(r[2], (int, float)) and math.isfinite(r[2])]
    avg_ocf = sum(valid_ocf) / len(valid_ocf) if valid_ocf else None
    avg_profit = sum(valid_profit) / len(valid_profit) if valid_profit else None

    if (avg_ocf or 9) <= 0.7 and (avg_profit or 9) <= 0.9:
        tone_ko, tone_en = "여유 있음", "comfortable"
    elif (avg_ocf or 9) <= 1.0 and (avg_profit or 9) <= 1.2:
        tone_ko, tone_en = "관리 가능", "manageable"
    else:
        tone_ko, tone_en = "부담 확대", "burden rising"
    return {"avg_ocf": avg_ocf, "avg_profit": avg_profit, "tone_ko": tone_ko, "tone_en": tone_en}


def liquidity_label_ko(tone: str | None) -> str:
    return {"positive": "유동성 우호", "neutral": "중립", "negative": "유동성 부담"}.get(tone or "", "확인 필요")


def liquidity_label_en(tone: str | None) -> str:
    return {"positive": "supportive", "neutral": "neutral", "negative": "tightening"}.get(tone or "", "needs review")


def html_page(title: str, description: str, body: str, depth: str = "../../") -> str:
    return f"""<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow">
  <meta name="description" content="{description}">
  <link rel="icon" href="{depth}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="{depth}styles.css?v=weekly-note-20260718">
  <title>{title} — WIP Labs</title>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="{depth}"><span>WIP</span><strong>WIP Labs</strong></a>
    <nav class="service-tabs"><a href="{depth}">HOME</a><a href="{depth}notes/">NOTES</a><a href="{depth}wip-1/">F1</a><a href="{depth}wip-2/">F2</a><a href="{depth}wip-3/">F3</a><a href="{depth}wip-4/">F4</a><a href="{depth}wip-5/">F5</a></nav>
  </header>
  <main>{body}</main>
  <footer><p>DISCLAIMER · 교육·참고용 · 투자권유 아님 · 데이터 지연·누락 가능</p><nav class="footer-links"><a href="{depth}notes/">Research Notes</a><a href="{depth}privacy/">Privacy</a><a href="{depth}disclaimer/">Disclaimer</a><a href="{depth}contact/">Contact</a></nav></footer>
</body>
</html>
"""


def html_page_en(title: str, description: str, body: str, depth: str = "../../../") -> str:
    return f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="index, follow">
  <meta name="description" content="{description}">
  <link rel="icon" href="{depth}favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="{depth}styles.css?v=weekly-note-20260718">
  <title>{title} — WIP Labs</title>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="{depth}en/"><span>WIP</span><strong>WIP Labs</strong></a>
    <nav class="service-tabs"><a href="{depth}en/">HOME</a><a href="{depth}en/notes/">NOTES</a><a href="{depth}en/wip-1/">F1</a><a href="{depth}en/wip-2/">F2</a><a href="{depth}en/wip-3/">F3</a><a href="{depth}en/wip-4/">F4</a><a href="{depth}en/wip-5/">F5</a></nav>
  </header>
  <main>{body}</main>
  <footer><p>DISCLAIMER · Educational reference only · Not investment advice · Data may be delayed or incomplete</p><nav class="footer-links"><a href="{depth}en/notes/">Research Notes</a><a href="{depth}en/privacy/">Privacy</a><a href="{depth}en/disclaimer/">Disclaimer</a><a href="{depth}en/contact/">Contact</a></nav></footer>
</body>
</html>
"""


def weekly_index(posts: list[tuple[str, str, str]], en: bool = False) -> str:
    base = "../../../" if en else "../../"
    cards = "\n".join(
        f'<a class="note-card" href="{slug}/"><span>{date}</span><strong>{title}</strong><p>{"Weekly automated market research note." if en else "자동 생성된 주간 시장 리서치 노트입니다."}</p></a>'
        for date, slug, title in posts
    )
    if en:
        body = f'<section class="hero"><p class="eyebrow">WEEKLY NOTES</p><h1>Weekly market reads</h1><p class="hero-copy">Automatically generated every Sunday KST after the U.S. Friday regular session has ended.</p></section><section class="content-hub"><div class="note-grid">{cards}</div></section>'
        return html_page_en("Weekly market reads", "Weekly WIP Labs market research notes.", body, base)
    body = f'<section class="hero"><p class="eyebrow">WEEKLY NOTES</p><h1>주간 시장 리서치 노트</h1><p class="hero-copy">미국 금요일 정규장 종료 후 한국시간 매주 일요일 자동으로 생성되는 시장 점검 노트입니다.</p></section><section class="content-hub"><div class="note-grid">{cards}</div></section>'
    return html_page("주간 시장 리서치 노트", "WIP Labs의 주간 자동 시장 리서치 노트입니다.", body, base)


def list_weekly_posts(base_dir: Path, en: bool = False) -> list[tuple[str, str, str]]:
    posts = []
    if not base_dir.exists():
        return posts
    fallback_suffix = "weekly market read" if en else "주간 시장 리서치 노트"
    for child in sorted(base_dir.iterdir(), reverse=True):
        if not child.is_dir() or not re.match(r"\d{4}-\d{2}-\d{2}", child.name):
            continue
        index = child / "index.html"
        title = f"{child.name} {fallback_suffix}"
        if index.exists():
            text = index.read_text(encoding="utf-8")
            found = re.search(r"<h1>(.*?)</h1>", text)
            if found:
                title = re.sub("<.*?>", "", found.group(1))
        posts.append((child.name, child.name, title))
    return posts


def update_sitemap(slugs: list[str]) -> None:
    if os.getenv("WEEKLY_NOTE_DRY_RUN") == "1":
        return
    path = DOCS / "sitemap.xml"
    text = path.read_text(encoding="utf-8")
    additions = []
    for loc in slugs:
        full = f"https://wiplabs.pages.dev/{loc}/"
        if full in text:
            continue
        additions.append(f"""  <url>
    <loc>{full}</loc>
    <lastmod>{datetime.now(KST).date().isoformat()}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>""")
    if additions:
        text = text.replace("</urlset>", "\n".join(additions) + "\n</urlset>")
        path.write_text(text, encoding="utf-8")


def main() -> None:
    forced_date = os.getenv("WEEKLY_NOTE_DATE")
    now = datetime.fromisoformat(f"{forced_date}T09:00:00+09:00") if forced_date else datetime.now(KST)
    slug = now.date().isoformat()

    per_data = read_json(DATA / "market-per.json")
    sentiment_meta = read_json(DATA / "kospi-sentiment-meta.json")
    liquidity = read_json(DATA / "us-liquidity.json")
    earnings = read_json(DATA / "ai-earnings.json")
    sentiment = weekly_sentiment(read_kospi_csv())
    ai = ai_capex_summary(earnings)

    kospi = per_data["markets"]["kospi200"]
    per_gap = kospi["per"] - kospi["historicalAveragePer"]
    liquidity_summary = liquidity["summary"]
    liquidity_tone = liquidity_summary.get("tone")
    vkospi = sentiment_meta.get("kospi200Volatility", {})

    title_ko = f"{slug} 주간 시장 리서치 노트"
    body_ko = f"""
    <section class="hero"><p class="eyebrow">WEEKLY MARKET READ</p><h1>{title_ko}</h1><p class="article-meta">자동 생성 · 한국시간 {now.strftime('%Y-%m-%d %H:%M')}</p></section>
    <section class="article-body">
      <p>이번 주 WIP Labs는 KOSPI 밸류에이션, 개인 수급 심리, 미국 유동성, AI CAPEX 부담을 함께 점검합니다. 이 글은 매주 일요일 자동 생성되는 시장 리서치 노트이며, 투자 권유가 아니라 스스로 판단하기 위한 체크리스트입니다.</p>
      <h2>1. KOSPI 밸류에이션</h2>
      <p>최근 KOSPI 기준일은 {kospi['date']}입니다. 현행 PER는 {fmt_num(kospi['per'])}배, 2010년 이후 평균 PER는 {fmt_num(kospi['historicalAveragePer'])}배입니다. 현행 PER는 평균보다 {fmt_num(abs(per_gap))}배 {'높습니다' if per_gap >= 0 else '낮습니다'}. Forward PER 참고치는 {fmt_num(FORWARD_PER)}배로, 예상 이익이 실제로 달성 가능한지 함께 봐야 합니다.</p>
      <h2>2. 개인 수급 심리</h2>
      <p>최근 심리 상태는 <strong>{sentiment['label_ko']}</strong>입니다. {sentiment['detail_ko']} 이 지표는 단독 매매 신호가 아니라 공포와 탐욕의 온도를 보는 보조 지표입니다.</p>
      <h2>3. 변동성</h2>
      <p>VKOSPI는 {vkospi.get('date', 'N/A')} 기준 {fmt_num(vkospi.get('value'))}입니다. 연율화 변동성 지수이므로 252거래일의 제곱근으로 나누면 대략적인 하루 예상 변동률을 추정할 수 있습니다.</p>
      <h2>4. 미국 유동성</h2>
      <p>미국 유동성 종합 판단은 <strong>{liquidity_label_ko(liquidity_tone)}</strong>입니다. 최근 약 {liquidity.get('lookbackDays')}일 기준 우호 지표는 {liquidity_summary.get('positives')}/{liquidity_summary.get('total')}개이며, 실질 유동성 보조값 변화는 {fmt_num(liquidity_summary['marketLiquidity'].get('change'))}B USD입니다.</p>
      <h2>5. AI CAPEX 부담</h2>
      <p>하이퍼스케일러 평균 CAPEX/OCF는 {fmt_pct((ai['avg_ocf'] or 0) * 100)}, 평균 CAPEX/순이익은 {fmt_pct((ai['avg_profit'] or 0) * 100)}입니다. 현재 분류는 <strong>{ai['tone_ko']}</strong>입니다. AI 투자 사이클은 성장의 신호이지만, 현금흐름 안에서 감당되는지 계속 확인해야 합니다.</p>
      <h2>이번 주 체크포인트</h2>
      <ul><li>Forward PER가 낮게 보이는 이유가 이익 개선인지, 이익 신뢰 부족인지 확인합니다.</li><li>수급 심리가 공포 또는 탐욕 쪽으로 치우칠 때에는 뉴스와 실적 흐름을 함께 봅니다.</li><li>미국 유동성과 AI CAPEX 부담이 같은 방향으로 위험자산에 우호적인지 점검합니다.</li></ul>
    </section>
    """

    title_en = f"{slug} weekly market read"
    body_en = f"""
    <section class="hero"><p class="eyebrow">WEEKLY MARKET READ</p><h1>{title_en}</h1><p class="article-meta">Automatically generated · KST {now.strftime('%Y-%m-%d %H:%M')}</p></section>
    <section class="article-body">
      <p>This weekly WIP Labs note checks KOSPI valuation, retail-flow sentiment, U.S. liquidity, and AI CAPEX pressure. It is a research checklist, not investment advice.</p>
      <h2>1. KOSPI valuation</h2>
      <p>The latest KOSPI data date is {kospi['date']}. Current PER is {fmt_num(kospi['per'])}x, while the average PER since 2010 is {fmt_num(kospi['historicalAveragePer'])}x. Current PER is {fmt_num(abs(per_gap))}x {'above' if per_gap >= 0 else 'below'} the average. The forward PER reference is {fmt_num(FORWARD_PER)}x, so the key question is whether expected earnings are credible.</p>
      <h2>2. Retail-flow sentiment</h2>
      <p>The latest sentiment read is <strong>{sentiment['label_en']}</strong>. {sentiment['detail_en']} This is a psychology gauge, not a standalone trading signal.</p>
      <h2>3. Volatility</h2>
      <p>VKOSPI was {fmt_num(vkospi.get('value'))} as of {vkospi.get('date', 'N/A')}. As an annualized volatility index, dividing it by the square root of about 252 trading days gives a rough one-day expected move.</p>
      <h2>4. U.S. liquidity</h2>
      <p>The U.S. liquidity read is <strong>{liquidity_label_en(liquidity_tone)}</strong>. {liquidity_summary.get('positives')}/{liquidity_summary.get('total')} indicators are supportive over roughly {liquidity.get('lookbackDays')} days, and the real-liquidity proxy changed by {fmt_num(liquidity_summary['marketLiquidity'].get('change'))}B USD.</p>
      <h2>5. AI CAPEX pressure</h2>
      <p>Average hyperscaler CAPEX/OCF is {fmt_pct((ai['avg_ocf'] or 0) * 100)}, and average CAPEX/net income is {fmt_pct((ai['avg_profit'] or 0) * 100)}. The current classification is <strong>{ai['tone_en']}</strong>.</p>
      <h2>Weekly checklist</h2>
      <ul><li>Check whether low forward PER reflects earnings upside or weak earnings trust.</li><li>Read fear or greed signals with news and earnings context.</li><li>Watch whether U.S. liquidity and AI CAPEX pressure point in the same direction for risk assets.</li></ul>
    </section>
    """

    ko_dir = DOCS / "notes" / "weekly" / slug
    en_dir = DOCS / "en" / "notes" / "weekly" / slug
    if os.getenv("WEEKLY_NOTE_DRY_RUN") == "1":
        print(f"Dry run weekly research note: {slug}")
        print(title_ko)
        print(title_en)
        return

    ko_dir.mkdir(parents=True, exist_ok=True)
    en_dir.mkdir(parents=True, exist_ok=True)
    (ko_dir / "index.html").write_text(html_page(title_ko, "WIP Labs 주간 자동 시장 리서치 노트입니다.", body_ko, "../../../"), encoding="utf-8")
    (en_dir / "index.html").write_text(html_page_en(title_en, "Weekly automated WIP Labs market research note.", body_en, "../../../../"), encoding="utf-8")

    ko_weekly_dir = DOCS / "notes" / "weekly"
    en_weekly_dir = DOCS / "en" / "notes" / "weekly"
    (ko_weekly_dir / "index.html").write_text(weekly_index(list_weekly_posts(ko_weekly_dir, en=False), en=False), encoding="utf-8")
    (en_weekly_dir / "index.html").write_text(weekly_index(list_weekly_posts(en_weekly_dir, en=True), en=True), encoding="utf-8")
    update_sitemap([f"notes/weekly", f"notes/weekly/{slug}", f"en/notes/weekly", f"en/notes/weekly/{slug}"])
    print(f"Generated weekly research note: {slug}")


if __name__ == "__main__":
    main()
