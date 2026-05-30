#!/usr/bin/env node

const baseUrl = process.argv[2];

if (!baseUrl) {
  console.error("Usage: node scripts/smoke-deploy.mjs <url>");
  process.exit(2);
}

const target = normalizeBaseUrl(baseUrl);
const checks = [checkHealth, checkProtectedResourceMetadata, checkUnauthenticatedMcp];

try {
  for (const check of checks) {
    await check(target);
  }
  console.log(`Smoke deploy checks passed for ${target.origin}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

function normalizeBaseUrl(value) {
  try {
    const url = new URL(value);
    url.pathname = url.pathname.replace(/\/$/, "");
    url.search = "";
    url.hash = "";
    return url;
  } catch {
    throw new Error(`Invalid URL: ${value}`);
  }
}

async function checkHealth(base) {
  const response = await fetch(new URL("/api/health", base));
  const body = await readJson(response, "/api/health");

  if (response.status !== 200 || body.ok !== true) {
    throw new Error(`/api/health failed: expected 200 with ok:true, got ${response.status} ${JSON.stringify(body)}`);
  }

  console.log("ok /api/health");
}

async function checkProtectedResourceMetadata(base) {
  const response = await fetch(new URL("/.well-known/oauth-protected-resource", base));
  const body = await readJson(response, "/.well-known/oauth-protected-resource");

  if (response.status !== 200 || !isObject(body)) {
    throw new Error(`/.well-known/oauth-protected-resource failed: expected 200 JSON, got ${response.status}`);
  }

  console.log("ok /.well-known/oauth-protected-resource");
}

async function checkUnauthenticatedMcp(base) {
  const response = await fetch(new URL("/api/mcp", base), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "smoke", method: "tools/list", params: {} }),
  });

  if (response.status !== 401) {
    const body = await response.text();
    throw new Error(`/api/mcp unauthenticated check failed: expected 401, got ${response.status} ${body.slice(0, 300)}`);
  }

  console.log("ok unauthenticated /api/mcp returns 401");
}

async function readJson(response, path) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${path} failed: expected JSON, got ${response.status} ${text.slice(0, 300)}`);
  }
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
