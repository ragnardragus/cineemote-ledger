# API — Cinemotes Ledger

API JavaScript com Hono, executada em um Cloudflare Worker independente. O banco usa o binding `DB`: SQLite local no desenvolvimento e Cloudflare D1 em produção. A publicação integrada também serve os arquivos de `frontend/dist/`.

## Preparação e comandos locais

Execute nesta pasta, com Node.js 24 e npm:

```sh
npm ci
npm run db:migrate
npm run dev
```

Configure `JWT_SECRET` em `.dev.vars`, usando `.dev.vars.example` como modelo. Use um segredo aleatório de pelo menos 32 caracteres. O arquivo é ignorado pelo Git; a configuração remota do segredo é independente.

A API local fica em `http://localhost:8787`. `GET /api/health` retorna `{ "status": "ok" }`.

| Comando | Finalidade |
| --- | --- |
| `npm run dev` | Inicia o Worker com `wrangler.local.jsonc`. |
| `npm run db:migrate` | Aplica migrações no banco local. |
| `npm run db:migration -- nome_da_migracao` | Cria um arquivo de migração. |
| `npm run db:sql -- --command "SELECT * FROM channels"` | Executa SQL localmente. |
| `npm run db:export -- --output=.wrangler/backup.sql` | Exporta estrutura e dados locais. |
| `npm test` | Executa testes em bancos isolados. |
| `npm run build` | Valida o bundle e gera `dist/`, sem publicar. |
| `npm run deploy` | Publica usando `wrangler.jsonc`. |

Compile o frontend antes do build ou deploy do Worker: a configuração de produção referencia `../frontend/dist`.

## Banco e migrações

`wrangler.local.jsonc` usa `cinemotes-ledger-dev`; os dados persistem em `.wrangler/state/`. `wrangler.jsonc` aponta para `cinemotes-ledger-prod`. Comandos `db:*` dos scripts usam o banco local; alterações remotas exigem `--remote` explicitamente.

| Tabela | Campos e vínculos principais |
| --- | --- |
| `channels` | `id` UUID, `channelName`. |
| `emotes` | `id` UUID, `emote_name`, `url`, `author`, `channelId` → `channels.id`. |
| `Users` | `Id` UUID, `Username`, `PasswordHash`, `Role`, `Active`, `CreationDate`, `channelId` → `channels.id`. |
| `UserCode` | `UUID`, `Status`, `CreationDate`, `Receiver`. |
| `AuthSession` | `Id`, `UserId` → `Users.Id`, `ExpiresAt`. |
| `LoginThrottle` | `Bucket`, `Attempts`, `ResetAt`. |

Os perfis são `ADMIN` e `CREATOR`. Somente criadores podem ter canal vinculado. O perfil é imutável após o cadastro, e o banco impede excluir administradores.

Novos nomes de canais e renomeações aceitam de 1 a 120 letras ASCII (`A-Z`, `a-z`) e números (`0-9`). Espaços, acentos e símbolos são rejeitados pela API e pelos triggers do banco. Registros anteriores à validação são preservados.

### Evolução relevante

| Migrações | Mudança |
| --- | --- |
| `0001`–`0006` | Esquema inicial, importação de 28 emotes, exemplos de UserCode e administrador histórico. |
| `0008`–`0009` | Receiver obrigatório; códigos anteriores recebem Cinemotes como destinatário. |
| `0010` | Recria os emotes com novos UUIDs, preservando os demais dados. |
| `0011`–`0013` | Cria channels, inclui GlobalCE e adiciona o vínculo dos usuários. |
| `0014` | Substitui o texto channel por channelId e vincula todos os emotes existentes ao GlobalCE. |
| `0015` | Converte USER em CREATOR, protege perfis e administradores e encerra sessões existentes. |
| `0016`–`0017` | Índice de busca por nome e validação dos nomes de canais. |

Migrações históricas devem ser mantidas em ordem. Um arquivo privado de credencial (`0007_admin_client_password.sql`) pode existir no ambiente original, mas não é versionado; bancos novos usam o script de provisionamento abaixo.

## Autenticação e autorização

| Método | Rota | Acesso / finalidade |
| --- | --- | --- |
| GET | `/api/auth/challenge?username=...` | Público; parâmetros de derivação da senha. |
| POST | `/api/auth/login` | Login exclusivo de ADMIN. |
| POST | `/api/auth/creator/login` | Login exclusivo de CREATOR. |
| GET | `/api/auth/me` | Restaura a sessão de qualquer um dos dois perfis. |
| GET | `/api/auth/creator/me` | Exige sessão de criador. |
| POST | `/api/auth/logout` | Revoga a sessão e remove o cookie. |

O cliente consulta o challenge, deriva a senha com Web Crypto (PBKDF2-SHA256, 600.000 iterações) e envia `{ "username": "...", "proof": "..." }`. A API compara SHA-256 da prova com o verificador armazenado, sem executar a derivação custosa no Worker. A prova é uma credencial e não deve ser registrada ou persistida pelo cliente.

O JWT usa HS256, com audiences distintas para administradores e criadores. A API verifica assinatura, emissor, audience, expiração, sessão registrada e usuário ativo. A autorização usa o perfil atual do banco.

O token fica no cookie `cinemotes_session`: HttpOnly, SameSite=Strict, Path=/api, validade de oito horas e Secure em HTTPS. Não é retornado no JSON. Fechar o navegador não encerra a sessão; logout ou alteração de nome/senha revogam as sessões correspondentes.

Login, logout e alterações administrativas exigem `X-Requested-With: Cinemotes`; requisições identificadas como cross-site são rejeitadas. O login limita tentativas por nome de usuário em uma janela de 15 minutos e retorna 429 com Retry-After ao exceder o limite.

## Emotes

| Método | Rota | Operação / sucesso |
| --- | --- | --- |
| GET | `/api/emotes` | Listagem pública; 200 com array. |
| GET | `/api/emotes/:id` | Consulta pública por UUID; 200 com emote. |
| GET | `/api/emotes/mine` | Apenas criador; emotes do canal da conta. |
| POST | `/api/emotes` | Cadastro; 201 com emote e Location. |
| PUT | `/api/emotes/:id` | Substituição dos campos; 200 com emote. |
| PATCH | `/api/emotes/:id` | Atualização parcial; 200 com emote. |
| DELETE | `/api/emotes/:id` | Exclusão; 204 sem corpo. |

O banco guarda `channelId`, mas as respostas dos emotes retornam `channel` com o nome do canal. IDs são UUIDs v4; não são recebidos no body de cadastro.

### Filtros da listagem

```http
GET /api/emotes
GET /api/emotes?channel=MeuCanal
GET /api/emotes?channel=MeuCanal&channelOnly=true
GET /api/emotes?channel=GlobalCE&channelOnly=true
```

- Sem `channel`: todos os emotes.
- Com `channel`: emotes desse canal e de GlobalCE.
- Com `channelOnly=true`: somente o canal informado.
- `channelOnly` assume `false` e aceita somente `true` ou `false`; `true` exige `channel`.
- Canal inexistente: somente GlobalCE, ou array vazio com `channelOnly=true`.

A busca por nome ignora maiúsculas/minúsculas ASCII e espaços nas extremidades do filtro. Um filtro vazio ou com mais de 120 caracteres retorna 400. A antiga rota POST `/api/emotes/list` não existe mais.

`/api/emotes/mine` não usa esses filtros: consulta diretamente o channelId vinculado ao criador autenticado. Sem canal vinculado, retorna array vazio.

### Cadastro com UserCode

```http
POST /api/emotes
Content-Type: application/json
UserCode: <UUID do código>
```

```json
{
  "emote_name": "peepoHappy",
  "url": "https://example.com/peepoHappy.png",
  "author": "Nome do autor",
  "channel": "MeuCanal"
}
```

Nome, URL e canal são obrigatórios; author assume texto vazio se omitido. A API busca o canal pelo nome, reutiliza um existente ou cria um UUID e um novo registro. Criação do canal, do emote e consumo do código acontecem na mesma transação, inclusive sob concorrência.

GlobalCE é reservado e não aceita novos emotes por esse cadastro. A API valida HTTP/HTTPS na URL, mas não baixa a imagem para verificar seu conteúdo.

### Alteração e exclusão com UserCode

PUT recebe `emote_name`, `url` e `channelId`; `author` é opcional. PATCH recebe pelo menos um desses campos, preservando os demais. O canal informado por UUID deve existir.

Cada operação exige um UserCode com status `GENERATED`. Após uma alteração concluída, o código passa para `USED`. Falhas de validação e emotes inexistentes não consomem o código. Códigos usados, expirados ou inexistentes são rejeitados.

### Operações com JWT do criador

As mesmas rotas de escrita aceitam, como alternativa, o JWT do criador:

- Cookie de sessão mais `X-Requested-With: Cinemotes`.
- Ou `Authorization: Bearer <token>`, validado explicitamente.

O criador deve estar ativo, com sessão válida e canal vinculado diferente de GlobalCE. Só pode cadastrar, alterar e excluir emotes do próprio canal, sem transferi-los para outro. A sessão e o vínculo são verificados no comando que altera os dados.

No POST por sessão, `channel` pode ser omitido: o canal vem da conta. No PUT, `channelId` também pode ser omitido. Nenhum UserCode é consumido nesse fluxo. Um token administrativo não concede essas permissões de criador.

Se `UserCode` for enviado, ele tem prioridade; um código inválido não usa o JWT como fallback. No frontend, `/emotes/novo` sempre usa UserCode, enquanto o modal de Meus Emotes usa o cookie.

## UserCodes

### Gerar

`POST /api/usecode/generate` exige sessão administrativa e `X-Requested-With: Cinemotes`.

```json
{ "quantity": 5, "receiver": "@destinatario" }
```

`quantity` é um inteiro de 1 a 15. `receiver` é obrigatório e tem até 120 caracteres. Todos os códigos do lote recebem o destinatário informado, a mesma data UTC e status GENERATED.

Resposta 201:

```json
{ "UUIDs": ["uuid-1", "uuid-2", "uuid-3", "uuid-4", "uuid-5"] }
```

Mesmo um código retorna um array em UUIDs. Sem body, quantity ou receiver válido, retorna 400. A inserção do lote é atômica; colisões de UUID provocam nova tentativa do lote, até três vezes.

### Consumir ou expirar

`POST /api/usecode/unlock` é público e recebe `{ "code": "UUID" }`.

| Situação | HTTP | Resultado |
| --- | --- | --- |
| GENERATED há menos de 24 horas | 200 | Passa para USED. |
| GENERATED há 24 horas ou mais | 410 | Passa para EXPIRED. |
| Já EXPIRED | 410 | Mantém o estado. |
| Já USED | 409 | Mantém o estado. |
| Código inexistente | 404 | Código inválido ou inexistente. |
| Body/código inválido | 400 | Código inválido ou inexistente. |

Essa rota responde com `message`. A janela de 24 horas é avaliada ao chamar unlock; as mutações de emotes verificam o status armazenado, sem expirar códigos automaticamente pela data.

## Usuários

Todas as rotas exigem ADMIN. POST, PATCH e DELETE também exigem `X-Requested-With: Cinemotes`.

| Método | Rota | Operação |
| --- | --- | --- |
| GET | `/api/users` | Lista usuários sem credenciais. |
| GET | `/api/users/:id` | Consulta por UUID. |
| POST | `/api/users` | Cadastra ADMIN ou CREATOR. |
| PATCH | `/api/users/:id` | Edita nome, canal ou credencial. |
| DELETE | `/api/users/:id` | Exclui somente criadores. |

O cadastro recebe `username`, `role`, `salt` e `proof`; criadores também exigem `channelName`. O username aceita de 3 a 64 letras, números, pontos, traços ou sublinhados. A criação de usuário e canal é uma transação. Administradores não recebem canal.

A edição aceita `username`, `channelName` e/ou o par `salt`/`proof`. Não aceita role ou channelId. Renomear o canal altera o registro já vinculado, preservando seu UUID e os vínculos dos emotes. Mudar nome ou senha revoga as sessões do usuário.

As respostas incluem id, username, role, active, creationDate, channelId e channelName, sem senha, prova ou verificador. Username duplicado retorna 409. A exclusão de administradores é bloqueada na API e no banco.

## Provisionamento do administrador

As migrações incluem o administrador histórico `ragnardragus`, mas o login atual exige o verificador no formato de autenticação do projeto. Em um banco novo, aplique as migrações e provisione o administrador antes do primeiro login.

Exemplo no PowerShell, dentro de `functions/`:

```powershell
$adminPassword = Read-Host 'Senha do administrador' -AsSecureString
$env:ADMIN_PASSWORD = [System.Net.NetworkCredential]::new('', $adminPassword).Password
try {
  npm.cmd run admin:provision -- --local
} finally {
  Remove-Item Env:\ADMIN_PASSWORD
}
```

`ADMIN_USERNAME` é opcional e assume `ragnardragus`. O script deriva a credencial, aplica SQL temporário e remove o arquivo ao finalizar, sem imprimir senha, prova ou verificador. Também revoga as sessões anteriores dessa conta. Use `--remote` somente para provisionar o D1 de produção; esse comando não faz parte do build habitual.

## Testes

```sh
npm test
```

Testes unitários usam SQLite em memória; testes HTTP usam o runtime do Worker com um D1 temporário e persistência desativada. Não exigem a API local rodando nem senha real de administrador. O ambiente é encerrado ao final da suíte. Os UserCodes de teste recebem um identificador no Receiver e são removidos no encerramento da bateria de emotes.

A cobertura inclui autenticação, permissões por perfil/canal, tokens inválidos e revogados, CSRF, CRUD, consumo único de UserCodes, concorrência, filtros e migrações.

## Publicação na Cloudflare

A configuração `wrangler.jsonc` publica API e SPA no Worker `cinemotes-ledger-api`, com binding `DB` para `cinemotes-ledger-prod`. Para outra conta ou banco, ajuste nome e identificador do D1 antes de publicar.

A configuração de assets usa `single-page-application`; `/api/*` é processado primeiro pelo Worker. O proxy do Vite não participa da publicação.

1. Na raiz do repositório, instale as dependências e compile o frontend:

   ```sh
   npm ci --prefix frontend
   npm run build --prefix frontend
   npm ci --prefix functions
   ```

2. Dentro de `functions/`, autentique o Wrangler e configure o segredo do ambiente:

   ```sh
   npx wrangler login
   npx wrangler secret put JWT_SECRET
   ```

3. Aplique as migrações remotas:

   ```sh
   npx wrangler d1 migrations apply DB --remote
   ```

   A configuração do binding não aplica migrações automaticamente. Em uma base nova, provisione também o administrador com `--remote`, conforme a seção anterior.

4. Valide e publique:

   ```sh
   npm run build
   npm run deploy
   ```

No Workers Builds, com raiz do repositório e branch `main`:

- Build command: `npm ci --prefix frontend && npm run build --prefix frontend && npm ci --prefix functions`
- Deploy command: `cd functions && npx wrangler deploy`

As migrações e o provisionamento são etapas separadas do build. `.dev.vars` e o banco local não são enviados à produção.
