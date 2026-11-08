import Link from "next/link";
import { requireSession } from "@/server/auth/session";
import { getOrganizationUseCases } from "@/server/authorization/organizations";
import type { OrganizationSummary } from "@/modules/organizations/application/repository";
import { CreateOrganizationForm } from "@/modules/organizations/presentation/create-organization-form";
import { OrganizationUnavailable } from "@/modules/organizations/presentation/organization-unavailable";
import {
  roleLabels,
  statusLabels,
} from "@/modules/organizations/presentation/organization-labels";

export const metadata = { title: "Organizações" };
export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  await requireSession();
  let organizations: OrganizationSummary[];
  try {
    organizations = await getOrganizationUseCases().list();
  } catch {
    return <OrganizationUnavailable />;
  }
  return (
    <>
      <p className="eyebrow mb-3 text-emerald">Espaço de trabalho</p>
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
        Suas organizações
      </h1>
      <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
        Acesse as empresas às quais você pertence ou crie uma nova organização.
      </p>
      <div className="mt-8 grid min-w-0 gap-6 xl:grid-cols-[1.3fr_1fr]">
        <section
          aria-labelledby="organizations-list-title"
          className="min-w-0 rounded-2xl border border-line bg-white p-5 sm:p-6"
        >
          <h2 id="organizations-list-title" className="text-lg font-semibold">
            Organizações disponíveis
          </h2>
          {organizations.length === 0 ? (
            <p className="mt-5 text-sm leading-relaxed text-muted">
              Você ainda não participa de uma organização. Crie a primeira ao
              lado ou abaixo.
            </p>
          ) : (
            <ul className="mt-5 space-y-4">
              {organizations.map((organization) => (
                <li
                  key={organization.id}
                  className="rounded-xl border border-line p-4"
                >
                  <Link
                    href={`/dashboard/organizations/${organization.id}`}
                    className="block rounded-sm font-semibold break-words text-emerald underline decoration-line underline-offset-4"
                  >
                    {organization.name}
                  </Link>
                  <p className="mt-2 text-sm text-muted">
                    {roleLabels[organization.role]} ·{" "}
                    {statusLabels[organization.status]}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
        <CreateOrganizationForm />
      </div>
    </>
  );
}
