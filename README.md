# Cinemotes Ledger

Aplicação para organizar os emotes da comunidade Cinemotes e dos criadores do Cinefy. Mantém um catálogo global e catálogos por canal, com duas formas de gerenciar emotes: códigos de uso único (UserCodes) ou a sessão autenticada do criador responsável pelo canal.

## O que já está implementado

- Galeria pública de emotes globais, com até sete emotes por linha e layout responsivo.
- Cadastro público de emotes por UserCode, com prévia da imagem.
- Login exclusivo para criadores e área **Meus Emotes**, com cadastro e edição em modal e confirmação de exclusão.
- Painel administrativo para gerenciar usuários e gerar de 1 a 15 UserCodes por lote, identificados por destinatário.
- Perfis **Administrador** e **Criador**, com permissões verificadas pela API.
- Temas claro e escuro, com escuro como padrão e preferência salva no navegador.
- API com filtros por canal e persistência no Cloudflare D1; desenvolvimento com SQLite local do Wrangler.

## Perfis e fluxos

| Perfil | Acesso |
| --- | --- |
| Visitante | Consulta os emotes globais e cadastra emotes informando canal e UserCode. |
| Criador (`CREATOR`) | Entra em `/login` e gerencia os emotes do próprio canal em `/my-emotes`, sem UserCode. |
| Administrador (`ADMIN`) | Entra em `/admin/login`, gerencia usuários e gera UserCodes. |

A página `/emotes/novo` sempre usa UserCode, mesmo com um criador logado. O cadastro por sessão acontece no modal de **Meus Emotes**. O criador autenticado não pode alterar emotes de outro canal ou de `GlobalCE`.

No cadastro de um criador, um novo canal é criado e vinculado à conta. A edição do nome do canal preserva seu UUID. O perfil do usuário não pode ser alterado após o cadastro, e administradores não podem ser excluídos.

## Estrutura

```text
frontend/                  React, Vite, React Router e Material UI
  src/pages/               Páginas públicas, de criadores e administrativas
  src/components/          Layout, cards, menus e modais
  src/auth/                Sessão e proteção das rotas
  src/theme/               Alternância e persistência do tema
functions/                 API Hono em um Cloudflare Worker independente
  src/routes/              Emotes, usuários, autenticação e UserCodes
  migrations/              Evolução do esquema e dados iniciais do D1
  scripts/                 Provisionamento do administrador
  tests/                   Testes com SQLite em memória e D1 temporário
```

Apesar do nome `functions`, o backend é um Worker, não Cloudflare Pages Functions. A configuração de produção serve a API e o build do frontend no mesmo Worker.

## Desenvolvimento local

Pré-requisitos: Node.js 24 e npm. Execute os comandos abaixo na raiz do repositório.

```sh
npm ci --prefix frontend
npm ci --prefix functions
```

Em uma instalação nova, copie `functions/.dev.vars.example` para `functions/.dev.vars` e preencha `JWT_SECRET` com um segredo aleatório de pelo menos 32 caracteres. O arquivo local não é versionado.

Aplique as migrações no SQLite local:

```sh
npm run db:migrate --prefix functions
```

Para preparar o login administrativo em um banco novo, siga o [provisionamento do administrador](functions/README.md#provisionamento-do-administrador). As migrações históricas não substituem esse passo.

Inicie a API e o frontend em terminais separados:

```sh
# Terminal 1
npm run dev --prefix functions

# Terminal 2
npm run dev --prefix frontend
```

O frontend fica normalmente em `http://localhost:5173`, e a API em `http://localhost:8787`. O Vite encaminha `/api` para a API local. Os dados locais ficam em `functions/.wrangler/state/`, ignorado pelo Git. Não é necessário autenticar o Wrangler na Cloudflare para trabalhar com esse banco local.

## Páginas principais

| Rota | Página |
| --- | --- |
| `/` | Redireciona para `/emotes/globais`. |
| `/emotes/globais` | Galeria pública de GlobalCE. |
| `/emotes/novo` | Cadastro por UserCode. |
| `/login` | Login de criadores. |
| `/my-emotes` | Emotes do canal do criador autenticado. |
| `/admin/login` | Login administrativo. |
| `/admin` | Redireciona para `/admin/usercodes`. |
| `/admin/usercodes` | Geração de UserCodes. |
| `/admin/users` | Listagem e exclusão de usuários. |
| `/admin/users/novo` | Cadastro de usuários. |
| `/admin/users/:id/editar` | Edição de usuários. |
| `/admin/emotes/novo` | Cadastro por UserCode no layout administrativo. |

## Dados e regras

- **channels:** UUID e `channelName`. Novos nomes e renomeações aceitam de 1 a 120 letras ASCII e números, sem espaços, acentos ou símbolos.
- **emotes:** UUID, nome, URL, autor e `channelId` relacionado ao canal. A API retorna o nome em `channel`.
- **Users:** UUID, nome de usuário, verificador de senha, perfil, estado ativo, data de criação e canal opcional para criadores.
- **UserCode:** UUID, status `GENERATED`, `USED` ou `EXPIRED`, data de criação e destinatário (`Receiver`).
- **AuthSession / LoginThrottle:** sessões revogáveis e controle de tentativas de login.

`GlobalCE` é reservado: o cadastro de emotes não permite esse canal. As migrações incluem dados iniciais; não se trata de uma base vazia.

## Consultas de emotes

```http
GET /api/emotes
GET /api/emotes?channel=MeuCanal
GET /api/emotes?channel=MeuCanal&channelOnly=true
GET /api/emotes?channel=GlobalCE&channelOnly=true
```

Sem filtro, retorna todos. Com `channel`, retorna o canal e GlobalCE; com `channelOnly=true`, retorna apenas o canal. A área do criador usa `GET /api/emotes/mine`, que obtém o canal pela sessão, sem confiar em um filtro enviado pelo cliente.

Consulte os contratos completos no [README da API](functions/README.md).

## Verificações

```sh
npm run lint --prefix frontend
npm test --prefix functions
npm run build --prefix frontend
npm run build --prefix functions
```

O último comando é um **dry-run**: valida o Worker sem publicar. Os testes usam bancos isolados e não precisam da API de desenvolvimento em execução nem de credenciais reais.

## Cloudflare

`functions/wrangler.local.jsonc` aponta para o banco local. `functions/wrangler.jsonc` configura o Worker de produção, o binding `DB` e os arquivos estáticos de `frontend/dist`.

Migrações locais não alteram o D1 remoto. As etapas de publicação, configuração de `JWT_SECRET` e aplicação de migrações remotas estão no [README da API](functions/README.md#publicação-na-cloudflare).

## Documentação por área

- [Frontend: páginas, componentes, temas e navegação](frontend/README.md)
- [API: rotas, autenticação, banco, testes e publicação](functions/README.md)
