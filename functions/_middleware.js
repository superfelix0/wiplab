const GA_ID = "G-GD6K8FB589";

class HeadInjector {
  element(element) {
    element.append(`<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script><script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');</script>`, { html: true });
  }
}

class BodyInjector {
  element(element) {
    element.append('<script src="/retention.js?v=20260723"></script>', { html: true });
  }
}

export const onRequest = async (context) => {
  const response = await context.next();
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;
  return new HTMLRewriter().on("head", new HeadInjector()).on("body", new BodyInjector()).transform(response);
};
