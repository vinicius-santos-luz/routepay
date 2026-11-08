export interface AuthSession {
  user: { id: string; name: string; email: string; emailVerified: boolean };
  session: { id: string; expiresAt: Date };
}

export type SessionState =
  | { status: "authenticated"; user: AuthSession["user"] }
  | { status: "anonymous" }
  | { status: "unavailable" };

export async function resolveSession(
  reader: () => Promise<AuthSession | null>,
  now: Date = new Date(),
): Promise<SessionState> {
  try {
    const result = await reader();
    if (
      !result ||
      !result.user.emailVerified ||
      !Number.isFinite(result.session.expiresAt.getTime()) ||
      result.session.expiresAt <= now
    ) {
      return { status: "anonymous" };
    }
    return { status: "authenticated", user: result.user };
  } catch {
    return { status: "unavailable" };
  }
}

export function protectedDestination(
  state: SessionState,
): "/login" | "/login?error=unavailable" | null {
  if (state.status === "anonymous") return "/login";
  if (state.status === "unavailable") return "/login?error=unavailable";
  return null;
}
