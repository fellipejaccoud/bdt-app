# Manual do Projeto — BDT Digital (INEA/DIRSUP)

Documento de referência técnica: arquitetura, papel de cada peça, como foi
configurado, e riscos de continuidade. Escrito em 2026-08-01, ao final da
etapa de adaptação do protótipo e publicação em produção.

---

## 1. Visão geral

O BDT Digital substitui o Boletim Diário de Trânsito em papel da frota do
INEA (DIRSUP) por um app web. O motorista preenche o boletim pelo celular ou
computador, tira foto do odômetro (lida automaticamente por IA), registra os
trechos percorridos, e ao final do dia gera um PDF no layout oficial e,
mensalmente, um relatório em Excel por veículo.

**Escala do projeto:** até ~10 veículos, uso online-first (sem necessidade de
funcionar offline). Sem login individual — a "identidade" de quem preenche
fica só no campo de texto "Motorista", sem autenticação por pessoa. O site
inteiro é protegido por uma **senha única compartilhada** (ver seção 7.1),
que a equipe toda usa — isso evita que qualquer pessoa na internet acesse o
link e leia dados da frota ou use a leitura de odômetro por IA sem limite.

---

## 2. Arquitetura

```
┌─────────────┐      push       ┌──────────────┐      build/deploy      ┌──────────────────────┐
│   GitHub     │ ───────────────▶│  (trigger)   │────────────────────────▶│  Cloudflare Pages     │
│ (código-fonte)│                 └──────────────┘                        │  (hospedagem + API)   │
└─────────────┘                                                          └──────────┬────────────┘
                                                                                      │
                                                     ┌────────────────────────────────┼────────────────────────────┐
                                                     │                                │                            │
                                                     ▼                                ▼                            ▼
                                          ┌───────────────────┐          ┌─────────────────────┐      ┌──────────────────────┐
                                          │  public/index.html │          │ functions/api/*.js   │      │  (navegador do        │
                                          │  (frontend, servido│          │ (backend — Pages     │      │   motorista: cache    │
                                          │   como arquivo     │          │  Functions)           │      │   local de nome/      │
                                          │   estático)         │          │                       │      │   matrícula/placa)    │
                                          └───────────────────┘          └──────────┬────────────┘      └──────────────────────┘
                                                                                      │
                                                                    ┌─────────────────┼─────────────────┐
                                                                    ▼                                    ▼
                                                          ┌──────────────────┐                ┌─────────────────────┐
                                                          │  Neon Postgres    │                │  API da Anthropic    │
                                                          │  (banco de dados) │                │  (leitura do         │
                                                          │                   │                │   odômetro por foto) │
                                                          └──────────────────┘                └─────────────────────┘
```

**Resumo da stack:**

| Camada | Tecnologia | Função |
|---|---|---|
| Hospedagem + backend | Cloudflare Pages + Pages Functions | Serve o HTML estático e roda as rotas de API (`/api/bdts`, `/api/ler-odometro`, `/api/veiculos`) como funções serverless |
| Frontend | HTML + JavaScript puro (sem framework, sem build step) | Formulário, editor de foto, checklist, geração de PDF (jsPDF) e Excel (SheetJS) — tudo roda no navegador |
| Banco de dados | Neon (Postgres serverless) | Guarda os boletins e trechos definitivos |
| IA | API da Anthropic (Claude Haiku 4.5) | Lê o número do odômetro na foto — chamada só do backend, nunca do navegador |
| Controle de versão / CI | GitHub + Cloudflare Pages (Git integration) | Todo `git push` na branch `main` publica automaticamente |
| Domínio | `bdt.fellipelab.com`, registrado e gerenciado na própria Cloudflare | Aponta (CNAME) para o projeto Pages |

Não existe servidor tradicional rodando 24h — tudo é *serverless*: o
Cloudflare só executa código quando chega uma requisição, e o Neon só cobra
computação quando há consultas ativas (ver seção 8).

---

## 3. Frontend (`public/index.html`)

Um único arquivo HTML autocontido (sem build step — não usa React, Vue, npm
bundler etc.). Isso foi herdado do protótipo original (um Claude Artifact) e
mantido de propósito: mais simples de manter, sem dependências de
compilação.

**Bibliotecas externas** (carregadas via CDN, direto no `<script src>`):
- **jsPDF** — gera o PDF do boletim no layout oficial (réplica do modelo em
  papel, com logo do INEA, tabela de trechos, checklist e anexo de fotos).
- **SheetJS (xlsx)** — gera o relatório mensal em Excel (.xlsx), com abas de
  resumo diário e de trechos.

**Principais blocos funcionais do JavaScript embutido:**

| Bloco | O que faz |
|---|---|
| `state` (objeto) | Guarda todo o estado do boletim em edição: placa, motorista, km inicial, trechos, checklist, etc. Vive só na memória do navegador durante a sessão. |
| `abrirCropper()` | Editor de foto: recorte/zoom manual sobre a imagem do odômetro antes de confirmar, com carimbo de data/hora sobreposto na imagem final. |
| `lerOdometroIA()` | Envia a foto para `/api/ler-odometro` e recebe a leitura sugerida (editável). |
| Fluxo **Iniciar/Concluir trecho** | Em vez de um formulário único, o motorista registra o odômetro de saída na hora (sem saber ainda o destino) e só completa o trecho (destino, hora, odômetro final) depois, ao chegar. O trecho "em andamento" fica salvo em `localStorage`, sobrevivendo a fechar o app. |
| Checklist | 10 itens obrigatórios do veículo — "tudo OK" com um clique, ou item a item se algo estiver alterado. |
| `enviarBDT()` | Monta o payload e envia via `POST /api/bdts` — é o único ponto em que o boletim é gravado de verdade no banco (acontece quando o motorista clica em "Gerar PDF do boletim"). |
| `gerarPDF()` | Monta o PDF (jsPDF) inteiramente no navegador, sem depender do backend. |
| `gerarRelatorioMensal()` | Busca os boletins do mês via `GET /api/bdts?placa=&mes=` e monta o Excel (SheetJS), também no navegador. |
| Cache local (`localStorage`) | Guarda só conveniências de preenchimento (último nome do motorista, matrícula, placa selecionada, e o trecho em andamento) — **não é a fonte de dados do boletim**, que é sempre o banco Neon. |

**Decisão de design importante:** o boletim só é gravado no banco quando o
motorista termina o dia e clica em "Gerar PDF" — não existe autosave
incremental por campo (diferente do protótipo original, que salvava a cada
alteração num key-value store exclusivo do ambiente de teste do Claude, que
não existe fora dele).

---

## 4. Backend (`functions/api/*.js`)

Roda como **Cloudflare Pages Functions**: cada arquivo dentro de
`functions/api/` vira uma rota automaticamente, pelo nome do arquivo
(convenção de roteamento por sistema de arquivos, sem precisar configurar
rotas manualmente). É JavaScript rodando no runtime Workers da Cloudflare —
não é Node.js tradicional, mas compatível com boa parte da API padrão.

### `functions/api/bdts.js`

| Rota | O que faz |
|---|---|
| `GET /api/bdts` | Lista os boletins mais recentes (até 100, ou até 1000 se filtrado), com os trechos já aninhados em cada boletim (via `LEFT JOIN` + `json_agg` no Postgres). Aceita `?placa=` e `?mes=YYYY-MM` para o relatório mensal. |
| `POST /api/bdts` | Grava um boletim novo + seus trechos numa única instrução SQL (CTE), de forma atômica — ou entra tudo, ou nada entra. Não existe `PATCH`/`PUT`: cada envio é um registro novo e definitivo. |

### `functions/api/ler-odometro.js`

| Rota | O que faz |
|---|---|
| `POST /api/ler-odometro` | Recebe a foto em base64, chama a API da Anthropic (modelo `claude-haiku-4-5`) pedindo só os dígitos do odômetro, e devolve `{ leitura, ilegivel }`. A foto **nunca é salva** em lugar nenhum — é usada só para essa chamada e descartada. Se a `ANTHROPIC_API_KEY` não estiver configurada, a função retorna erro e o app cai para preenchimento manual (o app inteiro continua funcionando sem essa função). |

### `functions/api/veiculos.js`

| Rota | O que faz |
|---|---|
| `GET /api/veiculos` | Lista os veículos ativos (placa + modelo), usados para preencher o seletor no formulário. |
| `POST /api/veiculos` | Cadastra um veículo novo (`{ placa, modelo }`). Se a placa já existir (mesmo inativa), reativa em vez de duplicar (`ON CONFLICT DO UPDATE`). |

Ambas as funções leem as credenciais de `context.env` (variáveis de
ambiente), nunca do código-fonte.

---

## 5. Banco de dados (Neon Postgres)

Três tabelas:

- **`bdt`** — um registro por boletim/dia/veículo: data, placa, modelo,
  motorista, matrícula, km inicial/final (km percorrido é uma coluna
  *calculada* automaticamente pelo Postgres), abastecimento, ocorrências, e o
  checklist inteiro guardado como um único campo `JSONB`.
- **`trecho`** — uma linha por viagem dentro de um boletim (`ON DELETE
  CASCADE`: apagar um boletim apaga os trechos junto), com local de
  partida/chegada, horários e odômetro.
- **`veiculo`** — cadastro da frota (placa + modelo), usado para preencher o
  seletor de veículo no formulário. Antes, a placa ficava fixa no código;
  agora qualquer veículo cadastrado pela tela ("+ Cadastrar novo veículo")
  aparece na lista. Tem uma coluna `ativo` (soft delete, não usada ainda pela
  UI) em vez de excluir a linha de fato.

`bdt` e `trecho` estão em `bdt_schema.sql`; `veiculo` está em
`veiculo_schema.sql` (ambos na raiz do repo, para rodar manualmente no SQL
Editor da Neon).

A conexão é feita pelo **driver serverless da Neon** (`@neondatabase/serverless`),
que fala com o Postgres por HTTP em vez de manter uma conexão TCP aberta —
desenhado especificamente para rodar em ambientes serverless como o Workers
da Cloudflare, que não suportam conexões de banco tradicionais de longa
duração.

A `DATABASE_URL` usada é a versão **pooler** (endpoint com `-pooler` no
nome), recomendada pela Neon para esse tipo de uso.

---

## 6. Integração com o GitHub

- Repositório: **`fellipejaccoud/bdt-app`**, privado.
- Serve só como controle de versão e como gatilho de deploy — não roda nada
  por conta própria (não é GitHub Actions nem CI customizado).
- `docs/` dentro do repo guarda a documentação de referência do projeto
  (spec original, protótipo, resumo, e este manual), para qualquer sessão
  futura conseguir retomar o contexto lendo os arquivos.

---

## 7. Integração com o Cloudflare

Duas partes:

**Cloudflare Pages** (hospedagem):
- Projeto `bdt-app`, conectado ao repositório do GitHub (Settings → Build →
  Git repository). Branch de produção: `main`.
- **Build command:** vazio (não há passo de build — o HTML já está pronto).
- **Build output directory:** `public`.
- Deploy automático ativado: todo `git push` na `main` publica sozinho.
- Variáveis de ambiente/segredos (`DATABASE_URL`, `ANTHROPIC_API_KEY`,
  `BASIC_AUTH_USER`, `BASIC_AUTH_PASSWORD`) configuradas em Settings →
  Variables and secrets, tipo **Secret** (criptografadas, não aparecem em
  texto puro no painel depois de salvas).
- **Atenção ao publicar por CLI depois que o Git foi conectado:** rodar
  `wrangler pages deploy` manualmente cai como *preview*, não como o deploy
  de produção oficial (que passou a ser só via `git push` na `main`) — pode
  não refletir variáveis de ambiente recém-cadastradas até um novo push
  acontecer. Na dúvida, force um deploy novo com
  `git commit --allow-empty -m "..."` seguido de `git push`.

### 7.1 Proteção por senha única (HTTP Basic Auth)

Desde 2026-08-01, o site inteiro (tela **e** as duas rotas de API) fica
atrás de autenticação HTTP Basic — um usuário e senha únicos, compartilhados
por toda a equipe (não é login individual).

- Implementado em `functions/_middleware.js` — roda antes de qualquer outra
  rota do projeto.
- Controlado por duas secrets: `BASIC_AUTH_USER` e `BASIC_AUTH_PASSWORD`.
  **Se qualquer uma das duas não estiver configurada, a proteção fica
  desativada** (o site funciona igual estava antes) — isso é proposital,
  para nunca travar o acesso sem querer no meio de um deploy.
- O navegador mostra a caixa de login nativa do sistema operacional (não é
  uma tela do app) e guarda a credencial por um tempo, então a equipe não
  digita a senha toda hora.
- Motivo de existir: sem isso, qualquer pessoa com o link conseguia ler o
  relatório mensal (nomes, matrículas, rotas) e chamar a leitura de
  odômetro por IA sem limite, o que gastaria o saldo pago da conta Anthropic.

**Cloudflare Domains** (domínio):
- `fellipelab.com` está registrado e gerenciado direto na Cloudflare.
- Subdomínio `bdt.fellipelab.com` conectado ao projeto Pages via Custom
  Domains — a Cloudflare cria e gerencia o registro DNS (CNAME) e o
  certificado SSL automaticamente.
- O app também continua acessível pela URL padrão `bdt-app.pages.dev`,
  independente do domínio customizado.

---

## 8. Integração com a Anthropic (leitura do odômetro)

- Uma `ANTHROPIC_API_KEY` própria, criada em console.anthropic.com,
  configurada como secret no Cloudflare (nunca no código).
- Modelo usado: **Claude Haiku 4.5** — mais barato, suficiente para uma foto
  já enquadrada pelo editor de recorte.
- **Custo:** pay-as-you-go, sem mensalidade. Para o volume desta frota
  (leituras pontuais de odômetro, poucas por dia), o custo fica na casa de
  centavos de dólar por mês.
- É a única peça do projeto que não é "grátis por padrão" — exige saldo
  pré-pago na conta da Anthropic (Plans & Billing).

---

## 9. Papel de cada serviço — resumo

| Serviço | Papel | Onde fica configurado |
|---|---|---|
| **GitHub** | Guarda o código-fonte, dispara o deploy | `fellipejaccoud/bdt-app` (privado) |
| **Cloudflare Pages** | Hospeda o site e roda o backend (Functions) | Painel Cloudflare → Compute → Workers & Pages → `bdt-app` |
| **Cloudflare Domains** | Domínio customizado + SSL | Painel Cloudflare → Domains → `fellipelab.com` |
| **Neon** | Banco de dados definitivo (boletins e trechos) | console.neon.tech, branch `production` |
| **Anthropic** | Lê o odômetro na foto (IA) | console.anthropic.com |

---

## 10. Riscos de descontinuidade por inatividade

Fui conferir a documentação oficial de cada serviço em vez de supor — resumo
por serviço:

### Neon (banco de dados) — risco baixo, **sem perda de dados**
- O **compute** (o "motor" que processa consultas) entra em modo de espera
  (*scale to zero*) depois de só **5 minutos sem uso**. Isso é normal e
  esperado — na próxima consulta, ele volta em poucos milissegundos, sem
  ação manual.
- Uma **branch** (inclusive a `production`) é **arquivada** automaticamente
  se tiver mais de 14 dias de existência **e** 24h sem uso. Arquivamento
  também não é perda de dados — os dados vão para um armazenamento mais
  barato (S3/Blob) e voltam automaticamente na primeira conexão seguinte,
  só um pouco mais lentos nesse primeiro acesso.
- **Não encontrei, na documentação oficial, nenhuma política de exclusão
  de projetos gratuitos por inatividade prolongada** (meses sem uso). O
  risco real de "sumir" é baixo, mas Neon é uma empresa comercial e políticas
  de conta gratuita podem mudar — vale checar o painel de vez em quando.

### Cloudflare (Pages + domínio) — risco baixo, com uma ressalva
- Não há indicação de que projetos Pages sejam removidos por inatividade.
- **A ressalva real é o domínio `fellipelab.com`**: domínios são registrados
  por um período (geralmente 1 ano) e precisam ser **renovados**. Se o
  registro expirar e não for renovado, `bdt.fellipelab.com` para de
  funcionar — mas o app continua no ar normalmente em `bdt-app.pages.dev`,
  que não depende do domínio próprio.

### GitHub — risco muito baixo
- Repositórios privados não são removidos por inatividade do repositório em
  si. O único cenário de risco é a **conta** do GitHub ficar
  completamente inativa por um período muito longo (anos), o que é uma
  política de conta, não de projeto.

### Anthropic (leitura de odômetro) — risco é de saldo, não de inatividade
- Não há risco de "desativação por inatividade" — é uso pré-pago. O único
  jeito da função parar de funcionar é o **saldo acabar** (a leitura por IA
  simplesmente passa a falhar, mas o resto do app continua funcionando
  normalmente com preenchimento manual do odômetro).

**Conclusão:** o maior risco prático de continuidade não é técnico, é
administrativo — lembrar de **renovar o domínio** todo ano e manter algum
saldo na Anthropic. O resto da stack (Cloudflare, Neon, GitHub) não tem
histórico nem política documentada de apagar projetos por inatividade.

---

## 11. Pendências e próximos passos

- **Cadastro de veículos** — implementado (tabela `veiculo`, rota
  `/api/veiculos`, botão "+ Cadastrar novo veículo" no formulário). Requer
  rodar `veiculo_schema.sql` uma vez no SQL Editor da Neon (branch
  `production`) antes de funcionar em produção.
- **Geolocalização (Google Maps)** — avaliado, mas decidido **não
  implementar por enquanto** (custo estimado de US$ 0 na prática, mas a
  decisão foi adiar). Se retomar no futuro: autocomplete de endereço +
  botão "usar minha localização atual", sempre com opção de digitar
  manualmente como alternativa.
- **Login individual** — avaliado e **descartado**: preferiu-se simplicidade
  (sem cadastro por pessoa) a autenticar cada motorista. Em vez disso, foi
  implementada uma senha única compartilhada protegendo o site inteiro (ver
  seção 7.1) — resolve o risco de exposição pública sem a burocracia de
  contas individuais.
