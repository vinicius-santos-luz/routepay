"use client";

import { useState } from "react";
import { authClient } from "./auth-client";

export function GoogleSignIn({ enabled }: { enabled: boolean }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    if (!enabled || pending) return;
    setPending(true);
    setError(null);
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/dashboard",
      });
      if (result.error) {
        setError(
          "Não foi possível iniciar o login. Tente novamente mais tarde.",
        );
        setPending(false);
      }
    } catch {
      setError("Não foi possível iniciar o login. Tente novamente mais tarde.");
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={signIn}
        disabled={!enabled || pending}
        className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Iniciando login…" : "Continuar com Google"}
      </button>
      {error && (
        <p role="alert" className="mt-4 text-sm text-ink">
          {error}
        </p>
      )}
    </div>
  );
}
