import Link from "next/link";
import { Brand } from "@/components/brand";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <Brand />
      <main id="main-content" tabIndex={-1} className="py-24">
        <p className="eyebrow mb-4 text-emerald">Página não encontrada</p>
        <h1 className="text-4xl font-semibold tracking-tight">
          Vamos voltar ao caminho.
        </h1>
        <p className="mt-5 mb-8 text-muted">
          Este endereço não está disponível no RoutePay.
        </p>
        <Link href="/" className="button-primary">
          Voltar ao início
        </Link>
      </main>
    </div>
  );
}
