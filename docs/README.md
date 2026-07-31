# Documentação de referência — BDT Digital

Arquivos reunidos aqui em 2026-07-31 para retomar o projeto em outra sessão
do Claude Code: basta apontar o Claude Code para a pasta `bdt-app/` (esta
pasta `docs/` fica junto do código).

- `resumo_projeto_BDT.pdf` — resumo/status do projeto.
- `spec_BDT_digital.md` — especificação funcional (modelo de dados, fluxo de
  captura de foto, layout do PDF, relatório Excel). Alguns pontos já foram
  superados pela implementação atual (ex.: a spec menciona Supabase; o app
  real usa Neon Postgres + Cloudflare Pages — ver `../README.md` na raiz do
  projeto para a arquitetura vigente).
- `prototipo_boletim-odometro.html` — o protótipo original (Claude Artifact,
  com `window.storage` e chamada direta à Anthropic no navegador). Foi a
  base adaptada para `../public/index.html`, que já usa `/api/bdts` e
  `/api/ler-odometro` em vez de `window.storage`/chamada direta.
- `BDT_exemplo.pdf` — modelo do boletim em papel, referência do layout do PDF.

## Estado em 2026-07-31

- `functions/api/bdts.js` e `functions/api/ler-odometro.js` prontos e
  movidos para `functions/api/` (antes estavam soltos na raiz).
- `bdts.js` GET foi estendido para trazer os trechos aninhados e aceitar
  filtros `?placa=&mes=` — necessário para o relatório mensal em Excel
  (a spec/contrato original não incluía isso).
- `public/index.html` criado a partir do protótipo, com editor de foto,
  checklist, geração de PDF (jsPDF) e Excel (SheetJS) intactos; troca de
  `window.storage` por `fetch` às APIs.
- Testado localmente com `wrangler pages dev public` (front-end, chamadas às
  APIs corretas, geração de PDF com o boletim mockado). Faltava configurar
  `DATABASE_URL`/`ANTHROPIC_API_KEY` reais para testar a gravação de verdade.
- Pendente: Fase 3 (proteger o app com Cloudflare Access) — só depois do
  deploy em produção.
