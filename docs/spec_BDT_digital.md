# Especificação — BDT Digital (Boletim Diário de Trânsito) INEA/DIRSUP

## Escopo desta versão: local, single-user (v1)

Esta é a versão **v1** do projeto: roda localmente no computador do próprio usuário (`localhost`), sem hospedagem, sem múltiplos usuários e sem banco de dados na nuvem. O objetivo é validar o fluxo completo (formulário → foto → leitura por IA → PDF → Excel) rodando de forma simples, antes de decidir se vale a pena investir na versão multiusuário publicada (Supabase + hospedagem + frota completa). A seção 2 já reflete esse escopo simplificado; a versão de produção fica registrada como "Fase 2" ao final do documento, para quando for necessário.

## 1. Contexto e objetivo

Hoje o controle de quilometragem dos veículos da frota do INEA (DIRSUP) é feito em papel (Boletim Diário de Trânsito — BDT), preenchido manualmente pelo motorista. O principal problema: como é manual, o preenchimento é facilmente esquecido, prejudicando o controle da frota.

**Objetivo:** substituir o boletim de papel por um app que:
- Obriga o preenchimento estruturado (não é possível "esquecer" um campo obrigatório)
- Usa foto do odômetro como comprovação, com leitura automática do valor por IA
- Gera, ao final do dia, um PDF no mesmo layout do boletim oficial em papel
- Gera relatórios mensais em Excel para o Serviço de Controle de Frota

**Escala nesta v1:** um usuário só (você), rodando local. Sem necessidade de suporte offline — o computador estará sempre online ao rodar o app.

Já existe um protótipo funcional (arquivo `boletim-odometro.html`, anexado) construído como Claude Artifact, com toda a lógica de formulário, geração de PDF (jsPDF) e geração de Excel (SheetJS) já implementada e testada visualmente. **Este protótipo deve ser usado como referência de código/UX para a reconstrução — não é necessário reescrever do zero.** A única parte que não funciona fora do ambiente de teste do Claude.ai é a chamada de IA para leitura do odômetro, que precisa migrar para um pequeno servidor local (ver seção 5) — o download de PDF/Excel deve funcionar normalmente, já que são bibliotecas 100% client-side.

## 2. Stack recomendada (v1 — local)

- **App:** aplicação web local (ex.: Next.js rodando `npm run dev`, ou até um servidor simples em Node/Python servindo o HTML do protótipo) — acessada no navegador via `http://localhost:PORTA`
- **Backend:** um pequeno servidor local (ex.: rota de API do próprio Next.js, ou um servidor Express/Flask simples) só para o endpoint de leitura do odômetro por IA — precisa existir mesmo local, porque a chamada à API da Anthropic não pode ser feita direto do navegador com a chave exposta
- **Banco de dados / storage:** arquivo local — SQLite (recomendado, já estruturado) ou até arquivos JSON numa pasta `/dados`, com as fotos salvas em `/dados/fotos`. Nada de nuvem nesta fase
- **Bibliotecas já validadas no protótipo:** jsPDF (geração do PDF), SheetJS/xlsx (geração do Excel)

## 3. Modelo de dados

### Veículo
- `placa` (texto, ex: "TTV-4J54")
- `modelo` (texto, ex: "Fiat Cronos")

### Boletim diário (1 por veículo por dia)
- `data` (data)
- `placa` (referência ao veículo)
- `motorista_nome` (texto)
- `motorista_matricula` (texto)
- `km_inicial` (número)
- `km_inicial_foto` (imagem, opcional)
- `km_inicial_foto_carimbo` (texto — data/hora extraída no momento da captura)
- `checklist_modo` (enum: `ok` | `custom`) — resposta à pergunta única "houve alteração no checklist?"
- `checklist_itens` (mapa item → sim/não) — só relevante quando `checklist_modo = custom`; quando `ok`, todos os itens são gravados como sim automaticamente
- `abastecimento_litros` (número, opcional)
- `ocorrencias` (texto, opcional)

Itens fixos do checklist: BRAT, Triângulo, Macaco, Chave de roda, Estepe, Documento do veículo, Aferição dos pneus, Cartão de abastecimento, Nível de água OK, Nível de óleo OK.

### Trecho (N por boletim)
- `local_partida` (texto)
- `local_chegada` (texto)
- `hora_partida` (hora)
- `hora_chegada` (hora) — **preenchida automaticamente com o horário exato da captura da foto, mas continua editável manualmente**
- `odometro` (número) — preenchido automaticamente pela leitura de IA quando há foto, mas sempre editável/corrigível manualmente
- `foto` (imagem, **opcional** — o boletim deve poder ser concluído sem foto)
- `foto_carimbo` (texto, data/hora)

## 4. Fluxo de captura de foto (já implementado no protótipo, replicar)

1. Input de arquivo sem o atributo `capture`, para permitir escolher entre câmera e galeria
2. Ao selecionar uma imagem, abrir um editor de recorte/zoom: o motorista arrasta e ajusta o zoom até o visor do odômetro ficar nítido e enquadrado, dentro de um quadro fixo
3. Ao confirmar, gerar uma imagem final (resolução fixa, ex. 960px de largura) a partir da região recortada, com uma barra de carimbo (data + hora) sobreposta na parte inferior
4. Essa imagem final é usada tanto para exibir/guardar quanto para a leitura automática — não há necessidade de gerar duas variantes separadas
5. A foto é sempre opcional; sem foto, os campos de odômetro/hora ficam para preenchimento manual

## 5. Leitura automática do odômetro (requer um servidor, mesmo local)

**Importante:** no protótipo, essa chamada é feita direto do navegador para a API da Anthropic, o que só funciona dentro do sandbox de Artifacts do Claude.ai. Mesmo rodando local, isso precisa passar por um endpoint de servidor (ex: `http://localhost:PORTA/api/ler-odometro`) — não porque precise estar na internet, mas porque a chave de API não pode ficar exposta no código do navegador. O endpoint local:

1. Recebe a imagem (base64) do frontend
2. Chama a API da Anthropic (`POST https://api.anthropic.com/v1/messages`) usando uma chave de API própria (variável de ambiente `.env` local, nunca exposta no frontend)
3. Envia o prompt: localizar o visor do odômetro (não o velocímetro/conta-giros) e responder apenas com os dígitos, ou "ILEGIVEL" se não conseguir ler com segurança
4. Retorna o resultado ao frontend, que preenche o campo automaticamente **como sugestão editável** — o motorista sempre pode corrigir antes de salvar

**Pré-requisito:** criar uma chave de API em console.anthropic.com — isso precisa ser feito fora do Claude, por você. Sem essa chave, a leitura automática simplesmente não roda (mas o preenchimento manual continua funcionando normalmente).

## 6. Geração do PDF (replicar máscara oficial do BDT)

O PDF deve reproduzir visualmente o boletim de papel original (documento de referência já analisado: `BDTs_Fellipe.docx`). Estrutura de duas páginas, formato A4 paisagem:

**Página 1:**
- Logo do INEA (canto superior esquerdo) + título "Boletim Diário de Trânsito - BDT"
- Linha: Data / Placa / Modelo
- Linha: Responsável pela utilização
- Tabela de trechos: Local Partida | Local Chegada | Hora Partida | Hora Chegada | Odômetro | Assinatura (coluna de assinatura **em branco**, reservada para assinatura digital futura — não preencher com texto placeholder)
- Rodapé: Km Inicial / Km Final / Km Percorrido / Abastecimento (L)
- Nota de rodapé (Obs¹) sobre uso obrigatório do boletim

**Página 2:**
- Nome do motorista / Matrícula / Assinatura (linha em branco, mesma lógica da página 1)
- Caixa de Ocorrências
- Tabela do checklist obrigatório com SIM/NÃO marcado conforme os dados do boletim
- Notas de rodapé (Obs², Obs³)

**Página 3 (opcional, anexo — não existe no modelo em papel):** fotos de comprovação do odômetro com carimbo de data/hora, incluída apenas se houver ao menos uma foto anexada no dia.

O código de geração (jsPDF) já existe pronto no protótipo e pode ser reaproveitado quase sem alterações.

## 7. Relatório mensal em Excel

Tela com seletor de mês (`input type="month"`) e botão para gerar. Consulta todos os boletins salvos daquele veículo no mês selecionado e gera uma planilha (.xlsx) com duas abas:

**Aba "Resumo diário":** Data, Motorista, Placa, Km Inicial, Km Final, Km Percorrido, Abastecimento (L), Checklist (OK / lista de itens alterados), Ocorrências — com uma linha de total do mês (km percorrido total, litros totais).

**Aba "Trechos":** uma linha por viagem — Data, Motorista, Matrícula, Placa, Modelo, Local Partida, Local Chegada, Hora Partida, Hora Chegada, Odômetro, Carimbo da foto.

Código de geração (SheetJS) já existe pronto no protótipo.

## 8. Itens que NÃO devem ser levados do protótipo

- `window.storage` (é uma API exclusiva de Artifacts do Claude.ai) — substituir por leitura/escrita em SQLite ou arquivos JSON locais
- Chamada de IA direto do navegador — mover para o endpoint de servidor local (ver seção 5)
- Lista fixa de 1 veículo no código — mesmo local, vale deixar como uma lista simples editável (não precisa de cadastro via banco nesta fase)

## 9. Checklist de pré-requisitos para iniciar no Claude Code

- [ ] Node.js instalado no computador (ou Python, dependendo do que o Claude Code recomendar)
- [ ] Chave de API da Anthropic gerada em console.anthropic.com (para o endpoint de leitura do odômetro — opcional, mas necessária se quiser manter esse recurso)
- [ ] Placa/modelo do(s) veículo(s) que você vai registrar nesta fase

## 10. Fase 2 (futuro — não iniciar agora)

Quando o app local estiver validado e fizer sentido abrir para os outros motoristas da DIRSUP, os pontos a revisitar são: hospedagem (Vercel/Netlify), migração do SQLite/JSON para Supabase (Postgres + Storage), cadastro real de veículos, e decisão sobre assinatura digital (canvas de assinatura por toque, ou integração com solução já usada pelo INEA). Nada disso precisa ser decidido agora.
