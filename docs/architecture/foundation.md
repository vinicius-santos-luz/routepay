# Fundação do monólito modular

O monólito implementa apresentação, ferramentas locais, autenticação Better Auth
com PostgreSQL e a primeira entrega de organizações: criar, listar e consultar com
autorização no servidor. Não implementa regras financeiras ou administração de membros.
Veja [autenticação](authentication.md) para configuração e limites atuais.

## Direção de dependências

- `app`: composição de páginas/layouts. Futuramente, handlers delegam aos casos de uso.
- `components`: apresentação compartilhada, sem acesso a dados ou segredos.
- `modules/<nome>/presentation`: interfaces específicas de cada módulo.
- `modules/<nome>/application`: casos de uso e contratos de infraestrutura.
- `modules/<nome>/domain`: regras puras, sem React, Next.js ou SDK externo.
- `modules/<nome>/infrastructure`: implementações de persistência e serviços.
- `integrations`: futuros adaptadores de fornecedores, isolados do domínio.
- `server`: infraestrutura restrita ao servidor; configuração usa `server-only`.
- `shared`: utilitários puros que não acessam segredos ou serviços externos.

As páginas usam Server Components. O login/logout são Client Components que usam
os handlers oficiais do Better Auth; segredos e pool ficam em `server`. A criação
de sessões depende de OAuth real e PostgreSQL; não existe login fictício.

## Responsabilidades futuras

| Módulo           | Responsabilidade prevista                                       |
| ---------------- | --------------------------------------------------------------- |
| `identity`       | Apresentação do login e logout; infraestrutura em `server/auth` |
| `organizations`  | Organizações, vínculos e administração                          |
| `counterparties` | Fornecedores e destinatários versionados                        |
| `wallets`        | Vínculo público e prova de posse de carteiras                   |
| `payments`       | Intenções, versões e aprovações                                 |
| `reconciliation` | Verificação de execução e tratamento de divergências            |
| `receipts`       | Comprovantes baseados em evidência de liquidação                |
| `audit`          | Registro de ações e alterações relevantes                       |

As pastas `.gitkeep` são reservas. O módulo `organizations` agora possui domínio,
aplicação, infraestrutura e apresentação; memberships referenciam o UUID de
`auth_users`, nunca e-mail ou ID Google como chave de autorização.
Veja [organizações](organizations.md) para modelo, permissões, limites de RLS e
validações realizadas. `0001` foi aplicada pelo responsável. A migration
`0002_organizations.sql` foi aplicada no cluster isolado `18/routepay_test`, porta
`5433`, e passou em **52 cenários reais de integração**. Posteriormente, foi
aplicada no cluster de desenvolvimento `18/main`, porta `5432`, banco
`routepay_dev`, em **08/11/2026**, com checksum SHA-256
`d2d720527711c52ec5ed23fbaba6876e6bf6cd822b8ee244c507f89f9bf253b0`.

No desenvolvimento, a organização **RoutePay Desenvolvimento** foi criada com um
OWNER ativo. Listagem, atualização da página e consulta dos detalhes funcionaram
na validação manual do fluxo autenticado. A aplicação ainda não está pronta para
produção.

## Limites desta etapa

O dashboard exige sessão no servidor tanto na página quanto no layout. Ausência de
configuração, expiração, e-mail não verificado ou falha do banco negam acesso. As
APIs e Server Actions devem validar sessão e autorização em cada operação;
o layout não deve ser sua única proteção. `noindex` não é controle de acesso.

O ambiente aceita apenas `local` e `test`; isso não impede alguém de hospedar o
código e não é um mecanismo de autorização. A integração PostgreSQL aceita somente
`routepay_dev` em loopback, com `routepay_app` na aplicação e
`routepay_migrator` somente no executor; suas credenciais são separadas. Não há configuração de produção.

Não copiar exemplos MultiHopper de assinatura em servidor. Sua integração segue
bloqueada para suporte a stablecoins, liquidação, recuperação e segurança do
deployment. Nenhuma pasta reservada de integração contém cliente ou credencial.

## Compatibilidade das ferramentas

ESLint 9 foi mantido porque os plugins React, import e acessibilidade usados pelo
`eslint-config-next` ainda declaram suporte até essa versão principal. Atualizar
para ESLint 10 exige revisar esses peers; não usar `--force` ou `--legacy-peer-deps`.

O override transitivo de `@typescript-eslint/typescript-estree > minimatch` fixa
11.0.1 para corrigir [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249).
É uma atualização de major restrita à ferramenta de lint, validada pelos checks.
Reavaliar e remover o override quando o pacote pai adotar a versão corrigida.
