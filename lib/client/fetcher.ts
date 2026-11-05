export async function apiFetcher<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  const json = (await response.json().catch(() => null)) as
    | {
        ok?: boolean;
        data?: T;
        error?: string;
        details?: {
          issues?: Array<{
            path?: string;
            message?: string;
          }>;
          reset?: number;
        };
      }
    | null;

  if (!response.ok || !json?.ok) {
    const status = response.status;
    const firstIssue = json?.details?.issues?.find((issue) => issue.message?.trim());
    const serverFailure = status >= 500;
    const message = serverFailure
      ? "Something went wrong. Please try again shortly."
      : firstIssue?.message ??
        json?.error ??
        "We couldn't complete that request. Please try again.";

    const error = new Error(message);
    Object.assign(error, {
      status,
      details: serverFailure ? undefined : json?.details,
    });
    throw error;
  }

  return json.data as T;
}
