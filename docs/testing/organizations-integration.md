# Integração PostgreSQL de organizações

Executor real, separado dos testes unitários e restrito a
`127.0.0.1:5433/routepay_dev`, cluster `18/routepay_test`. Não executa migrations,
não aceita outra URL e não lê arquivos dotenv. Não usa o pool/configuração do
Next.js. Reutiliza os casos de uso, repositório e wrapper transacional reais.
O leitor de identidade é uma fixture: Google OAuth e autenticação HTTP não são
simulados como se tivessem sido testados.

## Execução protegida

Node 24 e dependências já instaladas são suficientes. Nenhum serviço novo:

```bash
env -i PATH="$PATH" node --experimental-transform-types --conditions=react-server scripts/test-organizations.mts --listen
```

Em outro terminal WSL, no mesmo repositório:

```bash
env -i PATH="$PATH" node --experimental-transform-types --conditions=react-server scripts/test-organizations.mts --provide-credentials
```

O segundo comando solicita senhas EXCLUSIVAS dos dois usuários do cluster de
testes em prompts sem eco ou histórico. Não fornecer senhas pelo chat, argumentos,
variáveis de ambiente ou arquivos. Não reutilizar senhas do ambiente principal.
O programa não compara senhas com produção: essa separação é responsabilidade de
quem fornece as credenciais.

As senhas trafegam apenas por socket Unix local em diretório privado 0700, socket
0600, mesmo UID, permanecendo em memória; não são gravadas em arquivos de dados
ou logs. Strings JavaScript não oferecem garantia de limpeza física da memória.
O canal fecha ao receber o par. O socket é removido pelo servidor ao fechar.
Uma espera sem credenciais expira após 15 minutos e não abre conexão PostgreSQL.

Antes de cada checkout, o executor confere banco, endereço, porta, versão 18+,
cluster, papel efetivo/login, proprietário, UTF-8, string literals e atributos de
role. Antes das primeiras escritas, verifica também histórico/checksums, sete
tabelas, RLS e privilégios. Qualquer divergência interrompe os cenários dependentes.
Não existe fallback para porta 5432 ou credenciais de outro ambiente.

`--self-check` carrega os módulos sem solicitar credenciais ou conectar ao banco.
As flags Node habilitam transformação TypeScript e o contexto oficial server-only;
o hook de resolução vale apenas para o processo de testes, sem modificar produção.

## Cenários e persistência

São verificadas identidades fictícias, criação/atomicidade, isolamento Alfa/Beta,
IDOR, contextos ausentes/inválidos, seis operações DML negadas, histórico restrito,
constraints, timestamps/versões, Unicode real, rollback, locks, timeout, deadlock,
último OWNER concorrente e reutilização real de conexão após commit/rollback.

Os dados são sempre identificados por UUIDs aleatórios da execução; nenhuma conta
Google real ou dado pessoal é consultado. Os e-mails fictícios usam `example.invalid`.
Dois usuários e Alfa/Beta precisam ser commitados para visibilidade entre conexões.
Os demais cenários usam rollback, exceto a preparação/restauração do teste de
proprietários concorrentes. Esse teste deixa um terceiro vínculo com estado REMOVED.
Os triggers proíbem exclusão física; não se tenta desabilitá-los ou apagar os dados.

Em execução concluída normalmente, permanecem duas identidades, duas organizações
e três memberships (duas ativas, uma removida). Se houver falha, o relatório tenta
listar o estado real de TODOS os registros ligados aos UUIDs fictícios da execução,
incluindo resultados de commit incerto. Não há cleanup destrutivo automático.

O relatório sanitizado fica em `test-results/org-integration/report-<runId>.json`, ignorado
pelo Git, e é exibido ao executor. Contém identidade do alvo, nomes dos cenários,
status, SQLSTATEs, evidências e dados fictícios restantes. Nunca contém senhas,
URLs autenticadas, mensagens cruas de driver ou tokens.

Custom GUC continua não sendo prova criptográfica: o teste demonstra que a mesma
role pode selecionar o UUID de outra fixture. Isso é limite esperado do modelo;
não se considera uma sessão Google autenticada nem uma falha de RLS isoladamente.

Nenhum resultado real deve ser aprovado com base apenas nos testes unitários de
barreira, no `--self-check` ou em análise estática. A conclusão depende do relatório
de uma execução conectada ao PostgreSQL autorizado.
