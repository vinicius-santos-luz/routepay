# Fundação do monólito modular

Esta etapa implementa apresentação e ferramentas locais. Não implementa regras
financeiras, identidades, autorização ou integrações externas.

## Direção de dependências

- `app`: composição de páginas/layouts. Futuramente, handlers delegam aos casos de uso.
- `components`: apresentação compartilhada, sem acesso a dados ou segredos.
- `modules/<nome>/presentation`: interfaces específicas de cada módulo.
- `modules/<nome>/application`: futuros casos de uso e contratos de infraestrutura.
- `modules/<nome>/domain`: futuras regras puras, sem React, Next.js ou SDK externo.
- `modules/<nome>/infrastructure`: futuras implementações de persistência e serviços.
- `integrations`: futuros adaptadores de fornecedores, isolados do domínio.
- `server`: infraestrutura restrita ao servidor; configuração usa `server-only`.
- `shared`: utilitários puros que não acessam segredos ou serviços externos.

As rotas atuais são Server Components. Não existem endpoints de mutação, login
fictício, estado de sessão, acesso a banco ou assinatura de carteira.

## Responsabilidades futuras

| Módulo           | Responsabilidade prevista                            |
| ---------------- | ---------------------------------------------------- |
| `identity`       | Integração com autenticação real e sessões           |
| `organizations`  | Organizações, vínculos e administração               |
| `counterparties` | Fornecedores e destinatários versionados             |
| `wallets`        | Vínculo público e prova de posse de carteiras        |
| `payments`       | Intenções, versões e aprovações                      |
| `reconciliation` | Verificação de execução e tratamento de divergências |
| `receipts`       | Comprovantes baseados em evidência de liquidação     |
| `audit`          | Registro de ações e alterações relevantes            |

Essas responsabilidades são planejamento; as pastas `.gitkeep` são reservas.
O único componente específico de módulo é a apresentação estática da visão geral
em `organizations/presentation`.

## Limites desta etapa

O layout administrativo é uma prévia pública. A indicação `noindex` ajuda a
evitar indexação, mas não constitui controle de acesso. Antes de dados reais,
implementar e testar sessão, autorização no servidor e isolamento por organização.

O ambiente aceita apenas `local` e `test`; isso não impede alguém de hospedar o
código e não é um mecanismo de autorização. Nenhuma configuração conecta redes,
habilita transações ou protege rotas.

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
