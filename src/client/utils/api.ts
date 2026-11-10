export async function safeFetchJson<T = any>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<{ ok: boolean; status: number; data?: T; error?: string }> {
  try {
    const res = await fetch(input, init);
    const text = await res.text();
    let data: T | undefined;
    try {
      data = text ? JSON.parse(text) : undefined;
    } catch {
      // Response was plain text or HTML (e.g. Vercel 404 "The page could not be found")
      let errorMsg = `Server returned HTTP ${res.status}`;
      if (res.status === 404) {
        errorMsg = 'Backend API endpoint not found (404). Backend service may not be running on this domain.';
      } else if (text) {
        errorMsg = text.slice(0, 150);
      }
      return {
        ok: false,
        status: res.status,
        error: errorMsg,
      };
    }

    if (!res.ok) {
      const errorMsg = (data as any)?.error || (data as any)?.message || `HTTP Error ${res.status}`;
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
