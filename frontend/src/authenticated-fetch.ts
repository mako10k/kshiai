export type AccessTokenProvider = () => Promise<string | undefined>;

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  getAccessToken: AccessTokenProvider,
  fetcher: typeof fetch = fetch,
): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Authorization")) {
    const accessToken = await getAccessToken();
    if (accessToken) {
      headers.set("Authorization", `Bearer ${accessToken}`);
    }
  }
  return fetcher(input, {
    ...init,
    credentials: init?.credentials ?? "include",
    headers,
  });
}
