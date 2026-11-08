export function authUnavailableResponse() {
  return Response.json(
    { error: "Autenticação indisponível no momento." },
    {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

/** Better Auth may clear cookies even when server-side session deletion fails. */
export async function verifySignOutResponse(
  response: Response,
  readOriginalSession: () => Promise<unknown>,
): Promise<Response> {
  if (!response.ok) return response;
  try {
    return (await readOriginalSession()) ? authUnavailableResponse() : response;
  } catch {
    return authUnavailableResponse();
  }
}

export async function handleAuthRequest(
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    const response = await handler();
    if (response.status >= 500) return authUnavailableResponse();
    const result = new Response(response.body, response);
    result.headers.set("Cache-Control", "no-store");
    return result;
  } catch {
    return authUnavailableResponse();
  }
}
