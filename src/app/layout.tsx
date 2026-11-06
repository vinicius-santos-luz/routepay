import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getApplicationEnvironment } from "@/server/config/environment";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RoutePay | O próximo caminho dos pagamentos",
    template: "%s | RoutePay",
  },
  description:
    "Uma nova experiência para pagamentos empresariais em stablecoins. Conheça o RoutePay, uma plataforma em desenvolvimento com foco em controle, clareza e execução não custodial.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  getApplicationEnvironment();

  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#main-content">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
