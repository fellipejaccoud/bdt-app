# BDT Digital — Cloudflare Pages + Neon

App do Boletim Diário de Trânsito (INEA/DIRSUP). Substitui o boletim de papel:
formulário estruturado, leitura do odômetro por foto (IA, sem salvar a foto),
geração de PDF no layout oficial e relatório mensal em Excel.

## Estrutura

```
bdt-app/
├── functions/
│   └── api/
│       ├── bdts.js          → grava/lista boletins no Neon  (PRONTO)
│       └── ler-odometro.js  → lê o km da foto via IA        (a adaptar do protótipo)
├── public/
│   └── index.html           → a aplicação (front)           (a adaptar do protótipo)
├── package.json
├── .gitignore
├── .dev.vars.example        → modelo das variáveis de ambiente locais
└── README.md
```

As funções em `functions/` viram rotas automaticamente:
`functions/api/bdts.js` responde em `/api/bdts`.

## Rodar localmente

1. Instale as dependências:
   ```
   npm install
   ```
   (Confirme o Wrangler mais recente, se precisar: `npm install -D wrangler@latest`.)

2. Crie o arquivo de segredos local:
   ```
   cp .dev.vars.example .dev.vars
   ```
   e preencha `DATABASE_URL` (string do Neon, versão com `-pooler`) e
   `ANTHROPIC_API_KEY`. Esse arquivo **não** vai pro Git.

3. Suba o servidor de desenvolvimento:
   ```
   npm run dev
   ```

## Publicar (produção)

- O deploy sai por Git (push no repositório conectado ao Cloudflare Pages) ou por
  `npm run deploy`.
- Em produção, `DATABASE_URL` e `ANTHROPIC_API_KEY` são cadastradas no painel do
  Cloudflare Pages em **Settings > Environment variables** — nunca no código nem
  no `.dev.vars`.

## Segurança

- Repositório **privado**.
- Segredos só em `.dev.vars` (local) e nas variáveis do Cloudflare (produção).
- A foto do odômetro é lida e descartada; não é gravada em lugar nenhum do app.

## Contrato da API `/api/bdts`

- `GET` devolve os últimos 100 boletins.
- `POST` recebe `{ "bdt": {...}, "trechos": [...] }` e grava tudo de forma
  atômica. Ver o cabeçalho de `functions/api/bdts.js` para o formato completo.
