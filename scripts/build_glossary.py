"""Build the Korean WIP Labs glossary from the editor-owned Markdown source.

Run `python scripts/build_glossary.py` after editing glossary-content.md.  It
creates the static hub and individual SEO pages, and adds their URLs to the
sitemap.  English expansion is intentionally deferred until the Korean pages
have settled and search queries identify the priority terms.
"""
from __future__ import annotations

from datetime import date
from html import escape
from pathlib import Path
import re
import json

SOURCE = Path("glossary-content.md")
OUT = Path("docs/glossary")
SITEMAP = Path("docs/sitemap.xml")
BASE = "https://wiplabs.pages.dev"
SERVICE_PAGES = [
    Path("docs/index.html"), Path("docs/valuation/index.html"), Path("docs/sentiment-risk/index.html"),
    Path("docs/ai-capex/index.html"), Path("docs/memory-earnings/index.html"), Path("docs/market-flow/index.html"),
    Path("docs/en/index.html"), Path("docs/en/valuation/index.html"), Path("docs/en/sentiment-risk/index.html"),
    Path("docs/en/ai-capex/index.html"), Path("docs/en/memory-earnings/index.html"), Path("docs/en/market-flow/index.html"),
]


def inline(text: str) -> str:
    value = escape(text.strip())
    value = re.sub(r"\[([^\]]+)]\(([^)]+)\)", r'<a href="\2">\1</a>', value)
    return re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", value)


def rich(lines: list[str]) -> str:
    blocks, paragraph, bullets, code = [], [], [], []
    in_code = False

    def flush_paragraph() -> None:
        nonlocal paragraph
        if paragraph:
            blocks.append(f"<p>{inline(' '.join(paragraph))}</p>")
            paragraph = []

    def flush_bullets() -> None:
        nonlocal bullets
        if bullets:
            blocks.append("<ul>" + "".join(f"<li>{inline(item)}</li>" for item in bullets) + "</ul>")
            bullets = []

    for raw in lines:
        line = raw.strip()
        if line.startswith("```"):
            if in_code:
                blocks.append(f"<pre><code>{escape(chr(10).join(code))}</code></pre>")
                code = []
            else:
                flush_paragraph(); flush_bullets()
            in_code = not in_code
        elif in_code:
            code.append(raw)
        elif not line:
            flush_paragraph(); flush_bullets()
        elif line == "---":
            flush_paragraph(); flush_bullets()
        elif line.startswith("- "):
            flush_paragraph(); bullets.append(line[2:])
        elif line.startswith("|"):
            flush_paragraph(); flush_bullets(); blocks.append(f"<p class=\"glossary-table-row\">{inline(line)}</p>")
        else:
            flush_bullets(); paragraph.append(line)
    flush_paragraph(); flush_bullets()
    return "\n".join(blocks)


def parse() -> list[dict]:
    text = SOURCE.read_text(encoding="utf-8")
    group, items, current = "", [], None
    for line in text.splitlines():
        if line.startswith("# ") and not line.startswith("## "):
            if current:
                items.append(current)
                current = None
            group = line[2:].strip()
        elif line.startswith("## "):
            if current:
                items.append(current)
            current = {"name": line[3:].strip(), "group": group, "body": []}
        elif current is not None:
            current["body"].append(line)
    if current:
        items.append(current)

    parsed = []
    for item in items:
        body = item["body"]
        fields = {"slug": "", "title": item["name"], "description": ""}
        for line in body:
            match = re.match(r"- \*\*(슬러그|title|description)\*\*\s*(.*)", line)
            if not match:
                continue
            key = {"슬러그": "slug", "title": "title", "description": "description"}[match.group(1)]
            fields[key] = match.group(2).strip().strip("`")
        sections, active = {"definition": [], "reading": [], "limits": [], "related": []}, None
        for line in body:
            if "한 줄 정의" in line:
                active = "definition"; continue
            if "어떻게 읽나" in line:
                active = "reading"; continue
            if "한계와 오해" in line:
                active = "limits"; continue
            if "함께 보기" in line:
                active = "related"
                tail = line.split("—", 1)[-1].strip()
                if tail:
                    sections[active].append(tail)
                continue
            if active and line.strip() != "---":
                sections[active].append(line)
        if fields["slug"]:
            parsed.append({**item, **fields, **sections})
    return parsed


def layout(title: str, description: str, body: str, relative: str, schema: str) -> str:
    return f'''<!doctype html>
<html lang="ko"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="description" content="{escape(description)}"><meta property="og:title" content="{escape(title)}"><meta property="og:description" content="{escape(description)}"><meta property="og:type" content="article">
<link rel="canonical" href="{BASE}{relative}"><link rel="stylesheet" href="{('../' * (relative.count('/') - 1))}styles.css?v=glossary-20260723"><link rel="icon" href="{('../' * (relative.count('/') - 1))}favicon.svg"><title>{escape(title)}</title><script type="application/ld+json">{schema}</script></head>
<body><header class="site-header"><a class="brand" href="{('../' * (relative.count('/') - 1))}"><span>WIP</span><strong>WIP Labs</strong></a><nav class="service-tabs"><a href="{('../' * (relative.count('/') - 1))}">HOME</a><a href="{('../' * (relative.count('/') - 1))}valuation/">VALUATION</a><a href="{('../' * (relative.count('/') - 1))}sentiment-risk/">SENTIMENT/RISK</a><a href="{('../' * (relative.count('/') - 1))}ai-capex/">AI CAPEX</a><a href="{('../' * (relative.count('/') - 1))}memory-earnings/">MEMORY</a><a href="{('../' * (relative.count('/') - 1))}market-flow/">MARKET FLOW</a><a class="lang-switch" href="{('../' * (relative.count('/') - 1))}" aria-current="true">KO</a><a class="lang-switch" href="{('../' * (relative.count('/') - 1))}en/">EN</a></nav></header><main>{body}</main><footer><div><strong>WIP Labs</strong><p>스스로 판단하기 위해 시장의 숫자를 쉽게 읽습니다.</p></div><a class="footer-glossary" href="/glossary/">Glossary</a><span>© 2026</span></footer></body></html>'''


def build_item(item: dict) -> None:
    slug = item["slug"].strip("/").split("/")[-1]
    relative = f"/glossary/{slug}/"
    sections = f'''<section class="hero service-hero"><p class="eyebrow">GLOSSARY</p><h1>{inline(item['name'])}</h1><p class="hero-copy">{inline(item['description'])}</p></section>
<nav class="glossary-breadcrumb" aria-label="Breadcrumb"><a href="/">WIP Labs</a> <span>›</span> <a href="/glossary/">Glossary</a> <span>›</span> <span>{inline(item['name'])}</span></nav><article class="glossary-article"><section><h2>한 줄 정의</h2>{rich(item['definition'])}</section><section><h2>어떻게 읽나</h2>{rich(item['reading'])}</section><section><h2>한계와 오해</h2>{rich(item['limits'])}</section><section><h2>함께 보기</h2>{rich(item['related'])}</section></article>'''
    schema = json.dumps({
        "@context": "https://schema.org",
        "@graph": [
            {"@type": "DefinedTerm", "name": item["name"], "description": item["description"], "url": f"{BASE}{relative}"},
            {"@type": "BreadcrumbList", "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "WIP Labs", "item": BASE + "/"},
                {"@type": "ListItem", "position": 2, "name": "Glossary", "item": BASE + "/glossary/"},
                {"@type": "ListItem", "position": 3, "name": item["name"], "item": f"{BASE}{relative}"},
            ]},
        ],
    }, ensure_ascii=False)
    target = OUT / slug / "index.html"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(layout(item["title"], item["description"], sections, relative, schema), encoding="utf-8")


def build_hub(items: list[dict]) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    groups: dict[str, list[dict]] = {}
    for item in items:
        groups.setdefault(item["group"], []).append(item)
    cards = []
    for group, entries in groups.items():
        cards.append(f"<section class=\"glossary-group\"><h2>{inline(group)}</h2><div class=\"theme-grid\">")
        for item in entries:
            slug = item["slug"].strip("/").split("/")[-1]
            definition = next((line.strip() for line in item["definition"] if line.strip()), item["description"])
            cards.append(f"<a class=\"theme-card\" href=\"{slug}/\"><span>GLOSSARY</span><h3>{inline(item['name'])}</h3><p>{inline(definition)}</p><div>읽는 법 <b>→</b></div></a>")
        cards.append("</div></section>")
    body = "<section class=\"hero service-hero\"><p class=\"eyebrow\">WIP LABS GLOSSARY</p><h1>용어·읽는 법</h1><p class=\"hero-copy\">숫자 자체보다 그 숫자를 어떻게 읽는지가 더 중요합니다. 사이트에서 쓰는 지표의 정의와 해석, 주의할 점을 정리합니다.</p></section>" + "".join(cards)
    schema = json.dumps({
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "WIP Labs 용어·읽는 법",
        "hasPart": [{"@type": "DefinedTerm", "name": item["name"], "url": f"{BASE}/glossary/{item['slug'].strip('/').split('/')[-1]}/"} for item in items],
    }, ensure_ascii=False)
    (OUT / "index.html").write_text(layout("용어·읽는 법 | WIP Labs", "WIP Labs에서 사용하는 시장 지표의 정의, 읽는 법, 한계와 오해를 정리합니다.", body, "/glossary/", schema), encoding="utf-8")


def update_sitemap(items: list[dict]) -> None:
    current = SITEMAP.read_text(encoding="utf-8")
    urls = ["/glossary/"] + [f"/glossary/{item['slug'].strip('/').split('/')[-1]}/" for item in items]
    stamp = date.today().isoformat()
    additions = "".join(f"  <url><loc>{BASE}{url}</loc><lastmod>{stamp}</lastmod><changefreq>monthly</changefreq><priority>0.5</priority></url>\n" for url in urls if f"<loc>{BASE}{url}</loc>" not in current)
    SITEMAP.write_text(current.replace("</urlset>", additions + "</urlset>"), encoding="utf-8")


def add_service_footer_links() -> None:
    link = '<a class="footer-glossary" href="/glossary/">Glossary</a>'
    for page in SERVICE_PAGES:
        content = page.read_text(encoding="utf-8")
        if "footer-glossary" in content:
            continue
        if "</footer>" in content:
            content = content.replace("</footer>", link + "</footer>", 1)
        else:
            content = content.replace("</body>", f'<footer>{link}</footer></body>', 1)
        page.write_text(content, encoding="utf-8")


def main() -> None:
    items = parse()
    if len(items) != 15:
        raise RuntimeError(f"Expected 15 glossary items, found {len(items)}")
    build_hub(items)
    for item in items:
        build_item(item)
    update_sitemap(items)
    add_service_footer_links()
    print(f"Built {len(items)} glossary pages plus the hub.")


if __name__ == "__main__":
    main()
