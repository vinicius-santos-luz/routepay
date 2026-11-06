import Link from "next/link";
import { Brand } from "@/components/brand";
import { Icon, type IconName } from "@/components/ui/icon";

const principles: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "building",
    title: "Pensado para empresas",
    text: "Organizações, fornecedores e aprovações em um único espaço de trabalho.",
  },
  {
    icon: "shield",
    title: "Controle em cada etapa",
    text: "Uma experiência projetada para autorização explícita e rastreabilidade.",
  },
  {
    icon: "wallet",
    title: "Execução não custodial",
    text: "Suas chaves permanecem na sua carteira. Esse é o princípio do produto.",
  },
];

export default function HomePage() {
  return (
    <>
      <header className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-6 py-7 lg:px-10">
        <Brand />
        <nav
          aria-label="Navegação principal"
          className="flex items-center gap-5 text-sm font-medium sm:gap-8"
        >
          <a href="#plataforma" className="text-muted hover:text-ink">
            A plataforma
          </a>
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 hover:border-emerald"
          >
            Explorar interface <Icon name="arrow" className="size-4" />
          </Link>
        </nav>
      </header>

      <main id="main-content" tabIndex={-1}>
        <section className="mx-auto grid max-w-7xl items-center gap-14 px-6 pt-12 pb-20 lg:grid-cols-[1.08fr_1fr] lg:px-10 lg:pt-20 lg:pb-28">
          <div>
            <p className="eyebrow mb-7 flex items-center gap-2.5 text-emerald">
              <span className="size-2 rounded-full bg-emerald" /> Uma nova rota
              para o seu negócio
            </p>
            <h1 className="max-w-2xl text-[clamp(2.8rem,5vw,4.5rem)] leading-[1.06] font-semibold tracking-[-0.055em]">
              Pagamentos globais.
              <br />
              <span className="text-emerald">Controle da sua empresa.</span>
            </h1>
            <p className="mt-7 max-w-lg text-lg leading-relaxed text-muted">
              Estamos construindo um caminho mais claro para pagamentos
              empresariais em stablecoins. Da intenção ao registro, com a
              organização que o seu financeiro precisa.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-5">
              <Link href="/dashboard" className="button-primary">
                Conhecer a interface <Icon name="arrow" />
              </Link>
              <span className="text-xs text-muted">
                Em desenvolvimento · Prévia disponível
              </span>
            </div>
            <div className="mt-10 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-6 text-xs font-medium text-muted">
              <span className="flex items-center gap-2">
                <Icon name="check" className="size-4 text-emerald" /> Foco
                empresarial
              </span>
              <span className="flex items-center gap-2">
                <Icon name="check" className="size-4 text-emerald" /> Visão não
                custodial
              </span>
              <span className="flex items-center gap-2">
                <Icon name="check" className="size-4 text-emerald" /> Projetado
                para Solana
              </span>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[28px] bg-ink p-7 text-white shadow-[0_24px_60px_-24px_#142a2b66] sm:p-9">
            <div className="flex items-center justify-between gap-4">
              <span className="eyebrow text-accent">Uma jornada conectada</span>
              <span className="rounded-full border border-white/20 px-2.5 py-1 text-[10px] text-white/75">
                VISÃO DO PRODUTO
              </span>
            </div>
            <div
              className="route-grid relative my-7 flex min-h-48 items-center justify-center rounded-2xl border border-white/10 px-3 sm:px-6"
              aria-hidden="true"
            >
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-white text-ink sm:size-16">
                <Icon name="building" className="size-7" />
              </div>
              <div className="h-px flex-1 bg-accent/60" />
              <div className="flex size-12 shrink-0 items-center justify-center rounded-full border border-accent/60 bg-ink text-accent">
                <Icon name="shield" className="size-6" />
              </div>
              <div className="h-px flex-1 bg-accent/60" />
              <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-accent text-ink sm:size-16">
                <Icon name="wallet" className="size-7" />
              </div>
              <span className="absolute bottom-5 left-6 text-[10px] tracking-widest text-white/65">
                SUA EMPRESA
              </span>
              <span className="absolute right-6 bottom-5 text-[10px] tracking-widest text-white/65">
                DESTINATÁRIO
              </span>
            </div>
            <div className="space-y-3">
              {[
                ["01", "Organizar", "Fornecedores e destinatários"],
                ["02", "Autorizar", "Políticas e aprovações"],
                ["03", "Acompanhar", "Histórico e comprovantes"],
              ].map(([number, title, detail]) => (
                <div
                  key={number}
                  className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/5 p-3.5"
                >
                  <span className="font-mono text-xs text-accent">
                    {number}
                  </span>
                  <div className="flex flex-1 flex-wrap items-center justify-between gap-1">
                    <span className="text-sm font-medium">{title}</span>
                    <span className="text-xs text-white/60">{detail}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-5 text-xs leading-relaxed text-white/60">
              Conceito da plataforma. A execução financeira ainda não está
              disponível.
            </p>
          </div>
        </section>

        <section id="plataforma" className="border-y border-line bg-white/65">
          <div className="mx-auto max-w-7xl px-6 py-16 lg:px-10">
            <div className="mb-9 flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow mb-3 text-emerald">
                  Clareza desde o início
                </p>
                <h2 className="text-3xl font-semibold tracking-tight">
                  Uma base para o próximo passo.
                </h2>
              </div>
              <p className="max-w-sm text-sm leading-relaxed text-muted">
                A familiaridade de um financeiro empresarial, com uma nova
                infraestrutura em construção.
              </p>
            </div>
            <div className="grid gap-5 md:grid-cols-3">
              {principles.map(({ icon, title, text }) => (
                <article
                  key={title}
                  className="rounded-2xl border border-line bg-white p-7"
                >
                  <span className="mb-6 flex size-11 items-center justify-center rounded-xl bg-paper text-emerald">
                    <Icon name={icon} className="size-6" />
                  </span>
                  <h3 className="mb-3 text-base font-semibold">{title}</h3>
                  <p className="text-sm leading-relaxed text-muted">{text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-5 px-6 py-8 text-xs text-muted lg:px-10">
        <span>RoutePay © 2026</span>
        <span>Fundação do produto · Operações financeiras indisponíveis</span>
      </footer>
    </>
  );
}
