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
  code?: string;
  repaired?: boolean;
  userId?: string;
}

export class ApiRequestError extends Error {
  status: number;
  code: string | null;
  details: ErrorPayload | null;

  constructor(message: string, status: number, code: string | null = null, details: ErrorPayload | null = null) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
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
    let payload: ErrorPayload | null = null;
    try {
      payload = (await response.json()) as ErrorPayload;
      if (payload.message) {
        message = payload.message;
      }
    } catch {
      // Ignore JSON parse failures for non-JSON error responses.
    }
    throw new ApiRequestError(message, response.status, payload?.code ?? null, payload);
  }

  return (await response.json()) as T;
}
