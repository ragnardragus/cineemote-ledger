# Cinemotes Ledger

O projeto está organizado por responsabilidade:

- `frontend/`: aplicação React com Vite.
- `functions/`: API com Hono para Cloudflare Workers.

## Executar o frontend

```sh
cd frontend
npm install
npm run dev
```

## Verificar e compilar

Dentro de `frontend/`:

```sh
npm run lint
npm run build
```

O build é gerado em `frontend/dist/`.

## Executar a API

```sh
cd functions
npm install
npm run dev
```

A API fica disponível em `http://localhost:8787`.
Consulte `functions/README.md` para os comandos de build e publicação.
