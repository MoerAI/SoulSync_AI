export type WidgetResourceName = "profile-form" | "recommendations" | "match-status";

type InlineWidgetOptions = {
  jobId?: string;
};

const mountAttributes: Record<WidgetResourceName, string> = {
  "profile-form": "data-soulsync-profile-form",
  recommendations: "data-soulsync-recommendations",
  "match-status": "data-soulsync-match-status"
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

export function inlineWidget(widgetName: WidgetResourceName, js: string, css: string, options: InlineWidgetOptions = {}): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${escapeStyleBlock(css)}</style></head><body>${mountElement(widgetName, options)}<script type="module">${escapeInlineScript(js)}</script></body></html>`;
}
