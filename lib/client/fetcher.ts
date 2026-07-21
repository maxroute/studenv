export async function apiFetcher<T>(input: RequestInfo, init?: RequestInit) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = (await response.json()) as {
    ok: boolean;
    data?: T;
    error?: string;
    details?: {
      issues?: Array<{
        path?: string;
        message?: string;
      }>;
    };
  };

  if (!response.ok || !json.ok) {
    const firstIssue = json.details?.issues?.find((issue) => issue.message?.trim());
    const error = new Error(firstIssue?.message ?? json.error ?? "Request failed.");
    Object.assign(error, {
      status: response.status,
      details: json.details,
    });
    throw error;
  }

  return json.data as T;
}
