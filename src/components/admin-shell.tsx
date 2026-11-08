import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/brand";
import { Icon, type IconName } from "@/components/ui/icon";
import { SignOut } from "@/modules/identity/presentation/sign-out";
import { AdminNavigation } from "./admin-navigation";

const plannedNavigation: { label: string; icon: IconName }[] = [
  { label: "Fornecedores", icon: "users" },
  { label: "Pagamentos", icon: "wallet" },
  { label: "Comprovantes", icon: "document" },
  { label: "Auditoria", icon: "shield" },
];

export function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[244px_1fr]">
      <aside className="flex flex-col border-b border-line bg-white lg:min-h-screen lg:border-r lg:border-b-0">
        <div className="px-6 py-7">
          <Brand />
        </div>
        <div className="mx-5 mb-7 rounded-xl border border-line bg-paper p-3.5">
          <p className="eyebrow mb-2 text-muted">Espaço de trabalho</p>
          <p className="text-sm font-semibold">Suas organizações</p>
          <p className="mt-1 text-xs text-muted">
            Criação e consulta de empresas
          </p>
        </div>
        <nav aria-label="Navegação administrativa" className="px-4">
          <AdminNavigation />
          <p className="eyebrow mt-7 mb-3 px-3 text-muted">Próximos módulos</p>
          <ul className="flex flex-wrap gap-1 lg:block">
            {plannedNavigation.map(({ label, icon }) => (
              <li key={label}>
                <span
                  aria-disabled="true"
                  className="flex items-center gap-3 px-3 py-3 text-sm text-muted"
                >
                  <Icon name={icon} />
                  <span className="flex-1">{label}</span>
                  <span className="text-[10px]">Em breve</span>
                </span>
              </li>
            ))}
          </ul>
        </nav>
        <div className="mt-auto p-6">
          <div className="rounded-xl bg-ink p-4 text-white">
            <Icon name="shield" className="mb-3 text-accent" />
            <p className="text-sm font-medium">O controle começa aqui.</p>
            <p className="mt-2 text-xs leading-relaxed text-white/65">
              Uma base pensada para crescer com a sua operação.
            </p>
          </div>
        </div>
      </aside>
      <div className="min-w-0">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-line bg-white/70 px-6 py-5 lg:px-10">
          <p className="text-sm text-muted">
            Plataforma <span className="mx-2 text-line">/</span>{" "}
            <span className="font-medium text-ink">Espaço de trabalho</span>
          </p>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-xs font-medium text-emerald"
            >
              Página institucional <Icon name="arrow" className="size-4" />
            </Link>
            <SignOut />
          </div>
        </header>
        <div className="border-b border-line bg-accent/20 px-6 py-3 text-xs leading-relaxed text-emerald lg:px-10">
          <strong>Estrutura inicial da plataforma.</strong> Área autenticada;
          criação e consulta de organizações disponíveis após a preparação
          local. Administração de membros e operações financeiras indisponíveis.
        </div>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-6xl px-6 py-9 lg:px-10 lg:py-11"
        >
          {children}
        </main>
      </div>
    </div>
  );
}
