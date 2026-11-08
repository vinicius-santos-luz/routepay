# Fundação de autenticação local

Estado confirmado: Google OAuth, login e logout funcionando. As migrations
`0001_better_auth.sql` e `0002_organizations.sql` estão aplicadas nos dois clusters
PostgreSQL **18.6** locais no WSL:

| Ambiente        | Cluster            | Host/porta       | Banco          |
| --------------- | ------------------ | ---------------- | -------------- |
| Desenvolvimento | `18/main`          | `127.0.0.1:5432` | `routepay_dev` |
| Testes isolados | `18/routepay_test` | `127.0.0.1:5433` | `routepay_dev` |

A aplicação usa `routepay_app`; o proprietário e executor de migrations é
`routepay_migrator`. No desenvolvimento, `0002` foi aplicada em **08/11/2026** com
checksum SHA-256 `d2d720527711c52ec5ed23fbaba6876e6bf6cd822b8ee244c507f89f9bf253b0`.
Há sete tabelas, todas de propriedade de `routepay_migrator`, com RLS habilitada
nas duas tabelas empresariais, `organizations` e `organization_memberships`.

Foram aprovados **52 cenários reais de integração** no cluster isolado, incluindo
RLS, permissões, integridade, Unicode, rollback e concorrência. A organização
**RoutePay Desenvolvimento** foi criada pela interface no desenvolvimento,
registrada como `ACTIVE`, com um vínculo `OWNER ACTIVE`. Listagem, persistência
após atualização e página de detalhes funcionaram. O fluxo HTTP autenticado da
primeira organização foi validado manualmente, sem suíte HTTP automatizada.
Consulte [organizações](organizations.md) para o módulo empresarial; a migration
`0001` e a configuração Better Auth permanecem preservadas. O projeto não está
pronto para produção.

Better Auth **1.7.18** substitui Clerk e Auth.js. Usa-se o adapter PostgreSQL interno
via `pg` **8.23.1**, conforme [documentação oficial](https://better-auth.com/docs/adapters/postgresql).
O pacote instalado declara compatibilidade com Next.js 16, React 19 e Vitest 5;
o RoutePay mantém Next.js **16.4.5**, React **19.3.1**, TypeScript **6.0.3** estrito e Node 24.
Nenhum ORM, CLI de autenticação, plugin comercial ou serviço contratado foi adicionado.

## Organização e comportamento

- `src/server/auth/options.ts`: opções e mapeamentos de tabelas/campos.
- `src/server/auth/auth.ts`: instância lazy, protegida por `server-only`.
- `src/server/db/pool.ts`: pool pequeno, timeouts e `search_path=public` explícito.
- `src/app/api/auth/[...all]/route.ts`: handlers oficiais, runtime Node.js.
- `src/server/auth/session.ts`: leitura de sessão e guard de página no servidor.
- `src/modules/identity/presentation`: cliente de mesma origem, Google e logout.

A página institucional é pública. Login e dashboard são dinâmicos. Sem configuração
válida, `/login` desabilita o botão; o dashboard redireciona para
`/login?error=unavailable`; a API devolve 503 genérico com `Cache-Control: no-store`.
Sem sessão ou com sessão expirada/e-mail não verificado, o dashboard redireciona
para `/login`. Erros da biblioteca/banco não são enviados crus ao navegador.

Não há fallback em memória, JWT ou cookie para autorizar quando o banco falha.
O cache de sessão em cookie está desabilitado. `React.cache` apenas evita leituras
duplicadas na mesma renderização do servidor; não guarda sessões entre requisições.
Quando Google está configurado, o botão inicia OAuth real; a configuração do botão
não representa uma verificação de disponibilidade do banco. A operação ainda pode
falhar com indisponibilidade e não concede acesso ao dashboard nesse caso.

## Preparação local no WSL

1. Use Node 24 e npm 11; execute `npm ci` no RoutePay.
2. Copie `.env.example` para `.env.local`. Não versionar esse arquivo.
3. O desenvolvimento usa PostgreSQL **18.6**, cluster **18/main**, em
   `127.0.0.1:5432`, banco **routepay_dev**, proprietário **routepay_migrator** e
   usuário de aplicação **routepay_app**, já existentes. O cluster de testes
   **18/routepay_test** é separado, na porta **5433**, com os mesmos nomes de banco
   e papéis. Não confundir as portas nem reutilizar credenciais entre clusters.
4. Preencha `DATABASE_URL` no `.env.local` somente com `routepay_app` em `routepay_dev`.
   São aceitos apenas `localhost`, `127.0.0.1` e `::1`, sem query string ou fragmento.
   Senhas devem ser codificadas para URL; nunca registrar a URI completa ou reutilizar
   credenciais de outro projeto, incluindo Arkhe.
5. Configure `BETTER_AUTH_SECRET` próprio e aleatório, com pelo menos 32 caracteres,
   apenas no ambiente local da aplicação. Não existe segredo padrão.
6. Mantenha `BETTER_AUTH_URL=http://localhost:3000`. A origem do navegador precisa
   corresponder. A configuração Google já foi validada no desenvolvimento;
   para reproduzi-la em outro ambiente local, consulte a seção abaixo.
7. **MIGRATION_DATABASE_URL é exclusiva do executor**, sempre com `routepay_migrator`
   no mesmo `routepay_dev`. Mantenha essa variável vazia no exemplo copiado para o
   Next.js e forneça a credencial somente ao processo CLI. Prefira um subshell com
   entrada local oculta, sem colocar o valor no histórico do shell, nos argumentos
   da linha de comando, em logs ou em arquivos versionados. Não compartilhe segredos.
8. A CLI **não carrega nenhum arquivo dotenv**. Com a variável exclusiva fornecida,
   `npm run db:target` exibe somente host, porta, banco, usuário e nomes das migrations,
   sem abrir conexão ou executar SQL. Sua ausência produz erro explícito, mesmo que
   `DATABASE_URL` esteja configurada. A aplicação também rejeita o papel de migrator
   e não usa essa variável como fallback.
9. `0001` e `0002` já estão aplicadas nos dois clusters; não editar nem executar
   manualmente seus SQLs. Para futuras migrations revisadas e autorizadas,
   identifique primeiro o cluster/porta e mantenha `MIGRATION_DATABASE_URL`
   restrita ao processo CLI. O executor aplica somente migrations pendentes:

   ```bash
   npm run db:migrate -- --confirm-local=routepay_dev
   ```

10. Para executar somente a interface local: `npm run dev`.

O Next.js segue seu carregamento normal de arquivos de ambiente. Não exporte a
credencial do migrator no shell que inicia `next dev`, `next build` ou `next start`.
Nenhuma variável sensível recebe prefixo `NEXT_PUBLIC_`. A instância lazy não
executa migrations e a ausência da credencial correta mantém o acesso protegido negado.

## Schema mínimo e vínculo futuro com organizações

As tabelas ficam em `public`, com nomes explícitos para evitar palavras reservadas.
Os IDs são UUIDs gerados por `gen_random_uuid()`, sem extensão adicional em PostgreSQL 18.
Todos os instantes usam `timestamptz`. O SQL completo está em
[`0001_better_auth.sql`](../../db/migrations/0001_better_auth.sql).

| Tabela               | Colunas e propósito                                                                                                                                                                                                                                                                                                                             |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth_users`         | `id uuid PK`, `name text NOT NULL`, `email text NOT NULL UNIQUE`, `email_verified boolean NOT NULL DEFAULT false`, `image text NULL`, `created_at/updated_at timestamptz NOT NULL`. Identidade interna canônica.                                                                                                                                |
| `auth_sessions`      | `id uuid PK`, `user_id uuid FK NOT NULL`, `token text NOT NULL UNIQUE`, `expires_at timestamptz NOT NULL`, `ip_address/user_agent text NULL`, `created_at/updated_at timestamptz NOT NULL`. Sessão persistida, com `CHECK expires_at > created_at`.                                                                                             |
| `auth_accounts`      | `id uuid PK`, `user_id uuid FK NOT NULL`, `provider_id/account_id text NOT NULL`, `access_token/refresh_token/id_token/scope text NULL`, `access_token_expires_at/refresh_token_expires_at timestamptz NULL`, `password text NULL`, `created_at/updated_at timestamptz NOT NULL`. Identidade OAuth e tokens; `UNIQUE(provider_id, account_id)`. |
| `auth_verifications` | `id uuid PK`, `identifier/value text NOT NULL`, `expires_at timestamptz NOT NULL`, `created_at/updated_at timestamptz NOT NULL`. Estado temporário usado pelo Better Auth, incluindo OAuth em banco.                                                                                                                                            |

Há relação 1:N de usuário para sessões e contas, com FK `ON DELETE CASCADE`.
Exclusão de usuário pela API está desabilitada. `password` é campo do contrato
oficial do adapter, mas `CHECK (password IS NULL)` impede armazenar senhas;
cadastro e login por senha também estão desabilitados na configuração.
Índices adicionais: sessões por usuário/expiração, contas por usuário e
verificações por identificador/expiração. Constraints UNIQUE criam seus índices. Um índice único adicional em `lower(email)`
impede variantes de caixa por outros caminhos de escrita, mantendo o contrato oficial.

`auth_users.id` é a identidade de `organization_memberships.user_id`; um usuário
pode participar de N organizações. Não se duplica uma tabela `users` de
negócio nem se usa e-mail como identificador de permissão. Se um perfil de negócio
for necessário, ele poderá ter FK única para `auth_users.id`. Organizações,
memberships, papéis e RLS estão implementados na primeira entrega empresarial;
auditoria permanece pendente. Exclusões
e retenção de registros empresariais precisarão de política própria, sem propagar
o cascade das tabelas de autenticação para registros financeiros.

## Migrations versionadas

O executor Node usa somente `pg` e APIs nativas, sem CLI adicional. Não roda no
startup, build, instalação ou testes. Os arquivos SQL são numerados, ordenados,
com SHA-256 e finais de linha LF. Não editar migrations já aplicadas; criar o
próximo arquivo para cada evolução. Mudanças de versão ou plugins do Better Auth
exigem revisar o schema antes de atualizar o banco.

O executor exige confirmação explícita do nome, valida URL/role/banco local e
consulta banco, usuário de login, usuário efetivo, proprietário, porta, endereço
local e versão PostgreSQL 18+ antes de qualquer DDL. Então usa uma única
transação e advisory lock transacional para serializar execuções. A tabela técnica
`routepay_schema_migrations` guarda `name text PK`, `checksum text NOT NULL` e
`applied_at timestamptz NOT NULL DEFAULT now()`. Ela é adicional às quatro tabelas
do Better Auth. Reexecução pula migrations registradas; checksum divergente,
arquivo aplicado ausente ou versão retroativa abortam. Falhas provocam rollback.
Se o rollback também falhar, o erro original é preservado e o aviso secundário
não contém detalhes de conexão. Falha de comunicação durante `COMMIT` pode deixar
seu resultado desconhecido; verificar posteriormente o histórico antes de repetir.
O checksum detecta mudanças de arquivos, mas não substitui proteção de acesso ao histórico.

O runner inicial aceita apenas SQL transacional; operações como
`CREATE INDEX CONCURRENTLY` exigem uma estratégia futura específica.
Não há rollback destrutivo automático: corrigir com nova migration após revisão.
A CLI `auth migrate` não faz parte deste fluxo, evitando uma segunda fonte de
histórico. Os testes comparam o SQL ao `getSchema()` da versão instalada da biblioteca.
Esses testes simulados não substituem a validação em PostgreSQL real. Essa
validação ocorreu separadamente no cluster isolado, com as duas migrations
aplicadas e 52 cenários aprovados; veja o [procedimento de integração](../testing/organizations-integration.md).

## Permissões da migration 0001

A migration foi aplicada pelo responsável e não deve ser editada. O executor cria
o histórico antes de executar o arquivo SQL;
não aplicar esse arquivo isoladamente. Tabelas e grants ficam na mesma transação.

| Recurso                                                | `routepay_app`                         | `routepay_migrator`               |
| ------------------------------------------------------ | -------------------------------------- | --------------------------------- |
| Banco `routepay_dev`                                   | `CONNECT`, sem `CREATE` ou `TEMPORARY` | Proprietário confirmado; executor |
| Schema `public`                                        | `USAGE`, sem `CREATE`                  | Criação dos objetos locais        |
| `auth_users`                                           | `SELECT`, `INSERT`, `UPDATE`           | Proprietário                      |
| `auth_accounts`, `auth_sessions`, `auth_verifications` | `SELECT`, `INSERT`, `UPDATE`, `DELETE` | Proprietário                      |
| `routepay_schema_migrations`                           | Nenhum acesso direto                   | Histórico exclusivo do executor   |

Não há `GRANT ALL`, DDL, grant option ou privilégios sobre sequências para a aplicação.
`DELETE` em usuários continua negado, já que a API de exclusão está desabilitada.
A migration revoga concessões diretas/padrão sobre os cinco objetos para a aplicação
e `PUBLIC` antes dos grants explícitos. Revoga também criação de objetos em `public`
e criação de schemas/tabelas temporárias via banco, apenas no banco exclusivo RoutePay.

Um bloco de validação aborta a transação se privilégios efetivos herdados ainda
permitirem acesso ao histórico, DDL local, exclusão de usuários ou privilégios extras
nas tabelas. Também rejeita associação do app ao migrator e atributos administrativos
nos dois papéis (`SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION`, `BYPASSRLS`).
Não altera atributos ou memberships de papéis compartilhados pelo cluster. Se essa
checagem falhar, revisar a configuração em nova etapa autorizada; não ampliar grants.
As ACLs efetivas foram verificadas nos cenários reais do cluster isolado. No
desenvolvimento, o estado confirmado inclui propriedade das sete tabelas pelo
migrator e RLS habilitada nas duas tabelas empresariais; não se presume uma nova
execução dos 52 cenários nesse cluster.

## Sessão e segurança

- Sessões persistidas com prazo máximo de oito horas e renovação automática desativada.
- Cookies `HttpOnly`, `SameSite=Lax`, host-only; `Secure` quando a URL é HTTPS.
  HTTP é permitido somente para desenvolvimento local. Esta não é configuração de produção.
- Validação de origem/CSRF padrão da biblioteca preservada; `trustedOrigins`
  contém somente a origem local configurada. Sem liberação de origem por wildcard.
- Google solicita apenas `openid`, `email` e `profile`, com `accessType=online`;
  não se solicita acesso offline. `encryptOAuthTokens` está habilitado para a
  proteção suportada pela biblioteca, mas não substitui proteger o banco e o segredo.
- Vinculação automática de contas desabilitada; e-mail não é prova de membership.
- Logout usa o endpoint real e, após resposta bem-sucedida, consulta novamente a
  sessão com os cookies originais. Se ela ainda existir ou a leitura falhar, o
  RoutePay devolve 503 e não confirma saída nem repassa cookies de sucesso.
  Isso cobre a supressão de erros de exclusão pelo handler nativo. Deletar a sessão no
  banco a revoga na próxima leitura; não há painel administrativo de revogação.
- Limite básico de requisições em memória (30/60s, com regras específicas da
  biblioteca); não é um limitador distribuído. Telemetria da biblioteca desabilitada.

Autenticação não substitui autorização. Cada futura API/Server Action empresarial
deverá conferir sessão, membership ativa, organização do recurso e permissão no
servidor. A proteção de layout, sozinha, não protege endpoints. Não há MFA ou
step-up implementado; nenhuma ação financeira está habilitada.

O contexto custom GUC usado pelo módulo empresarial não autentica usuários.
Quem possuir a credencial `routepay_app` pode falsificar esse contexto. A identidade
deve continuar sendo validada no servidor pela sessão Better Auth antes de definir
o contexto; RLS não substitui essa validação nem protege contra credencial app comprometida.

Sessões, tokens e verificações contêm dados sensíveis. Não expor essas tabelas por
APIs genéricas. A expiração é validada na leitura; limpeza periódica de registros
expirados, auditoria operacional e procedimentos de rotação/revogação administrativa
ficam para a próxima etapa de persistência e operação.

## Tokens e minimização de dados

O login Google usa o código OAuth e PKCE transitoriamente. O ID token é necessário
para validar a identidade e obter o perfil no fluxo implementado pela biblioteca;
isso não torna sua persistência necessária para validar as sessões locais futuras.
A sessão do RoutePay é própria e persistida em `auth_sessions`.

| Dado                     | Necessidade e persistência atual                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Access token Google      | Emitido na troca OAuth; permite acesso aos escopos concedidos. O MVP não consulta APIs Google após o login. A biblioteca o persiste cifrado com `encryptOAuthTokens: true`; retenção contínua pode ser evitada por uma política futura compatível e testada. |
| Refresh token Google     | Serve para renovar acesso ao provedor. Não é necessário às sessões locais do MVP. `accessType=online` não solicita acesso offline; se algum fluxo entregar refresh token, a biblioteca pode armazená-lo cifrado.                                             |
| ID token Google          | JWT assinado para identidade, não cifrado por natureza. Better Auth 1.7.18 persiste `id_token` sem aplicar a opção de cifra acima. Pode conter dados pessoais; não é exigido para consultar a sessão local.                                                  |
| Token de sessão RoutePay | Necessário ao contrato atual da biblioteca. Armazenado como texto no banco; o cookie é assinado. Não substituir a coluna por hash sem adapter compatível.                                                                                                    |
| Verificações OAuth       | Estado temporário, incluindo PKCE, persistido como JSON textual em `value`, com prazo de expiração e cookie de estado assinado. Não é abrangido por `encryptOAuthTokens`.                                                                                    |

Esta correção mantém campos e comportamento oficiais: não remove tokens por hooks,
não troca tipos nem aplica cifra incompatível ao ID token. Uma etapa futura de
minimização de dados deve decidir a retenção mínima e testar uma política de descarte usando
extensões oficialmente suportadas, sem comprometer login, logout ou atualização de conta.
Manter banco, backups e segredo protegidos, não expor essas tabelas por APIs genéricas
nem registrar tokens em logs. Limpeza periódica de dados expirados segue pendente.

Evidência na dependência instalada: `better-auth/dist/oauth2/link-account.mjs`
chama `setTokenUtil` para access/refresh tokens e copia `idToken` diretamente;
`better-auth/dist/state.mjs` serializa o estado no banco. Compare novamente em upgrades.
A referência de configuração é [account.encryptOAuthTokens](https://better-auth.com/docs/reference/options).

## Configuração local do Google

Google já foi configurado e login/logout foram validados manualmente no
desenvolvimento. Para reproduzir a configuração local, sem criar serviços
automaticamente:

1. O responsável cria ou escolhe um projeto exclusivo do RoutePay no Google Cloud
   e configura a tela de consentimento OAuth. Nenhum projeto foi criado automaticamente.
2. Configura um OAuth Client ID do tipo **Web application**, com origem
   `http://localhost:3000` e URI de redirecionamento exatamente
   `http://localhost:3000/api/auth/callback/google`.
3. Se o consentimento estiver em modo de teste, inclui explicitamente os usuários
   de teste autorizados. Mantém apenas os escopos básicos de identidade.
4. Preenche `GOOGLE_CLIENT_ID` e `GOOGLE_CLIENT_SECRET` no `.env.local` exclusivo do
   RoutePay e reinicia o servidor. Nenhuma variável sensível usa prefixo `NEXT_PUBLIC_`.
5. Em novas validações, conferir login, criação única do usuário/conta, sessão no banco, dashboard,
   logout, expiração, revogação e indisponibilidade do PostgreSQL. Verifica também
   múltiplas abas e tentativa de replay do callback OAuth.

O callback e a configuração seguem o [provider Google oficial do Better Auth](https://better-auth.com/docs/authentication/google)
e o [fluxo OAuth web do Google](https://developers.google.com/identity/protocols/oauth2/web-server).
Não há assinatura de autenticação, APIs Google pagas, conta Neon ou hospedagem
contratada neste fluxo local. Hospedagem, banco gerenciado ou serviços opcionais
futuros devem ser avaliados e aprovados separadamente, respeitando orçamento zero.

## Verificações

`npm run check` cobre formatação, ESLint, TypeScript e testes unitários/handlers.
`npm run build` produz o bundle sem credenciais ou conexões de banco. Os testes usam
valores sintéticos e driver bloqueado antes de abrir sockets, nunca credenciais reais.
Separadamente, 52 cenários reais de integração PostgreSQL foram aprovados no
cluster `18/routepay_test:5433`, com `0001` e `0002` aplicadas. O desenvolvimento
também possui as duas migrations aplicadas. Login/logout Google e o fluxo HTTP
autenticado da primeira organização foram validados manualmente; não foi executada
suíte HTTP automatizada. Administração de membros, convites, auditoria e operações
financeiras continuam pendentes. Essas evidências não qualificam a aplicação para produção.

Referências oficiais: [instalação](https://better-auth.com/docs/installation),
[Next.js](https://better-auth.com/docs/integrations/next),
[schema/adapter](https://better-auth.com/docs/concepts/database),
[sessões](https://better-auth.com/docs/concepts/session-management),
[opções](https://better-auth.com/docs/reference/options),
[UUID no PostgreSQL](https://www.postgresql.org/docs/current/functions-uuid.html)
e [locks transacionais](https://www.postgresql.org/docs/current/explicit-locking.html#ADVISORY-LOCKS).

Referências para ACLs: [GRANT](https://www.postgresql.org/docs/18/sql-grant.html),
[consulta de privilégios efetivos](https://www.postgresql.org/docs/18/functions-info.html)
e [herança de papéis](https://www.postgresql.org/docs/18/role-membership.html).
