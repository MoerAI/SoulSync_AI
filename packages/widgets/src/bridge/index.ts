export type ToolResult = {
  structuredContent: unknown;
  _meta?: unknown;
};

export type OpenAIWidgetBridge = {
  callTool?: (name: string, args: unknown) => Promise<ToolResult>;
  uploadFile?: (file: File) => Promise<{ fileId: string }>;
  selectFiles?: () => Promise<File[]>;
  notifyIntrinsicHeight?: (height: number) => void;
  setWidgetState?: (state: unknown) => void;
  onToolResult?: (handler: (result: unknown) => void) => () => void;
};

declare global {
  interface Window {
    openai?: OpenAIWidgetBridge;
  }
}

function getBridge() {
  if (typeof window === "undefined") {
    return undefined;
  }

  return window.openai;
}

export async function callTool(name: string, args: unknown): Promise<ToolResult> {
  const bridge = getBridge();

  if (!bridge?.callTool) {
    throw new Error("window.openai.callTool is unavailable in this widget context.");
  }

  return bridge.callTool(name, args);
}

export async function uploadFile(file: File): Promise<{ fileId: string }> {
  const bridge = getBridge();

  if (!bridge?.uploadFile) {
    throw new Error("window.openai.uploadFile is unavailable in this widget context.");
  }

  return bridge.uploadFile(file);
}

export async function selectFiles(): Promise<File[]> {
  const bridge = getBridge();

  if (!bridge?.selectFiles) {
    return [];
  }

  return bridge.selectFiles();
}

export function notifyIntrinsicHeight(height: number): void {
  const bridge = getBridge();

  if (bridge?.notifyIntrinsicHeight) {
    bridge.notifyIntrinsicHeight(height);
    return;
  }

  window.parent?.postMessage({ type: "openai.notifyIntrinsicHeight", height }, "*");
}

export function setWidgetState(state: unknown): void {
  const bridge = getBridge();

  if (bridge?.setWidgetState) {
    bridge.setWidgetState(state);
    return;
  }

  window.parent?.postMessage({ type: "openai.setWidgetState", state }, "*");
}

export function handleToolResult(handler: (result: unknown) => void): () => void {
  const bridge = getBridge();

  if (bridge?.onToolResult) {
    return bridge.onToolResult(handler);
  }

  if (typeof window === "undefined") {
    return () => undefined;
  }

  const listener = (event: MessageEvent) => {
    const data = event.data;

    if (data && typeof data === "object" && "type" in data && data.type === "openai.toolResult") {
      handler("result" in data ? data.result : data);
    }
  };

  window.addEventListener("message", listener);

  return () => {
    window.removeEventListener("message", listener);
  };
}

export function canSelectFiles() {
  return Boolean(getBridge()?.selectFiles);
}
