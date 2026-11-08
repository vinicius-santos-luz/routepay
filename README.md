# RoutePay

Enterprise stablecoin payments platform built on Solana with MultiHopper integration.

O RoutePay tem como objetivo oferecer uma plataforma empresarial de pagamentos em
stablecoins na Solana, com organização de fornecedores, aprovações, histórico e
execução não custodial. Essa é a visão do produto; a execução financeira ainda
não foi implementada.

## Estado atual

**Autenticação e primeira entrega de organizações.** Monólito modular com página
institucional pública, dashboard protegido e Better Auth com PostgreSQL local e
Google OAuth. Login/logout e o primeiro fluxo autenticado de organizações foram
validados manualmente pelo responsável.

| Rota                                        | Conteúdo                                                      |
| ------------------------------------------- | ------------------------------------------------------------- |
| `/`                                         | Apresentação institucional pública                            |
| `/login`                                    | Entrada com Google, desabilitada enquanto faltar configuração |
| `/dashboard`                                | Layout administrativo; exige sessão válida no servidor        |
| `/api/auth/[...all]`                        | Handlers GET/POST oficiais do Better Auth                     |
| `/dashboard/organizations`                  | Criação e listagem de organizações autorizadas                |
| `/dashboard/organizations/[organizationId]` | Dados básicos de uma organização autorizada                   |

Estado confirmado dos ambientes PostgreSQL **18.6** locais no WSL:

| Ambiente        | Cluster            | Host/porta       | Banco          | Migrations aplicadas |
| --------------- | ------------------ | ---------------- | -------------- | -------------------- |
| Desenvolvimento | `18/main`          | `127.0.0.1:5432` | `routepay_dev` | `0001` e `0002`      |
| Testes isolados | `18/routepay_test` | `127.0.0.1:5433` | `routepay_dev` | `0001` e `0002`      |

No desenvolvimento, `0002_organizations.sql` foi aplicada em **08/11/2026**, com
checksum SHA-256 `d2d720527711c52ec5ed23fbaba6876e6bf6cd822b8ee244c507f89f9bf253b0`.
O banco possui sete tabelas, todas de propriedade de `routepay_migrator`, com RLS
habilitada em `organizations` e `organization_memberships`. A aplicação utiliza
somente `routepay_app`.

A organização **RoutePay Desenvolvimento** foi criada pela interface como `ACTIVE`,
com um vínculo `OWNER ACTIVE`. Listagem, persistência após atualização e página de
detalhes funcionaram no fluxo HTTP autenticado validado manualmente. Isso não
representa execução de uma suíte HTTP automatizada.

Não há login fictício nem acesso protegido quando a configuração, o banco ou a
sessão estão indisponíveis. Sem as tabelas empresariais, o módulo mostra
indisponibilidade, sem dados simulados. Os módulos futuros permanecem indisponíveis;
não há pagamentos e a aplicação não está pronta para produção.

## Stack

- Next.js 16 com App Router e React 19.
- TypeScript estrito, incluindo `noUncheckedIndexedAccess` e `exactOptionalPropertyTypes`.
- Tailwind CSS 4 com PostCSS.
- ESLint 9 com regras Next.js Core Web Vitals e TypeScript.
- Prettier para formatação consistente.
- Vitest 5 para testes unitários em Node.js.
- npm com versões diretas fixadas e `package-lock.json` versionado.
- Better Auth **1.7.18**, driver PostgreSQL `pg` **8.23.1**, sem ORM adicional.

Neon, Solana, MultiHopper e Playwright não foram integrados. O projeto não depende
de assinatura paga, cartão ou serviço contratado. PostgreSQL é executado localmente;
nenhum projeto externo foi criado. Better Auth substitui Clerk e Auth.js.

## Requisitos

- Node.js **24.x** (a versão principal está registrada em `.nvmrc`).
- npm **11.x**.
- Acesso ao registro npm para instalar as dependências.
- PostgreSQL **18.6** local exclusivo do RoutePay, apenas para habilitar a autenticação real.

Build, testes e página pública funcionam sem banco ou credenciais. As páginas usam
fontes do sistema e não dependem de download de fontes no build.

## Instalação

No diretório deste repositório:

```bash
nvm use
npm ci
```

O comando `nvm use` é opcional se o Node.js 24 já estiver instalado por outro meio.

## Ambiente

A página pública funciona sem arquivo `.env`. Para preparar a autenticação local:

```bash
cp .env.example .env.local
```

| Variável                 | Configuração                                                                   |
| ------------------------ | ------------------------------------------------------------------------------ |
| `APP_ENV`                | `local` (padrão) ou `test`                                                     |
| `DATABASE_URL`           | Somente `routepay_app` em `routepay_dev` local                                 |
| `MIGRATION_DATABASE_URL` | Somente `routepay_migrator` em `routepay_dev` local; exclusiva do processo CLI |
| `BETTER_AUTH_URL`        | Origem local explícita; exemplo `http://localhost:3000`                        |
| `BETTER_AUTH_SECRET`     | Segredo aleatório com pelo menos 32 caracteres, gerado localmente              |
| `GOOGLE_CLIENT_ID`       | ID OAuth do Google, quando configurado pelo responsável                        |
| `GOOGLE_CLIENT_SECRET`   | Segredo OAuth correspondente, somente no servidor                              |

`APP_ENV` vazio ou desconhecido é rejeitado. Essa variável não substitui `NODE_ENV`,
gerenciado pelo Next.js. As configurações sensíveis são validadas somente no uso
da autenticação; sua ausência não impede build/testes, mas impede acesso ao painel.
Não há valores padrão para segredo ou banco. Google é habilitado apenas com o par
completo de variáveis e uma configuração local de autenticação válida.

O exemplo não contém credenciais. Arquivos `.env` locais são ignorados pelo Git;
`.env.example` permanece versionado. Nunca armazene chaves privadas ou seed phrases.
Não reutilize banco, usuário ou credenciais de outro projeto, incluindo o Arkhe.

Consulte [a configuração de autenticação](docs/architecture/authentication.md) para
preparar PostgreSQL, identificar o alvo antes das migrations e configurar Google.
`0001` e `0002` já estão aplicadas nos dois clusters; não editar seus arquivos nem
reaplicá-las manualmente. Futuras evoluções exigem nova migration e revisão.
`DATABASE_URL` não substitui `MIGRATION_DATABASE_URL`, nem o contrário. A CLI não
carrega `.env.local`; forneça sua variável somente ao processo de migrations. Não
coloque a credencial do migrator na configuração do Next.js ou em `NEXT_PUBLIC_*`.

## Execução local

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) e
[http://localhost:3000/login](http://localhost:3000/login).
`/dashboard` redireciona para o login quando não há sessão validada.

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

Os testes verificam ambientes, alvo local, confirmação de migrations, transações e
checksums com conexão simulada, contrato do SQL com o schema do Better Auth instalado,
expiração e negação de sessões, origem/CSRF, senhas desabilitadas e falha do banco
com cookie assinado nos handlers reais da biblioteca. Esses testes unitários não
criam sessões de aplicação, não abrem conexões de banco nem chamam Google; o fluxo
OAuth completo não é executado pela suíte.

Organizações têm testes de domínio, políticas, sessão, casos de uso, repositório e
transações simulados, fronteira da Server Action e contrato estrutural de SQL/ACLs.
Esses testes simulados não comprovam isolamento ou concorrência reais no banco.
Separadamente, foram aprovados **52 cenários reais de integração** no cluster
`18/routepay_test`, porta `5433`, incluindo RLS, permissões, integridade, Unicode,
rollback e concorrência. Consulte o [procedimento de integração](docs/testing/organizations-integration.md).
O fluxo HTTP autenticado da primeira organização foi validado manualmente; não
foi executada uma suíte HTTP automatizada. Consulte
[a arquitetura de organizações](docs/architecture/organizations.md) para modelo,
matriz, evidências e riscos remanescentes.

## Estrutura e limites dos módulos

```text
src/
  app/                         # Rotas, layouts, estilos e metadados
    (auth)/login/              # Entrada; sem autenticação simulada
    (dashboard)/dashboard/     # /dashboard, sessão obrigatória no servidor
    api/auth/[...all]/         # Handlers Better Auth
  components/                  # Componentes visuais compartilhados
    ui/
  modules/
    identity/presentation/     # Cliente Better Auth, entrada Google e logout
    organizations/presentation/
      # Também domain/, application/ e infrastructure/
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
    auth/                      # Configuração lazy, sessão e política de falhas
    authorization/
    db/                        # Pool local e segurança das migrations
    jobs/
    observability/
  shared/validation/
db/migrations/                 # 0001 e 0002 aplicadas nos dois clusters locais
scripts/database.mts           # Inspeção de alvo sem conexão; migrations com confirmação
tests/{unit,integration,e2e,fixtures}/
docs/architecture/
```

As pastas vazias são preservadas com `.gitkeep`; não representam módulos
implementados. Consulte [a arquitetura](docs/architecture/foundation.md) para
responsabilidades e direção de dependências.

## Limitações e próximos passos

- Migrations `0001` e `0002` aplicadas nos clusters locais de desenvolvimento e
  testes isolados. `db:target` apenas mostra configuração sanitizada. Novas
  evoluções precisam de migrations próprias, revisão e validação isolada.
- Sessões duram até oito horas sem renovação automática e sem cache de sessão em cookie;
  logout usa o endpoint real do Better Auth. Remover uma sessão do banco a revoga nas
  próximas verificações. Não há tela administrativa de revogação ou MFA.
- Organizações implementam criar, listar e consultar com identidade da sessão,
  filtro organizacional e RLS habilitada. O navegador não escolhe o ator. Quem
  possuir a credencial `routepay_app` pode falsificar o contexto custom GUC;
  a identidade precisa continuar validada no servidor pela sessão Better Auth.
- Convites, administração de membros, transferência de propriedade, auditoria,
  reautenticação, MFA, quotas e paginação não fazem parte desta entrega.
- Não há conexão de carteiras, criação/aprovação de pagamentos, assinatura, envio
  blockchain, comprovantes ou auditoria operacional.
- Não há Neon, banco de produção, endpoints financeiros ou SDKs blockchain configurados.
- A integração MultiHopper permanece bloqueada até comprovar stablecoins/mints
  suportados, entrega do ativo original, recuperação de fundos e segurança do deployment.
- Os próximos módulos exigem autorização no servidor, isolamento por organização,
  idempotência, validação de valores e endereços e reconciliação on-chain.
- Não foram configurados ambientes de produção ou deploy.

Referências da fundação: [instalação Next.js](https://nextjs.org/docs/app/getting-started/installation),
[Tailwind com Next.js](https://tailwindcss.com/docs/installation/framework-guides/nextjs)
e [Vitest com Next.js](https://nextjs.org/docs/app/guides/testing/vitest).
