# Frontend — Cinemotes Ledger

Interface React com Vite, React Router e Material UI. A aplicação oferece o catálogo público, a área dos criadores e o painel administrativo.

Para instalar e preparar o backend, consulte o [README principal](../README.md#desenvolvimento-local).

## Comandos

Execute nesta pasta:

```sh
npm ci
npm run dev
npm run lint
npm run build
npm run preview
```

O build é gerado em `dist/`. O proxy de desenvolvimento encaminha `/api` para `http://127.0.0.1:8787`. `npm run preview` serve o build estático e não inicia a API nem o proxy de desenvolvimento.

## Rotas

| Rota | Acesso | Comportamento |
| --- | --- | --- |
| `/` | Público | Redireciona para a galeria global. |
| `/emotes/globais` | Público | Busca somente GlobalCE; grade com até sete colunas. |
| `/emotes/novo` | Público | Cadastro com canal e UserCode obrigatórios. |
| `/login` | Público | Login exclusivo de criadores. |
| `/my-emotes` | Criador | Lista e gerencia emotes do canal da conta. |
| `/admin/login` | Público | Login exclusivo de administradores. |
| `/admin` | Administrador | Redireciona para a geração de códigos. |
| `/admin/usercodes` | Administrador | Gera de 1 a 15 códigos com destinatário obrigatório. |
| `/admin/users` | Administrador | Lista usuários, com edição e confirmação de exclusão. |
| `/admin/users/novo` | Administrador | Formulário vazio para novo usuário. |
| `/admin/users/:id/editar` | Administrador | Carrega e edita o usuário informado. |
| `/admin/emotes/novo` | Administrador | Mesmo cadastro por UserCode. |

As páginas são carregadas sob demanda. `RequireAdmin` e `RequireCreator` controlam a navegação; as permissões também são verificadas pelo backend.

## Navegação e identidade visual

`SiteLayout` contém a top bar em largura total, a marca Cinemotes Ledger, os links à esquerda e o acesso à conta à direita. Os links administrativos aparecem somente para administradores; Meus Emotes aparece para criadores.

Visitantes veem Login e o switch de tema. Usuários logados veem avatar com inicial e nome; o menu da conta oferece tema e sair, com abertura por mouse, clique ou teclado. Não há sidebar.

O tema escuro é o padrão. A preferência claro/escuro fica em `localStorage`, na chave `cinemotes-theme`. Credenciais e JWT não são armazenados ali.

| Arquivo | Responsabilidade |
| --- | --- |
| `src/colors.js` | Paleta Cinemotes: amarelos e tons de apoio. |
| `src/theme.js` | Temas Material UI, variáveis CSS e autofill. |
| `src/theme/AppThemeProvider.jsx` | Seleção e persistência do tema. |
| `src/index.css` | Estrutura, grades, responsividade e detalhes visuais. |
| `public/cinemotes.svg` | Logo usado no cabeçalho e favicon. |

Componentes Material UI são importados diretamente por caminho. O Vite faz a varredura das páginas lazy na otimização das dependências, incluindo os componentes de Dialog.

## Cadastro com UserCode

`CreateEmote` atende `/emotes/novo` e `/admin/emotes/novo`. Sempre exige nome, URL, canal e UserCode; autor é opcional. Estar logado como criador não muda esse fluxo.

O botão Carregar imagem exibe uma prévia e bloqueia o envio até a imagem carregar. Alterar a URL invalida a prévia. A API valida o formato HTTP/HTTPS, mas a verificação de que o conteúdo carrega como imagem acontece no navegador.

O envio usa `POST /api/emotes` com `UserCode` no cabeçalho. O nome do canal aceita somente letras ASCII e números, até 120 caracteres; GlobalCE é reservado. A API reutiliza um canal pelo nome ou cria um novo e consome o código após cadastrar.

## Meus Emotes

`MyEmotes` consulta `GET /api/emotes/mine`, protegido pelo JWT do criador. O servidor determina o canal pela conta autenticada.

- Sem emotes: container com altura mínima e cartão **+** centralizado.
- Com emotes: grade responsiva e cartão **+** para adicionar mais.
- **+**: abre `CreatorEmoteDialog` com nome, URL e autor opcional; usa a sessão, sem canal ou UserCode no formulário.
- Clique em um emote: abre o menu Alterar/Excluir na posição do mouse.
- Alterar: preenche o mesmo modal e salva com PATCH.
- Excluir: pede confirmação em `DeleteEmoteDialog` antes de enviar DELETE.

A grade é atualizada ao concluir as operações. A abertura dos cartões de adicionar e de opções de emotes está configurada somente para clique, sem acionamento por Enter/Espaço ou foco por Tab. A galeria global usa os mesmos cards visuais, sem ações de edição.

## Administração

`Users` contém somente a listagem. O botão **+ Novo usuário** fica no cabeçalho do card. `UserForm` atende cadastro e edição em rotas separadas; salvar ou cancelar volta para a lista. Alterar nome ou senha da própria conta exige novo login.

Administradores e criadores são escolhidos no cadastro. Na edição, o perfil é apenas informativo. O canal é informado por nome para criadores; o cadastro cria o canal e a edição renomeia o vínculo existente. Administradores não podem ser excluídos: a ação aparece desabilitada, com a dica Exclusão bloqueada.

A página `UserCodes` envia `{ "quantity": 5, "receiver": "@destinatario" }`, recebe `{ "UUIDs": ["..."] }` e permite copiar um código ou o lote inteiro.

## Sessão

`AuthProvider` consulta `/api/auth/me` para restaurar a sessão. O login usa challenge e derivação PBKDF2 no navegador, e o JWT permanece em cookie HttpOnly. A sessão dura até oito horas; fechar a aba ou o navegador não equivale a sair. O logout revoga a sessão no servidor.

O login do criador usa `/api/auth/creator/login`; o administrativo usa `/api/auth/login`. Os formulários compartilham o componente `Login`, com configuração por perfil.

## Organização dos componentes

- `SiteLayout`, `AccountMenu`, `ThemeSwitch`: navegação e conta.
- `FormInput`, `FormSelect`: controles Material UI com validação nativa.
- `UserCardHeading`: ícone, título e subtítulo dos cards de usuários.
- `EmoteTile`: apresentação compartilhada dos emotes.
- `CreatorEmoteDialog`, `DeleteEmoteDialog`: gerenciamento dos emotes do criador.
- `src/api/users.js`: chamadas da listagem e do formulário de usuários.

## Cache do Vite

Se uma aba antiga apresentar `504 (Outdated Optimize Dep)`, reinicie o frontend com `npm run dev -- --force` e recarregue a aba com Ctrl + Shift + R. A configuração de `optimizeDeps` inclui as páginas lazy para preparar suas dependências antes da navegação.
