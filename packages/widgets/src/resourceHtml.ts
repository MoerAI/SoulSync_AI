export type WidgetResourceName = "profile-form" | "recommendations" | "match-status" | "profile-card";

type InlineWidgetOptions = {
  jobId?: string;
};

const mountAttributes: Record<WidgetResourceName, string> = {
  "profile-form": "data-soulsync-profile-form",
  recommendations: "data-soulsync-recommendations",
  "match-status": "data-soulsync-match-status",
  "profile-card": "data-soulsync-profile-card"
};

function escapeHtmlAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function escapeInlineScript(value: string) {
  return value.replaceAll("</script", "<\\/script");
}

function escapeStyleBlock(value: string) {
  return value.replaceAll("</style", "<\\/style");
}

function mountElement(widgetName: WidgetResourceName, options: InlineWidgetOptions) {
  const dataJobId = widgetName === "match-status" && options.jobId ? ` data-job-id="${escapeHtmlAttribute(options.jobId)}"` : "";

  return `<div ${mountAttributes[widgetName]}${dataJobId}></div>`;
}

export function inlineWidget(widgetName: WidgetResourceName, js: string, css: string, appOrigin = "", options: InlineWidgetOptions = {}): string {
  const appOriginScript = escapeInlineScript(`window.__SOULSYNC_APP_ORIGIN__=${JSON.stringify(appOrigin)}`);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${escapeStyleBlock(css)}</style></head><body>${mountElement(widgetName, options)}<script>${appOriginScript}</script><script type="module">${escapeInlineScript(js)}</script></body></html>`;
}
