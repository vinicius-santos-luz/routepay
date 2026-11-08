"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "./auth-client";

export function SignOut() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  async function signOut() {
    setPending(true);
    setError(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Logout indisponível");
      router.replace("/login");
      router.refresh();
    } catch {
      setError(true);
      setPending(false);
    }
  }
  return (
    <div className="text-right">
      <button
        type="button"
        disabled={pending}
        onClick={signOut}
        className="rounded-lg border border-line px-3 py-2 text-xs font-medium text-emerald disabled:opacity-60"
      >
        {pending ? "Saindo…" : "Sair"}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-xs text-ink">
          Não foi possível encerrar a sessão. Tente novamente.
        </p>
      )}
    </div>
  );
}
