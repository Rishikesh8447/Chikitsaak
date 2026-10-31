const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const nextConfigPath = path.resolve(__dirname, "../next.config.mjs");

function parseCspDirectives(cspString) {
  const directives = new Map();
  for (const part of cspString.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const [name, ...values] = trimmed.split(/\s+/);
    directives.set(name, values);
  }
  return directives;
}

test("next.config.mjs defines Content-Security-Policy along with all required security headers", async () => {
  const configModule = await import("../next.config.mjs");
  const nextConfig = configModule.default;

  const headerConfigs = await nextConfig.headers();
  const rootHeaderConfig = headerConfigs.find((h) => h.source === "/(.*)");
  assert.ok(rootHeaderConfig, "A root route (/(.*)) header configuration must exist");

  const headersMap = new Map(rootHeaderConfig.headers.map((h) => [h.key, h.value]));

  // Verify presence of all expected security headers
  assert.ok(headersMap.has("Content-Security-Policy"), "Content-Security-Policy header must be present");
  assert.equal(headersMap.get("X-Content-Type-Options"), "nosniff");
  assert.equal(headersMap.get("Referrer-Policy"), "strict-origin-when-cross-origin");
  assert.equal(headersMap.get("X-Frame-Options"), "DENY");
  assert.equal(headersMap.get("Permissions-Policy"), "camera=(self), microphone=(self), geolocation=()");

  // If tested under production, verify HSTS is also present
  const originalEnv = process.env.NODE_ENV;
  try {
    process.env.NODE_ENV = "production";
    const prodHeaders = await nextConfig.headers();
    const prodMap = new Map(prodHeaders.find((h) => h.source === "/(.*)").headers.map((h) => [h.key, h.value]));
    assert.equal(prodMap.get("Strict-Transport-Security"), "max-age=31536000; includeSubDomains");
  } finally {
    process.env.NODE_ENV = originalEnv;
  }
});

test("Content-Security-Policy contains required directives and valid origins for Clerk, Razorpay, and Vonage", async () => {
  const configModule = await import("../next.config.mjs");
  const nextConfig = configModule.default;
  const headerConfigs = await nextConfig.headers();
  const rootHeaderConfig = headerConfigs.find((h) => h.source === "/(.*)");
  const cspValue = rootHeaderConfig.headers.find((h) => h.key === "Content-Security-Policy")?.value;

  assert.ok(cspValue, "Content-Security-Policy header value must not be empty");
  const directives = parseCspDirectives(cspValue);

  // default-src
  assert.deepEqual(directives.get("default-src"), ["'self'"]);

  // script-src
  const scriptSrc = directives.get("script-src");
  assert.ok(scriptSrc, "script-src directive must be present");
  assert.ok(scriptSrc.includes("'self'"), "script-src must include 'self'");
  assert.ok(scriptSrc.includes("'unsafe-inline'"), "script-src must include 'unsafe-inline' for Next.js scripts");
  assert.ok(scriptSrc.includes("https://checkout.razorpay.com"), "script-src must include Razorpay checkout");
  assert.ok(scriptSrc.includes("https://static.opentok.com"), "script-src must include Vonage OpenTok script");
  assert.ok(scriptSrc.includes("https://*.clerk.accounts.dev"), "script-src must include Clerk dev domain");
  assert.ok(scriptSrc.includes("https://*.clerk.com"), "script-src must include Clerk production domain");

  // style-src
  const styleSrc = directives.get("style-src");
  assert.ok(styleSrc, "style-src directive must be present");
  assert.ok(styleSrc.includes("'self'"));
  assert.ok(styleSrc.includes("'unsafe-inline'"));

  // img-src
  const imgSrc = directives.get("img-src");
  assert.ok(imgSrc, "img-src directive must be present");
  assert.ok(imgSrc.includes("'self'"));
  assert.ok(imgSrc.includes("data:"));
  assert.ok(imgSrc.includes("blob:"));
  assert.ok(imgSrc.includes("https://img.clerk.com"));
  assert.ok(imgSrc.includes("https://images.clerk.dev"));
  assert.ok(imgSrc.includes("https://*.googleusercontent.com"));
  assert.ok(imgSrc.includes("https://avatars.githubusercontent.com"));
  assert.ok(imgSrc.includes("https://*.razorpay.com"));

  // font-src
  const fontSrc = directives.get("font-src");
  assert.ok(fontSrc, "font-src directive must be present");
  assert.ok(fontSrc.includes("'self'"));
  assert.ok(fontSrc.includes("data:"));

  // connect-src
  const connectSrc = directives.get("connect-src");
  assert.ok(connectSrc, "connect-src directive must be present");
  assert.ok(connectSrc.includes("'self'"));
  assert.ok(connectSrc.includes("https://*.clerk.accounts.dev"), "connect-src must include Clerk FAPI domain");
  assert.ok(connectSrc.includes("https://*.accounts.dev"), "connect-src must include Clerk development accounts portal domain");
  assert.ok(connectSrc.includes("https://*.clerk.com"));
  assert.ok(connectSrc.includes("https://api.razorpay.com"));
  assert.ok(connectSrc.includes("https://lumberjack.razorpay.com"));
  assert.ok(connectSrc.includes("https://*.opentok.com"));
  assert.ok(connectSrc.includes("https://*.tokbox.com"));
  assert.ok(connectSrc.includes("wss://*.tokbox.com"));

  // media-src
  const mediaSrc = directives.get("media-src");
  assert.ok(mediaSrc, "media-src directive must be present");
  assert.ok(mediaSrc.includes("'self'"));
  assert.ok(mediaSrc.includes("blob:"));
  assert.ok(mediaSrc.includes("mediastream:"));

  // frame-src
  const frameSrc = directives.get("frame-src");
  assert.ok(frameSrc, "frame-src directive must be present");
  assert.ok(frameSrc.includes("'self'"));
  assert.ok(frameSrc.includes("https://api.razorpay.com"));
  assert.ok(frameSrc.includes("https://*.clerk.accounts.dev"));
  assert.ok(frameSrc.includes("https://*.clerk.com"));

  // worker-src
  const workerSrc = directives.get("worker-src");
  assert.ok(workerSrc, "worker-src directive must be present");
  assert.ok(workerSrc.includes("'self'"));
  assert.ok(workerSrc.includes("blob:"));

  // form-action, object-src, base-uri, frame-ancestors
  assert.deepEqual(directives.get("form-action"), ["'self'"]);
  assert.deepEqual(directives.get("object-src"), ["'none'"]);
  assert.deepEqual(directives.get("base-uri"), ["'self'"]);
  assert.deepEqual(directives.get("frame-ancestors"), ["'none'"]);
});

test("Content-Security-Policy excludes dangerous and server-only origins", async () => {
  const configModule = await import("../next.config.mjs");
  const nextConfig = configModule.default;
  const headerConfigs = await nextConfig.headers();
  const rootHeaderConfig = headerConfigs.find((h) => h.source === "/(.*)");
  const cspValue = rootHeaderConfig.headers.find((h) => h.key === "Content-Security-Policy")?.value;

  assert.ok(cspValue);

  // Must NOT include 'unsafe-eval'
  assert.equal(cspValue.includes("'unsafe-eval'"), false, "CSP must not include 'unsafe-eval'");

  // Must NOT expose server-only origins to browser connect-src
  assert.equal(cspValue.includes("api.openai.com"), false, "CSP must not include api.openai.com (server-only)");

  // Must NOT have unconstrained wildcards in script-src or connect-src
  const directives = parseCspDirectives(cspValue);
  const scriptSrc = directives.get("script-src") || [];
  const connectSrc = directives.get("connect-src") || [];

  assert.equal(scriptSrc.includes("*"), false, "script-src must not allow bare wildcard '*'");
  assert.equal(connectSrc.includes("*"), false, "connect-src must not allow bare wildcard '*'");
  assert.equal(connectSrc.includes("http:"), false, "connect-src must not allow insecure http: wildcard");
  assert.equal(connectSrc.includes("https:"), false, "connect-src must not allow broad https: wildcard");
});

test("next.config.mjs static content preserves CSP without syntax errors", () => {
  const content = fs.readFileSync(nextConfigPath, "utf8");
  assert.match(content, /key:\s*"Content-Security-Policy"/);
  assert.match(content, /default-src 'self'/);
  assert.doesNotMatch(content, /'unsafe-eval'/);
  assert.doesNotMatch(content, /api\.openai\.com/);
});

test("Content-Security-Policy connect-src authorizes development Clerk sign-in instance hostname while rejecting unrelated domains", async () => {
  const configModule = await import("../next.config.mjs");
  const nextConfig = configModule.default;
  const headerConfigs = await nextConfig.headers();
  const rootHeaderConfig = headerConfigs.find((h) => h.source === "/(.*)");
  const cspValue = rootHeaderConfig.headers.find((h) => h.key === "Content-Security-Policy")?.value;
  const directives = parseCspDirectives(cspValue);
  const connectSrc = directives.get("connect-src") || [];

  // Helper matching standard CSP host matching algorithm (RFC 7932 / CSP spec)
  function isOriginAllowedInConnectSrc(urlStr) {
    const parsed = new URL(urlStr);
    return connectSrc.some((entry) => {
      if (entry === "'self'") return false; // assuming external origin
      if (entry.startsWith("https://*.")) {
        const baseDomain = entry.substring("https://*.".length);
        return parsed.protocol === "https:" && parsed.hostname.endsWith("." + baseDomain) && parsed.hostname !== baseDomain;
      }
      return entry === `${parsed.protocol}//${parsed.hostname}`;
    });
  }

  // Must allow the observed development instance prefetch / redirect host
  assert.equal(isOriginAllowedInConnectSrc("https://enjoyed-panther-39.accounts.dev/sign-in"), true, "Must authorize enjoyed-panther-39.accounts.dev");
  assert.equal(isOriginAllowedInConnectSrc("https://enjoyed-panther-39.clerk.accounts.dev/v1/client"), true, "Must authorize enjoyed-panther-39.clerk.accounts.dev");

  // Must NOT allow arbitrary or unapproved domains
  assert.equal(isOriginAllowedInConnectSrc("https://attacker.com/evil"), false, "Must not authorize attacker.com");
  assert.equal(isOriginAllowedInConnectSrc("https://accounts.dev/sign-in"), false, "Must not authorize root accounts.dev without subdomain");
  assert.equal(isOriginAllowedInConnectSrc("http://enjoyed-panther-39.accounts.dev"), false, "Must not authorize insecure http: scheme");
});


