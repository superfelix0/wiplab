(() => {
  window.WIPLabs = window.WIPLabs || {};
  window.WIPLabs.loadData = async (url) => { const response = await fetch(`${url}${url.includes("?") ? "&" : "?"}ts=${Date.now()}`, { cache: "no-store" }); if (!response.ok) throw new Error(`Could not load ${url}`); return response.json(); };
  window.WIPLabs.wireDeepLinks = (root = document) => {
    const focus = () => { const target = document.getElementById(location.hash.slice(1)); if (!target) return; target.classList.add("wl-flash"); target.tabIndex = -1; target.focus({ preventScroll: true }); window.setTimeout(() => target.classList.remove("wl-flash"), 1800); };
    root.querySelectorAll('a[href*="#"]').forEach((link) => link.addEventListener("click", () => window.setTimeout(focus, 0)));
    window.addEventListener("hashchange", focus); focus();
  };
})();
