# Frontend

Aplicação React com Vite do Cinemotes Ledger.

## Comandos

```sh
npm install
npm run dev
npm run lint
npm run build
npm run preview
```

Execute os comandos nesta pasta. Os arquivos de produção são gerados em `dist/`.

## Página de UserCode

A página administrativa `/admin/usercodes` gera de 1 a 15 códigos em uma única chamada a
`POST /api/usecode/generate`, enviando `{ "quantity": 15 }` e recebendo
`{ "UUIDs": ["..."] }`. É possível copiar um UUID ou todos, separados por
quebras de linha. O frontend exibe carregamento, confirmação e erros da API.
A identidade usa amarelo, carvão e creme. `public/cinemotes.svg` é uma
recriação vetorial do ícone de referência, usada no cabeçalho e como favicon.

Durante o desenvolvimento, execute `npm run dev` em `functions/` e em
`frontend/`, em terminais separados. O Vite encaminha `/api` para a API
local na porta 8787. Em produção, `/api` precisa ser encaminhado ao backend
no mesmo domínio; esse proxy do Vite é somente para desenvolvimento.

## Cadastro de emotes

Acesse `/emotes/novo` ou o link Cadastrar emote no cabeçalho.
Nome, URL, channel e código são obrigatórios; author é opcional.
O botão Carregar imagem valida a URL HTTP/HTTPS e carrega uma miniatura
no navegador antes de permitir o envio. Alterar a URL invalida a prévia.
Uma URL que não carrega como imagem mostra um erro; GIFs continuam animados.
Links externos precisam permitir carregar suas imagens no navegador.
A validação do conteúdo da imagem é feita no frontend, não na API.

O formulário envia `POST /api/emotes` com o UUID no cabeçalho UserCode.
O channel GlobalCE é bloqueado no frontend e no endpoint de criação,
ignorando espaços nas extremidades e diferenças de maiúsculas/minúsculas.
Após sucesso, o formulário é limpo e o código consumido é informado.

## Rotas e administração

- `/`: redireciona para o cadastro público de emotes.
- `/emotes/novo`: formulário público, autorizado por UserCode no envio.
- `/login`: login administrativo com usuário e senha.
- `/admin/usercodes`: geração de códigos, acessível somente após login.

O React Router organiza as páginas. A aplicação verifica a sessão em
GET /api/auth/me antes de exibir a administração. O servidor também
protege a geração de códigos, independentemente da proteção da interface.
O JWT é enviado automaticamente por cookie HttpOnly, sem armazenamento
em localStorage. O botão Sair revoga a sessão no servidor. Se a sessão
expirar ao gerar códigos, a aplicação retorna ao login.
O administrador inicial é ragnardragus; a senha é a definida na configuração
inicial, sem exibição ou preenchimento automático no frontend.
Para publicar as rotas, o host deve encaminhar navegações da SPA para
index.html e `/api` para o backend, no mesmo domínio.

## Login otimizado para Workers Free

A senha é derivada no navegador com Web Crypto (PBKDF2-SHA256, 600.000
iterações). A API retorna somente os parâmetros públicos por
GET /api/auth/challenge e verifica uma segunda hash da prova enviada.
O processamento caro não é feito pelo Worker. A senha não muda e o
JWT continua somente no cookie HttpOnly. É necessário HTTPS em produção;
localhost funciona para desenvolvimento.
