# API

Backend em JavaScript com Hono, executado no Cloudflare Workers.
Esta pasta contém um Worker independente, não Pages Functions.

## Executar localmente

```sh
npm install
npm run dev
```

- `GET http://localhost:8787/`: retorna `{ "message": "Hello World" }`.
- `GET http://localhost:8787/api/health`: retorna `{ "status": "ok" }`.

## Validar o build

```sh
npm run build
```

Esse comando gera o bundle em `dist/` sem publicar na Cloudflare.

## Publicar

```sh
npx wrangler login
npm run deploy
```

Para chamar outras APIs, use o `fetch` nativo do Workers.

## SQLite em desenvolvimento

O Wrangler já inclui o SQLite usado pelo D1 local, sem instalar outro driver.
`wrangler.local.jsonc` configura esse banco somente para desenvolvimento;
`wrangler.jsonc` continua sendo a configuração de publicação, sem banco.
Não é necessário criar banco ou fazer login na Cloudflare para usar o banco local.

Os dados persistem em `.wrangler/state/`, ignorado pelo Git.
Na API, o banco fica disponível por `c.env.DB`:

```js
const result = await c.env.DB.prepare('SELECT 1 AS ok').first()
```

Executar uma consulta:

```sh
npm run db:sql -- --command "SELECT 1 AS ok"
```

Criar uma migração, preencher o arquivo SQL gerado e aplicar:

```sh
npm run db:migration -- criar_tabelas
npm run db:migrate
```

Exportar estrutura e dados:

```sh
npm run db:export -- --output=./backup.sql
```

## Tabela emotes

### Rotas de CRUD

| Método | Rota | Operação | Resposta de sucesso |
| --- | --- | --- | --- |
| GET | `/api/emotes` | Listar todos, ordenados por ID | 200, array de emotes |
| GET | `/api/emotes/:id` | Consultar um emote | 200, emote |
| POST | `/api/emotes` | Criar | 201, emote e cabeçalho Location |
| PUT | `/api/emotes/:id` | Substituir os campos | 200, emote atualizado |
| PATCH | `/api/emotes/:id` | Alterar apenas os campos enviados | 200, emote atualizado |
| DELETE | `/api/emotes/:id` | Excluir | 204, sem corpo |

Envie um objeto JSON em POST, PUT e PATCH. Exemplo para criar:

```json
{
  "emote_name": "peepoHappy",
  "url": "https://example.com/peepoHappy.png",
  "author": "",
  "channel": "GlobalCE"
}
```

POST e PUT exigem `emote_name`, `url` e `channel`. `author` é opcional e
assume texto vazio quando omitido nesses métodos. PATCH exige ao menos um
campo e preserva os demais. Todos os campos são textos; nome e canal não
podem ser vazios e URL deve usar HTTP ou HTTPS. O ID é gerado pelo banco
e não deve ser enviado no corpo. Campos desconhecidos são rejeitados.

Erros retornam `{ "error": "mensagem" }`: 400 para dados ou ID inválidos,
404 para emote inexistente e 500 para falhas internas.
POST, PUT, PATCH e DELETE exigem o cabeçalho `UserCode` com o UUID de um
código cujo status seja `GENERATED`. Exemplo:

```http
UserCode: ec627891-4f31-4f1d-8230-4e8fa552f59c
```

Uma operação bem-sucedida altera o código para `USED`. A alteração do emote
e o consumo acontecem na mesma transação, permitindo apenas uma operação
por código, inclusive com chamadas simultâneas. Erros de validação, emote
inexistente ou falhas no banco não consomem o código. Cabeçalho ausente ou
vazio retorna 401; código inexistente, USED ou EXPIRED retorna 403.
GET continua público. A autorização verifica o status armazenado; a regra
de expiração de 24 horas continua sendo aplicada pela rota unlock.

O CRUD depende do banco local
configurado; o banco de produção será integrado quando for escolhido.

### Testes

Com `npm run dev` ativo em outro terminal, execute `npm test` dentro desta
pasta. Os testes de emotes usam a API HTTP e o SQLite real, criam registros
temporários de emotes e os removem ao terminar. Também geram UserCodes
para validar a autorização e o consumo. `API_URL` permite mudar a URL local utilizada.

### Migrações

As migrações `0001_create_emotes.sql` e `0002_seed_emotes.sql` criam a
tabela e importam os 28 registros de `data/cinemotesCE.json`.
Os campos são `id` (chave primária gerada automaticamente), `emote_name`,
`url`, `author` e `channel`. Os valores do JSON são preservados,
incluindo autores vazios.

Em uma instalação nova, execute `npm run db:migrate` para criar e popular
o banco. O Wrangler registra as migrações aplicadas para não repetir a importação.

```sh
npm run db:sql -- --command "SELECT * FROM emotes ORDER BY id"
```

## Tabela UserCode

As migrações `0003_create_user_code.sql` e `0004_seed_user_code.sql`
criam a tabela e inserem três registros de exemplo, um para cada status.

- `UUID`: texto, chave primária obrigatória e única. A aplicação deve gerar
  novos UUIDs com `crypto.randomUUID()` antes de inserir.
- `Status`: `GENERATED`, `EXPIRED` ou `USED`, validado pelo banco.
  O valor padrão é `GENERATED`.
- `CreationDate`: texto em formato ISO 8601 UTC, preenchido automaticamente
  pelo banco ao inserir um registro sem informar esse campo.

```sh
npm run db:sql -- --command "SELECT * FROM UserCode ORDER BY CreationDate, UUID"
```

### Gerar código

`POST /api/usecode/generate` não exige corpo. Gera um UUID v4 com
`crypto.randomUUID()` nativo, grava `Status = GENERATED` e a data/hora
atual em UTC, e retorna HTTP 201:

```json
{ "UUID": "ec627891-4f31-4f1d-8230-4e8fa552f59c" }
```

A chave primária garante unicidade. Caso haja colisão, a API tenta gerar
outro UUID, até três tentativas, sem alterar o registro existente.
Falhas no banco ou esgotamento das tentativas retornam HTTP 500.

Para gerar de 1 a 15 códigos em uma única requisição, envie:

```json
{ "quantity": 15 }
```

A resposta HTTP 201 será `{ "UUIDs": ["uuid-1", "uuid-2", "..."] }`.
`quantity` deve ser um número inteiro entre 1 e 15; valores inválidos
retornam HTTP 400. Com corpo JSON, mesmo quantity igual a 1 retorna UUIDs.
Sem corpo, a resposta antiga `{ "UUID": "..." }` é mantida.
O lote é inserido em um único comando SQL, com status GENERATED e a mesma
data de criação. Colisões provocam nova tentativa do lote inteiro;
um lote com falha não deixa registros parcialmente inseridos.

### Usar código

`POST /api/usecode/unlock` recebe:

```json
{ "code": "ec627891-4f31-4f1d-8230-4e8fa552f59c" }
```

| Caso | HTTP | Resposta JSON (`message`) |
| --- | --- | --- |
| GENERATED com menos de 24 horas | 200 | `codigo usado com sucesso` |
| GENERATED com 24 horas ou mais, ou já EXPIRED | 410 | `código expirado` |
| Já USED | 409 | `código já foi usado` |
| Código inexistente | 404 | `código inválido ou inexistente` |
| JSON inválido, code ausente, vazio ou não textual | 400 | `código inválido ou inexistente` |

A primeira chamada válida muda GENERATED para USED. Ao atingir 24 horas,
GENERATED passa a EXPIRED. USED e EXPIRED permanecem nesses estados.
A atualização é atômica para evitar dois usos simultâneos. CreationDate
é preservada, e a expiração é verificada quando a rota é chamada.

Para usar MySQL ou PostgreSQL
em produção, será necessário adaptar o acesso ao banco e revisar o SQL das
migrações e do arquivo exportado para o banco escolhido.

## Channel reservado

POST /api/emotes não permite cadastrar no channel GlobalCE, inclusive
variações de maiúsculas/minúsculas ou espaços nas extremidades.
A rejeição retorna 400 e não consome o UserCode.

## Autenticação administrativa

As migrações `0005_create_auth.sql` e `0006_seed_admin.sql` criam Users,
AuthSession e LoginThrottle e cadastram o administrador ragnardragus.
A senha inicial definida na configuração do projeto é armazenada somente
como hash bcrypt com salt e custo 12. Não há senha em texto puro no código.

| Método | Rota | Descrição |
| --- | --- | --- |
| POST | `/api/auth/login` | Recebe username e password e inicia sessão |
| GET | `/api/auth/me` | Retorna o usuário da sessão administrativa |
| POST | `/api/auth/logout` | Revoga a sessão e remove o cookie |

Login, logout e geração de UserCodes exigem `X-Requested-With: Cinemotes`.
O login recebe JSON `{ "username": "...", "password": "..." }`.
O JWT HS256 fica no cookie cinemotes_session: HttpOnly, SameSite=Strict,
Path=/api, duração de 8 horas e Secure quando acessado por HTTPS.
O token não é retornado no JSON nem guardado em localStorage.
Assinatura, emissor, público, expiração e sessão registrada no banco são
verificados pela API. O logout revoga o token; usuários inativos e sem
papel ADMIN não acessam a geração. A API aplica cabeçalhos de segurança.

`POST /api/usecode/generate` agora exige uma sessão administrativa válida,
para a geração individual e em lote. Sem login retorna 401; usuário sem
permissão ou requisição sem proteção contra CSRF retorna 403.
Cadastro de emotes continua exigindo apenas o UserCode; unlock permanece público.
O login bloqueia a conta temporariamente após cinco tentativas inválidas
em uma janela de 15 minutos, com HTTP 429 e Retry-After.

O segredo JWT local está em `.dev.vars`, ignorado pelo Git.
Para outro ambiente local, copie `.dev.vars.example` para `.dev.vars` e
preencha JWT_SECRET com um segredo aleatório de pelo menos 32 caracteres.
Em produção, configure um segredo próprio com `npx wrangler secret put JWT_SECRET`.
O banco de produção ainda precisa ser configurado antes de publicar.

Os testes unitários de autenticação usam SQLite isolado. Para executar
os testes HTTP de emotes, inicie a API e defina TEST_ADMIN_PASSWORD em seu
terminal antes de executar npm test. TEST_ADMIN_USERNAME é opcional e
assume ragnardragus. Sem a senha, esses testes HTTP são pulados; os testes
unitários continuam sendo executados. Nenhuma senha real está embutida nos testes.
