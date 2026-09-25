const SENSITIVE_KEY = /authorization|cookie|password|secret|token|api[_-]?key|database|vonage|openai|medical|record|prescription|diagnosis|medicine|notes|description|content/i;

function sanitize(value, key = "", depth = 0) {
  if (SENSITIVE_KEY.test(key) || depth > 4) return "[redacted]";
  if (Array.isArray(value)) return value.map((item) => sanitize(item, "", depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, sanitize(entryValue, entryKey, depth + 1)]));
  }
  return value;
}

export function sanitizeSentryEvent(event) {
  if (event.request) {
    event.request.headers = sanitize(event.request.headers || {});
    event.request.cookies = "[redacted]";
    event.request.data = "[redacted]";
    if (event.request.url) event.request.url = event.request.url.split("?")[0];
  }

  if (event.user) event.user = event.user.id ? { id: event.user.id } : undefined;
  if (event.extra) event.extra = sanitize(event.extra);
  if (event.contexts) event.contexts = sanitize(event.contexts);
  if (event.breadcrumbs) {
    event.breadcrumbs = event.breadcrumbs.map((breadcrumb) => ({
      ...breadcrumb,
      data: sanitize(breadcrumb.data || {}),
      message: breadcrumb.category === "console" ? undefined : breadcrumb.message,
    }));
  }

  return event;
}

export function sanitizeSentryBreadcrumb(breadcrumb) {
  return {
    ...breadcrumb,
    data: sanitize(breadcrumb.data || {}),
    message: breadcrumb.category === "console" ? undefined : breadcrumb.message,
  };
}
