import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/server/auth/session";
import { getOrganizationUseCases } from "@/server/authorization/organizations";
import { OrganizationError } from "@/modules/organizations/domain/errors";
import type { OrganizationSummary } from "@/modules/organizations/application/repository";
import { OrganizationUnavailable } from "@/modules/organizations/presentation/organization-unavailable";
import {
  roleLabels,
  statusLabels,
} from "@/modules/organizations/presentation/organization-labels";

export const metadata = { title: "Organização" };
export const dynamic = "force-dynamic";

export default async function OrganizationPage({
  params,
}: {
  params: Promise<{ organizationId: string }>;
}) {
  await requireSession();
  const { organizationId } = await params;
  let organization: OrganizationSummary;
  try {
    organization = await getOrganizationUseCases().find(organizationId);
  } catch (error) {
    if (
      error instanceof OrganizationError &&
      (error.code === "ACCESS_DENIED" || error.code === "INVALID_INPUT")
    )
      notFound();
    return <OrganizationUnavailable />;
  }
  return (
    <>
      <Link
        href="/dashboard/organizations"
        className="text-sm font-medium text-emerald underline underline-offset-4"
      >
        Voltar para organizações
      </Link>
      <p className="eyebrow mt-7 mb-3 text-emerald">Organização</p>
      <h1 className="text-3xl font-semibold tracking-tight break-words sm:text-4xl">
        {organization.name}
      </h1>
      <dl className="mt-8 grid min-w-0 gap-6 rounded-2xl border border-line bg-white p-5 sm:grid-cols-2 sm:p-6">
        <div>
          <dt className="text-sm text-muted">Situação</dt>
          <dd className="mt-2 font-medium">
            {statusLabels[organization.status]}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Seu papel</dt>
          <dd className="mt-2 font-medium">{roleLabels[organization.role]}</dd>
        </div>
        <div className="min-w-0 sm:col-span-2">
          <dt className="text-sm text-muted">Identificador</dt>
          <dd className="mt-2 font-mono text-sm break-all">
            {organization.id}
          </dd>
        </div>
        <div>
          <dt className="text-sm text-muted">Criada em</dt>
          <dd className="mt-2">
            <time dateTime={organization.createdAt}>
              {new Intl.DateTimeFormat("pt-BR", {
                dateStyle: "medium",
                timeZone: "America/Sao_Paulo",
              }).format(new Date(organization.createdAt))}
            </time>
          </dd>
        </div>
      </dl>
      <p className="mt-6 text-sm leading-relaxed text-muted">
        Nesta entrega, estão disponíveis a criação e a consulta de organizações.
        Administração de membros, carteiras e pagamentos permanecem
        indisponíveis.
      </p>
    </>
  );
}
