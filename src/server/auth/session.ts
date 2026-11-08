import "server-only";
import { cache } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { protectedDestination, resolveSession } from "./session-policy";

export const getSessionState = cache(async () =>
  resolveSession(async () =>
    getAuth().api.getSession({
      headers: await headers(),
      query: { disableCookieCache: true },
    }),
  ),
);

export async function requireSession() {
  const state = await getSessionState();
  const destination = protectedDestination(state);
  if (destination) redirect(destination);
  if (state.status !== "authenticated") throw new Error("Sessão indisponível.");
  return state.user;
}
