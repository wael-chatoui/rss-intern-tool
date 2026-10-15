/** Notify the workspace without navigating away from unsaved drafts. */
export async function authenticatedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('redaction-session-expired'));
  return response;
}
