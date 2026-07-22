(() => {
  const nav = document.querySelector(".service-tabs");
  const header = document.querySelector(".site-header");
  if (!nav || !header || document.querySelector(".mobile-bottom-nav")) return;

  const isEnglish = document.documentElement.lang?.toLowerCase().startsWith("en");
  const links = [...nav.querySelectorAll("a")];
  const languageLinks = links.filter((link) => link.classList.contains("lang-switch"));
  const contentLinks = links.filter((link) => !link.classList.contains("lang-switch") && link.textContent.trim() !== "HOME");
  if (!contentLinks.length) return;

  const language = document.createElement("div");
  language.className = "mobile-language";
  language.setAttribute("aria-label", isEnglish ? "Language" : "언어 선택");
  languageLinks.forEach((link) => language.append(link.cloneNode(true)));
  header.append(language);

  const bottom = document.createElement("nav");
  bottom.className = "mobile-bottom-nav";
  bottom.setAttribute("aria-label", isEnglish ? "Primary sections" : "주요 지표");
  contentLinks.forEach((link) => {
    const item = document.createElement("a");
    item.href = link.href;
    item.textContent = link.textContent.trim().replace("SENTIMENT/RISK", "SENTIMENT");
    if (link.getAttribute("aria-current") === "page") item.setAttribute("aria-current", "page");
    bottom.append(item);
  });
  document.body.append(bottom);
})();
