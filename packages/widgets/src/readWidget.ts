type FileSystemPromises = {
  readFile(path: URL, encoding: "utf8"): Promise<string>;
};

export type WidgetBundle = {
  js: string;
  css: string;
};

export async function readWidget(name: string): Promise<WidgetBundle> {
  const fs = (await import("node:fs/promises")) as FileSystemPromises;
  const jsPath = new URL("./" + name + ".es.js", import.meta.url);
  const cssPath = new URL("./" + name + ".css", import.meta.url);
  const [js, css] = await Promise.all([fs.readFile(jsPath, "utf8"), fs.readFile(cssPath, "utf8")]);

  return { js, css };
}
