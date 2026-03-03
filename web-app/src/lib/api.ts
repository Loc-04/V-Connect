const apiBaseUrl = import.meta.env.VITE_API_BASE_URL;

if (!apiBaseUrl) {
  throw new Error('Missing VITE_API_BASE_URL in web-app/.env');
}

interface ApiRequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  accessToken?: string;
  body?: unknown;
}

interface ErrorPayload {
  message?: string;
}

export async function apiRequest<T>(path: string, options: ApiRequestOptions = {}): Promise<T> {
  const { method = 'GET', accessToken, body } = options;
  const url = `${apiBaseUrl}${path}`;

  const response = await fetch(url, {
    method,
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let message = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as ErrorPayload;
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Ignore JSON parse failures for non-JSON error responses.
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}
