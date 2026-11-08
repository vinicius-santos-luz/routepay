# Organizações — primeira entrega

Esta entrega implementa somente criar, listar e consultar organizações, com
Google OAuth e sessão Better Auth. Não executa migrations na inicialização.
O arquivo `0001` e as tabelas Better Auth permanecem preservados.

Estado confirmado dos clusters PostgreSQL **18.6** locais no WSL:

| Ambiente        | Cluster            | Host/porta       | Banco          | Migrations aplicadas |
| --------------- | ------------------ | ---------------- | -------------- | -------------------- |
| Desenvolvimento | `18/main`          | `127.0.0.1:5432` | `routepay_dev` | `0001` e `0002`      |
| Testes isolados | `18/routepay_test` | `127.0.0.1:5433` | `routepay_dev` | `0001` e `0002`      |

A migration `0002_organizations.sql` foi aplicada no desenvolvimento em
**08/11/2026**, com checksum SHA-256
`d2d720527711c52ec5ed23fbaba6876e6bf6cd822b8ee244c507f89f9bf253b0`.
As sete tabelas do banco de desenvolvimento pertencem a `routepay_migrator`;
RLS está habilitada em `organizations` e `organization_memberships`.
A aplicação utiliza somente `routepay_app`.

A organização **RoutePay Desenvolvimento** foi criada pela interface como
`ACTIVE`, com um vínculo `OWNER ACTIVE`. Listagem, persistência após atualização
e página de detalhes funcionaram. O fluxo HTTP autenticado da primeira organização
foi validado manualmente; não foi executada uma suíte HTTP automatizada.
No cluster isolado, foram aprovados **52 cenários reais de integração**, incluindo
RLS, permissões, integridade, Unicode, rollback e concorrência. Esses resultados
não tornam a aplicação pronta para produção.

## Camadas e entradas

- `organizations/domain`: UUID, nome, estados, invariantes, transições puras,
  matriz de permissões e erros tipados; sem Next.js ou driver.
- `organizations/application`: três casos de uso, contrato de repositório e
  contexto de ator criado por um leitor confiável de sessão.
- `organizations/infrastructure`: SQL parametrizado, filtro de usuário/organização
  e projeção mínima; módulo `server-only`.
- `organizations/presentation`: formulário com Server Action, mensagens e rótulos.
- `server/authorization/organizations.ts`: composição com `getSessionState()`;
  nenhuma identidade é recebida do navegador. Configuração/pool são avaliados
  somente após autenticação.
- `server/db/organization-transaction.ts`: reserva e liberação de um PoolClient,
  transação e contexto local. Nenhuma nova dependência ou pool foi adicionado.

Rotas:

| Rota                                        | Comportamento                                          |
| ------------------------------------------- | ------------------------------------------------------ |
| `/dashboard/organizations`                  | Lista vínculos autorizados e permite criar organização |
| `/dashboard/organizations/[organizationId]` | Consulta dados básicos autorizados                     |

Cada página valida sessão. A Server Action chama o caso de uso que também valida
sessão, sem depender do layout. Entradas extra de usuário/papel são ignoradas;
somente o nome é encaminhado à criação. As proteções de origem nativas das Server
Actions são preservadas. Erros de banco/configuração são sanitizados; falhas não
produzem listas fictícias. ID inválido, organização inexistente e acesso negado
resultam em 404 na página de detalhes. Os DTOs não contêm e-mail, token ou outros membros.

## Modelo relacional

`auth_users` 1:N `organization_memberships` N:1 `organizations`.
`auth_users` também é referenciada pelo criador histórico da organização.

| Tabela                     | Colunas                                                                                                                                                                                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `organizations`            | `id uuid PK DEFAULT gen_random_uuid()`, `name text NOT NULL`, `status text NOT NULL DEFAULT 'ACTIVE'`, `created_by_user_id uuid NOT NULL FK auth_users`, `created_at/updated_at timestamptz NOT NULL DEFAULT now()`, `deactivated_at timestamptz NULL`, `lock_version bigint NOT NULL DEFAULT 1`                               |
| `organization_memberships` | `id uuid PK DEFAULT gen_random_uuid()`, `organization_id uuid NOT NULL FK organizations`, `user_id uuid NOT NULL FK auth_users`, `role text NOT NULL`, `status text NOT NULL DEFAULT 'ACTIVE'`, `created_at/updated_at timestamptz NOT NULL DEFAULT now()`, `removed_at timestamptz NULL`, `version bigint NOT NULL DEFAULT 1` |

Regras:

- Organização: `ACTIVE` ou `INACTIVE`; data de desativação presente somente em
  `INACTIVE`; nome entre 1 e 120 pontos de código Unicode após `trim()` ECMAScript,
  sem normalização NFC. A interface usa o validador do domínio e validade nativa
  customizada; não usa `maxLength`, que contaria unidades UTF-16. Servidor sempre
  revalida. O SQL usa `char_length`, o mesmo conjunto explícito de espaços nas
  extremidades e faixas Cc/Cf Unicode 17.0 com collation C, tanto no CHECK quanto
  na função de criação. NUL e surrogates isolados são rejeitados no domínio e não
  são representáveis em texto PostgreSQL UTF-8. Um emoji simples pode contar um
  ponto; acentos combinados contam vários. Sequências com ZWJ são rejeitadas como
  formatação Cf, preservando a política anterior. Testes comparam todas as faixas
  Unicode em memória; os cenários Unicode também foram validados em PostgreSQL
  UTF-8 no cluster isolado.
- Vínculo: papel `OWNER`, `ADMIN` ou `OPERATOR`; estado `ACTIVE`, `SUSPENDED` ou
  `REMOVED`; `removed_at` presente somente em `REMOVED`.
- UNIQUE `(organization_id, user_id)` para todos os estados e toda a vida do vínculo.
- FKs `ON UPDATE RESTRICT ON DELETE RESTRICT`; nenhuma cascata adicionada.
- UUID, referências de identidade e `created_at` são imutáveis em atualizações.
- Triggers impedem DELETE físico das duas tabelas e atualizam timestamps/versões.
- Índices de PK/UNIQUE, criador, `(user_id, organization_id)` e proprietários ativos.
  O índice de proprietários não é único: múltiplos OWNERs são permitidos.
- Versões bigint são expostas como strings, evitando perda de precisão JavaScript.

Estado das transições puras, sem endpoints de alteração nesta entrega:

| Entidade    | Transições                                                                     |
| ----------- | ------------------------------------------------------------------------------ |
| Organização | `ACTIVE ↔ INACTIVE`; reativação exige novamente o invariante de proprietário   |
| Membership  | `ACTIVE → SUSPENDED/REMOVED`; `SUSPENDED → ACTIVE/REMOVED`; `REMOVED → ACTIVE` |

Readmissão reutilizará o mesmo vínculo, mediante autorização futura. Repetições de
estado não constituem transições. `created_by_user_id` não concede acesso permanente.

## Matriz de autorização

| Ação                          | OWNER                           | ADMIN | OPERATOR | Exposta agora |
| ----------------------------- | ------------------------------- | ----- | -------- | ------------- |
| Consultar organização ativa   | Sim                             | Sim   | Sim      | Sim           |
| Consultar organização inativa | Sim                             | Não   | Não      | Sim           |
| Atualizar dados permitidos    | Sim                             | Sim   | Não      | Não           |
| Listar membros                | Sim                             | Sim   | Não      | Não           |
| Administrar OPERATOR          | Sim                             | Sim   | Não      | Não           |
| Administrar ADMIN             | Sim                             | Não   | Não      | Não           |
| Administrar propriedade       | Sim, fluxo específico           | Não   | Não      | Não           |
| Desativar/reativar            | Sim                             | Não   | Não      | Não           |
| Sair                          | Somente preservando outro OWNER | Sim   | Sim      | Não           |

Todos exigem vínculo ativo e sessão válida. A matriz é um limite de autorização,
não um executor de ações nem substituto das regras do alvo/último OWNER. Não há
permissões financeiras. Qualquer usuário autenticado pode criar uma organização,
tornando-se seu OWNER inicial; não pode indicar outro proprietário na criação.

## Integridade e concorrência

`routepay_create_organization(text)` obtém o ator do contexto, verifica sua
existência e e-mail verificado, insere organização e membership OWNER. Ambos e a
consulta de retorno pertencem à mesma transação; uma falha reverte a operação.

Toda escrita de membership atualiza a linha pai e sua versão antes de ser
concluída. Isso serializa modificações de uma mesma organização e impede write
skew sem depender apenas de contar proprietários previamente. Constraint triggers
`AFTER ROW DEFERRABLE INITIALLY DEFERRED` nas duas tabelas verificam o estado final:
uma organização ativa deve ter ao menos um OWNER ativo. Suspender/rebaixar o
último proprietário também é coberto, não apenas remoção.

O caminho da aplicação usa `READ COMMITTED`. A atualização real da linha pai
também força conflitos de escrita com snapshots antigos em outros níveis.
Futuras rotinas administrativas deverão bloquear a organização **antes** dos
vínculos, revalidar permissões após o bloqueio e receber versões esperadas.
Para várias organizações, adquirir os locks dos pais em ordem de UUID e, depois,
os dos vínculos também em ordem de UUID. A criação atual já possui sua nova linha
pai antes da inserção do primeiro vínculo; listar/consultar não adquirem locks de
escrita. Não foi identificado defeito atual que exija mudar essa ordem. Não foram
adicionados casos de uso administrativos nem removidos triggers. O trigger de
membership executa depois da aquisição do lock da linha alvo em UPDATE e não
substitui a disciplina de locks dos futuros chamadores.
SQL administrativo que adquira locks em ordem inversa pode gerar deadlock;
o PostgreSQL deve abortar uma transação, nunca aceitar estado sem proprietário.

Não há retry automático. Uma falha de comunicação no COMMIT pode deixar resultado
incerto: conferir a listagem antes de repetir criação. Esta entrega não oferece
idempotência de criação nem unicidade por nome.

## RLS e modelo de confiança

RLS é ativado somente nas duas novas tabelas. Memberships permitem leitura do
próprio vínculo ativo. Organizações exigem membership ativa, sendo a organização
inativa visível apenas para OWNER. A política de membership não consulta a própria
tabela e não recursa. Além de RLS, as consultas filtram o usuário e, nos detalhes,
o UUID da organização; o resultado passa por nova verificação de domínio.

O servidor autentica com Better Auth e estabelece `routepay.user_id` por
`set_config(..., true)` após BEGIN. Todo o trabalho usa o mesmo PoolClient.
Commit/rollback encerram o contexto local; RESET remove valores anteriores de
sessão antes da devolução ao pool. Falha de rollback, limpeza, BEGIN ou resultado
incerto de COMMIT causa descarte do cliente. Não há contexto em globais nem cache
de memberships. O cache React já existente limita-se à leitura de sessão na
renderização/requisição; não armazena permissões empresariais.

Durante a reserva, um listener `error` do próprio wrapper marca a conexão perdida,
interrompe a espera da operação com erro de domínio sanitizado e força descarte.
Consultas/commit deixam de ser iniciados pelo wrapper após essa perda; não se
promete rollback numa conexão perdida. O callback pode já ter trabalho pendente,
e não existe cancelamento/reexecução automático da operação. Enquanto a conexão
permanece utilizável, falhas continuam provocando tentativa de rollback, preservando
o erro original. O listener é removido apenas depois da entrega ao listener ocioso
do pool, sem remover listeners de outros componentes. Se o COMMIT já foi confirmado
antes de uma falha na limpeza, seu sucesso é preservado e o cliente é descartado;
uma perda durante o COMMIT mantém resultado incerto e devolve indisponibilidade.

**A configuração customizada não autentica usuários.** Um atacante com SQL
arbitrário ou a credencial `routepay_app` pode falsificar o UUID do contexto.
RLS contém consultas inadvertidamente sem filtro; não elimina SQL injection nem
comprometimento do servidor. O navegador nunca fornece esse UUID ao caso de uso.

`routepay_app` não é owner nem BYPASSRLS. Não se usa FORCE RLS neste desenho:
triggers de integridade e criação executam como proprietário e precisam consultar
o conjunto completo. As funções definer têm operações específicas, referências
qualificadas, `search_path=pg_catalog,pg_temp`, sem SQL dinâmico, sem argumento de
ator e sem EXECUTE para PUBLIC. A função de criação verifica autorização própria.
O proprietário administrativo do banco continua sendo uma identidade confiável.

Privilégios novos:

| Objeto                               | routepay_app                                     |
| ------------------------------------ | ------------------------------------------------ |
| Duas tabelas empresariais            | SELECT sujeito a RLS                             |
| `routepay_current_actor()`           | EXECUTE; valida contexto e identidade persistida |
| `routepay_create_organization(text)` | EXECUTE; única mutação exposta                   |
| Funções de triggers                  | Sem EXECUTE direto                               |
| Histórico de migrations              | Nenhum acesso                                    |

Não se concedem INSERT/UPDATE/DELETE/TRUNCATE, DDL, GRANT OPTION, papéis ou
privilégios de bypass ao app. A migration rejeita privilégios efetivos herdados
incompatíveis. As ACLs Better Auth e a política de bancos autorizados não mudam.
As tabelas de identidade globais continuam acessíveis ao adapter conforme `0001`;
não se disponibiliza busca global de usuários no módulo.

## Validação realizada e evolução futura

As migrations `0001` e `0002` foram aplicadas no cluster isolado
`18/routepay_test`, porta `5433`. Os **52 cenários reais aprovados** cobrem RLS,
permissões efetivas, integridade, Unicode, rollback, limpeza/reutilização de
conexões e concorrência. Incluem a proteção do último OWNER e demonstram o limite
de confiança do contexto custom GUC. Consulte o
[procedimento de integração](../testing/organizations-integration.md) para o
executor separado e seus limites; `npm test` não executa esses cenários.

O desenvolvimento `18/main`, porta `5432`, também possui ambas as migrations,
com `0002` aplicada em 08/11/2026. A criação, listagem, persistência após atualização
e consulta da organização RoutePay Desenvolvimento foram validadas manualmente
com sessão autenticada. Esse fluxo manual não equivale a uma suíte HTTP automatizada
nem à repetição dos 52 cenários no banco de desenvolvimento.

Para próximas evoluções:

1. Preservar `0001` e `0002`, incluindo seus checksums; criar nova migration
   versionada para alterações. Não reaplicar os arquivos SQL manualmente.
2. Revisar o modelo de confiança e validar a nova migration primeiro no cluster
   isolado autorizado, com dados fictícios, PostgreSQL UTF-8 e
   `standard_conforming_strings=on`. Não ampliar a política para bancos arbitrários.
3. Repetir os testes relevantes de ACLs, RLS, integridade, Unicode e concorrência,
   inclusive ordem de locks e proteção do último OWNER. Preservar a validação de
   identidade no servidor antes de estabelecer o contexto PostgreSQL.
4. Ampliar a validação HTTP e de acessibilidade em etapa própria. A validação manual
   atual da primeira organização não cobre todos os fluxos, larguras ou tecnologias assistivas.
5. Somente com autorização separada, identificar cluster/porta, banco e migrator
   antes de executar novas migrations. Fornecer `MIGRATION_DATABASE_URL` apenas à
   CLI, sem histórico ou logs de segredos. `npm run db:target` é inspeção sem conexão.
6. O executor `npm run db:migrate -- --confirm-local=routepay_dev` verifica alvo
   real, checksum, ordem, lock e histórico e aplica apenas migrations pendentes
   numa transação. A CLI não carrega `.env.local`. Após erro de COMMIT, conferir
   histórico antes de repetir e verificar os privilégios efetivos após a evolução.

## Verificações e limites

Os testes unitários usam objetos de sessão e conexões simulados, sem sockets.
Cobrem domínio, acesso negado, sessão revogada, contexto por cliente, SQL
parametrizado, rollback, limpeza, commit incerto, DTO mínimo, fronteira da ação e
composição com a sessão do servidor. Testes estruturais inspecionam SQL, grants,
triggers, RLS e checksum de `0001`; não executam a migration.

**Esses testes simulados não comprovam SQL executável, RLS real, integridade sob
concorrência no PostgreSQL nem login ponta a ponta.** Os 52 cenários reais do
cluster isolado são evidência separada da suíte unitária; o fluxo HTTP autenticado
da primeira organização foi validado manualmente, sem suíte HTTP automatizada.
Build/testes de qualidade são feitos em uma cópia
temporária no repositório, sem dotenv e com ambiente de processo limpo, evitando
ler credenciais ou `.env.local`.

Pendências: suíte HTTP automatizada, ampliação da revisão de acessibilidade, convites e aceite,
limites de criação/paginação, administração de membros, revogação administrativa,
reautenticação, MFA, política de retenção e auditoria transacional de alterações.
Remoção lógica não mantém sozinha todas as versões históricas: auditoria deve
preceder a disponibilização das futuras operações administrativas.

Não há novos serviços, custos obrigatórios, dependências, integrações financeiras,
carteiras, pagamentos ou alterações da autenticação. Não há prontidão para produção.

Referências: [RLS PostgreSQL 18](https://www.postgresql.org/docs/18/ddl-rowsecurity.html),
[constraint triggers](https://www.postgresql.org/docs/18/sql-createtrigger.html),
[funções definer](https://www.postgresql.org/docs/18/sql-createfunction.html),
[contexto transacional](https://www.postgresql.org/docs/18/functions-admin.html),
[strings e contagem de caracteres](https://www.postgresql.org/docs/18/functions-string.html),
[literais Unicode](https://www.postgresql.org/docs/18/sql-syntax-lexical.html#SQL-SYNTAX-STRINGS-UESCAPE),
[transações pg](https://node-postgres.com/features/transactions).
