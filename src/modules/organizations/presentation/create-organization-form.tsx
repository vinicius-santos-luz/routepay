"use client";

import { useActionState } from "react";
import { createOrganizationAction } from "./create-organization-action";
import { organizationNameMaxLength } from "../domain/organization";
import { validateOrganizationNameInput } from "./organization-name-input";

export function CreateOrganizationForm() {
  const [state, action, pending] = useActionState(createOrganizationAction, {
    error: null,
  });
  return (
    <section
      aria-labelledby="create-organization-title"
      className="rounded-2xl border border-line bg-white p-5 sm:p-6"
    >
      <h2 id="create-organization-title" className="text-lg font-semibold">
        Criar organização
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Você será o primeiro proprietário. Esta etapa não habilita pagamentos.
      </p>
      <form action={action} className="mt-5 space-y-4" aria-busy={pending}>
        <div>
          <label
            htmlFor="organization-name"
            className="block text-sm font-medium"
          >
            Nome da organização
          </label>
          <input
            id="organization-name"
            name="name"
            type="text"
            required
            onInput={(event) =>
              validateOrganizationNameInput(event.currentTarget)
            }
            autoComplete="organization"
            aria-describedby={`organization-name-help${state.error ? " organization-create-error" : ""}`}
            className="mt-2 w-full min-w-0 rounded-lg border border-muted bg-white px-3 py-3 text-base"
          />
          <p
            id="organization-name-help"
            className="mt-2 text-xs leading-relaxed text-muted"
          >
            Até {organizationNameMaxLength} caracteres Unicode, sem contar
            espaços nas extremidades. Não informe senhas ou dados financeiros.
          </p>
        </div>
        <p
          id="organization-create-error"
          role="alert"
          className="text-sm text-ink"
        >
          {state.error}
        </p>
        <button
          type="submit"
          disabled={pending}
          className="button-primary w-full disabled:opacity-60 sm:w-auto"
        >
          {pending ? "Criando organização…" : "Criar organização"}
        </button>
      </form>
    </section>
  );
}
