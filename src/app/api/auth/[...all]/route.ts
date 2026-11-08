import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth/auth";
import {
  handleAuthRequest,
  verifySignOutResponse,
} from "@/server/auth/http-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  return handleAuthRequest(() => toNextJsHandler(getAuth()).GET(request));
}

export async function POST(request: Request) {
  return handleAuthRequest(async () => {
    const auth = getAuth();
    const response = await toNextJsHandler(auth).POST(request);
    if (
      new URL(request.url).pathname.replace(/\/+$/, "") === "/api/auth/sign-out"
    ) {
      return verifySignOutResponse(response, () =>
        auth.api.getSession({
          headers: request.headers,
          query: { disableCookieCache: true },
        }),
      );
    }
    return response;
  });
}
