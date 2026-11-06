# RoutePay

Enterprise stablecoin payments platform built on Solana with MultiHopper integration.

O RoutePay tem como objetivo oferecer uma plataforma empresarial de pagamentos em
stablecoins na Solana, com organização de fornecedores, aprovações, histórico e
execução não custodial. Essa é a visão do produto; a execução financeira ainda
não foi implementada.

## Estado atual

**Etapa 2 — fundação do projeto.** Monólito modular com página institucional e
layout administrativo estático, público e sem autenticação.

| Rota         | Conteúdo                                                    |
| ------------ | ----------------------------------------------------------- |
| `/`          | Apresentação institucional e princípios do produto          |
| `/dashboard` | Prévia pública do layout administrativo, com estados vazios |

Os módulos futuros aparecem como indisponíveis. Não existem usuários, sessões,
organizações persistidas, saldos simulados ou operações financeiras funcionais.

## Stack

- Next.js 16 com App Router e React 19.
- TypeScript estrito, incluindo `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`.
- Tailwind CSS 4 com PostCSS.
- ESLint 9 com regras Next.js Core Web Vitals e TypeScript.
- Prettier para formatação consistente.
- Vitest 5 para testes unitários em Node.js.
- npm com versões diretas fixadas e `package-lock.json` versionado.

PostgreSQL/Neon, Solana, MultiHopper e Playwright fazem parte da arquitetura
planejada, mas não estão instalados ou integrados nesta etapa.

## Requisitos

- Node.js **24.x** (a versão principal está registrada em `.nvmrc`).
- npm **11.x**.
- Acesso ao registro npm para instalar as dependências.

Não é necessário configurar banco, carteira, RPC, conta de hospedagem ou chave de API.
As páginas usam fontes do sistema e não dependem de download de fontes no build.

## Instalação

No diretório deste repositório:

```bash
nvm use
npm ci
```

O comando `nvm use` é opcional se o Node.js 24 já estiver instalado por outro meio.

## Ambiente

A aplicação funciona sem arquivo `.env`. Para explicitar a configuração local,
opcionalmente copie o exemplo:

```bash
cp .env.example .env.local
```

| Variável  | Padrão  | Valores aceitos |
| --------- | ------- | --------------- |
| `APP_ENV` | `local` | `local`, `test` |

Valores vazios ou desconhecidos são rejeitados na renderização/build. `APP_ENV`
é uma configuração da aplicação e não substitui `NODE_ENV`, gerenciado pelo Next.js.
`npm run build` continua gerando o bundle otimizado normalmente.

Nenhuma variável habilita execução financeira, rede blockchain ou banco.
O exemplo não contém credenciais. Arquivos `.env` locais são ignorados pelo Git;
`.env.example` permanece versionado. Nunca armazene chaves privadas ou seed phrases.

## Execução local

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) e
[http://localhost:3000/dashboard](http://localhost:3000/dashboard).

Para verificar localmente o bundle otimizado:

```bash
npm run build
npm start
```

Isso inicia um servidor local; não realiza deploy.

## Qualidade e testes

```bash
npm run lint
npm run typecheck
npm test
npm run build
```

`npm run check` executa formatação, lint, TypeScript e testes em sequência. O build é separado.
`npm run format` formata os arquivos; `npm run format:check` apenas verifica.
`npm run typecheck` gera primeiro os tipos de rotas do Next.js para funcionar
também em um checkout novo. `npm run test:watch` mantém o Vitest em observação.

Os testes atuais verificam a configuração local padrão, os ambientes aceitos e
a rejeição de valores não suportados. Não fazem chamadas externas nem precisam
de credenciais. Testes de interface no navegador, integração PostgreSQL e jornadas
Playwright serão adicionados quando os respectivos comportamentos existirem.

## Estrutura e limites dos módulos

```text
src/
  app/                         # Rotas, layouts, estilos e metadados
    (dashboard)/dashboard/     # /dashboard, prévia pública
  components/                  # Componentes visuais compartilhados
    ui/
  modules/
    identity/
    organizations/presentation/
    counterparties/
    wallets/
    payments/
      domain/
      application/
      infrastructure/
      presentation/
    reconciliation/
    receipts/
    audit/
  integrations/                # Reserva; sem adaptadores financeiros
  server/                      # Apenas servidor
    config/
    auth/
    authorization/
    db/
    jobs/
    observability/
  shared/validation/
db/migrations/                 # Reserva; sem migrations ou conexões
tests/{unit,integration,e2e,fixtures}/
docs/architecture/
```

As pastas vazias são preservadas com `.gitkeep`; não representam módulos
implementados. Consulte [a arquitetura](docs/architecture/foundation.md) para
responsabilidades e direção de dependências.

## Limitações e próximos passos

- O painel é público. Não inserir dados empresariais ou pessoais antes de implementar
  autenticação real e autorização por organização.
- Não há cadastro, persistência, conexão de carteiras, criação/aprovação de pagamentos,
  assinatura, envio blockchain, comprovantes ou auditoria operacional.
- Não há Neon, PostgreSQL, endpoints financeiros ou SDKs blockchain configurados.
- A integração MultiHopper permanece bloqueada até comprovar stablecoins/mints
  suportados, entrega do ativo original, recuperação de fundos e segurança do deployment.
- Os próximos módulos exigem autorização no servidor, isolamento por organização,
  idempotência, validação de valores e endereços e reconciliação on-chain.
- Não foram configurados ambientes de produção ou deploy.

Referências da fundação: [instalação Next.js](https://nextjs.org/docs/app/getting-started/installation),
[Tailwind com Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
e [Vitest com Next.js](https://nextjs.org/docs/app/guides/testing/vitest).
