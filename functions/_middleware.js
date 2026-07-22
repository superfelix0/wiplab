const GA_ID = "G-GD6K8FB589";

class HeadInjector {
  element(element) {
    element.append(`<meta property="og:image" content="https://wiplabs.pages.dev/og-default.svg"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="https://wiplabs.pages.dev/og-default.svg"><script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');</script><script defer src="/mobile-nav.js?v=20260723"></script><script defer src="/glossary-links.js?v=20260723"></script>`, { html: true });
  }
}

export const onRequest = async (context) => {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  return new HTMLRewriter().on("head", new HeadInjector()).transform(response);
};
