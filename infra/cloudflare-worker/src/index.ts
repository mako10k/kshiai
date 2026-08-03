interface AssetBinding {
  fetch(request: Request): Promise<Response>;
}

export interface WorkerEnvironment {
  ASSETS: AssetBinding;
  BACKEND_ORIGIN?: string;
  ORIGIN_SHARED_SECRET?: string;
}

type Fetcher = (request: Request) => Promise<Response>;

function backendUrl(origin: string, requestUrl: string): URL | null {
  try {
    const target = new URL(origin);
    if (target.protocol !== "https:" || target.username || target.password) return null;
    const incoming = new URL(requestUrl);
    target.pathname = incoming.pathname;
    target.search = incoming.search;
    target.hash = "";
    return target;
  } catch {
    return null;
  }
}

export async function handleRequest(
  request: Request,
  env: WorkerEnvironment,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  const incoming = new URL(request.url);
  if (incoming.pathname !== "/api" && !incoming.pathname.startsWith("/api/")) {
    return env.ASSETS.fetch(request);
  }

  const target = env.BACKEND_ORIGIN && backendUrl(env.BACKEND_ORIGIN, request.url);
  if (!target || !env.ORIGIN_SHARED_SECRET) {
    return Response.json(
      { error: "backend_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const upstreamRequest = new Request(target, request);
  upstreamRequest.headers.set("x-kshiai-origin", env.ORIGIN_SHARED_SECRET);
  upstreamRequest.headers.set("x-forwarded-host", incoming.host);
  upstreamRequest.headers.set("x-forwarded-proto", incoming.protocol.replace(":", ""));
  return fetcher(upstreamRequest);
}

export default {
  fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    return handleRequest(request, env);
  },
};
