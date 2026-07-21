const LOCAL_ORIGINS = new Set([
  "http://localhost:3000",
  "http://127.0.0.1:3000",
]);

function appOrigin() {
  const configured =
    process.env.AUTH_URL ||
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "http://localhost:3000";

  try {
    const origin = new URL(configured).origin;
    if (origin.includes("ngrok")) {
      return "http://localhost:3000";
    }
    return origin;
  } catch {
    return "http://localhost:3000";
  }
}

export function toLocalAppPath(url: string | null | undefined, fallback = "/dashboard") {
  if (!url) {
    return fallback;
  }

  if (url.startsWith("/") && !url.startsWith("//")) {
    return url;
  }

  try {
    const parsed = new URL(url);
    if (parsed.hostname.includes("ngrok")) {
      return `${parsed.pathname}${parsed.search}` || fallback;
    }
    if (LOCAL_ORIGINS.has(parsed.origin) || parsed.origin === appOrigin()) {
      return `${parsed.pathname}${parsed.search}` || fallback;
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function toLocalAppUrl(url: string, _baseUrl: string) {
  const origin = appOrigin();
  if (origin.includes("ngrok") || _baseUrl.includes("ngrok")) {
    return `http://localhost:3000${toLocalAppPath(url, "/dashboard")}`;
  }
  return `${origin}${toLocalAppPath(url, "/dashboard")}`;
}
