export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const res = await fetch(input, init);
    const text = await res.text();
    let data: T | undefined;

    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        // Response was plain text or HTML (e.g. Vercel 404 "The page could not be found" or 500 "This Serverless Function has crashed")
        let errorMsg = `Server returned HTTP ${res.status}`;
        if (res.status === 404) {
          errorMsg = 'Backend endpoint not found (404). If running on Vercel, serverless function may not be routed.';
        } else if (text.trim().startsWith('<')) {
          errorMsg = `Server returned an HTML error page (HTTP ${res.status}).`;
        } else {
          errorMsg = text.slice(0, 150);
        }

        return {
          ok: false,
          status: res.status,
          error: errorMsg,
        };
      }
    }

    if (!res.ok) {
      const errorMsg =
        (data as any)?.error ||
        (data as any)?.message ||
        `HTTP Error ${res.status}`;
      return {
        ok: false,
        status: res.status,
        data,
        error: errorMsg,
      };
    }

    return { ok: true, status: res.status, data };
  } catch (err: any) {
    return {
      ok: false,
      status: 0,
      error: err?.message || 'Failed to connect to server',
    };
  }
}
