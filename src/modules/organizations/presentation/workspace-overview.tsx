import { Icon, type IconName } from "@/components/ui/icon";

const areas: { title: string; icon: IconName; text: string }[] = [
  {
    title: "Organização",
    icon: "building",
    text: "Nenhuma organização cadastrada",
  },
  {
    title: "Fornecedores",
    icon: "users",
    text: "Nenhum fornecedor cadastrado",
  },
  { title: "Carteiras", icon: "wallet", text: "Nenhuma carteira conectada" },
];

export function WorkspaceOverview() {
  return (
    <>
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="eyebrow mb-3 text-emerald">Seu ponto de partida</p>
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Tudo começa com uma boa base.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
            Este será o espaço para organizar sua operação e acompanhar cada
            etapa dos pagamentos da sua empresa.
          </p>
        </div>
        <span className="rounded-full border border-line bg-white px-3 py-1.5 text-xs font-medium text-muted">
          Estrutura inicial
        </span>
      </div>

      <section
        aria-label="Áreas da plataforma"
        className="grid gap-4 md:grid-cols-3"
      >
        {areas.map(({ title, icon, text }) => (
          <article
            key={title}
            className="rounded-2xl border border-line bg-white p-5"
          >
            <div className="mb-6 flex items-center justify-between">
              <span className="flex size-10 items-center justify-center rounded-xl bg-paper text-emerald">
                <Icon name={icon} />
              </span>
              <span className="text-[10px] font-medium tracking-wider text-muted uppercase">
                Em breve
              </span>
            </div>
            <h2 className="text-sm font-semibold">{title}</h2>
            <p className="mt-2 text-xs leading-relaxed text-muted">{text}</p>
          </article>
        ))}
      </section>

      <div className="mt-7 grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <section className="flex flex-col rounded-2xl border border-line bg-white">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-5">
            <h2 className="text-base font-semibold">Atividade da plataforma</h2>
            <span className="rounded-full bg-paper px-2.5 py-1 text-[10px] font-medium text-muted">
              Sem registros
            </span>
          </div>
          <div className="flex flex-1 flex-col items-center justify-center px-7 py-16 text-center">
            <span className="mb-5 flex size-16 items-center justify-center rounded-2xl border border-line bg-paper text-emerald">
              <Icon name="document" className="size-7" />
            </span>
            <h3 className="text-base font-medium">
              Um novo capítulo para o seu financeiro.
            </h3>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-muted">
              Quando os módulos estiverem disponíveis, o histórico da sua
              operação aparecerá aqui.
            </p>
            <p className="mt-6 text-xs text-muted">
              Nenhum dado financeiro é consultado nesta prévia.
            </p>
          </div>
        </section>

        <section className="rounded-2xl border border-line bg-white p-6">
          <p className="eyebrow mb-3 text-emerald">Construindo o RoutePay</p>
          <h2 className="text-lg font-semibold">O caminho à frente</h2>
          <ol className="mt-6 space-y-6">
            <li className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-emerald">
                <Icon name="check" className="size-3.5" />
              </span>
              <div>
                <h3 className="text-sm font-medium">Fundação da plataforma</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Interface inicial e estrutura modular.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-paper text-muted">
                <Icon name="clock" className="size-3.5" />
              </span>
              <div>
                <h3 className="text-sm font-medium">
                  Identidade e organizações
                </h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Autenticação e controle de acesso por empresa, em uma próxima
                  etapa.
                </p>
              </div>
            </li>
            <li className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-paper text-muted">
                <Icon name="shield" className="size-3.5" />
              </span>
              <div>
                <h3 className="text-sm font-medium">Validação financeira</h3>
                <p className="mt-1 text-xs leading-relaxed text-muted">
                  Integração condicionada à validação de suporte, liquidação,
                  recuperação e segurança.
                </p>
              </div>
            </li>
          </ol>
          <div className="mt-7 border-t border-line pt-5 text-xs leading-relaxed text-muted">
            Pagamentos e conexão de carteiras permanecem indisponíveis.
          </div>
        </section>
      </div>
    </>
  );
}
