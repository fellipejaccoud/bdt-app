-- ============================================================
-- BDT Digital (INEA/DIRSUP) — esquema do banco (Neon Postgres)
-- Rode este script no SQL Editor do Neon, na branch "production".
-- ============================================================

-- ------------------------------------------------------------
-- Tabela BDT: o cabeçalho de cada boletim
-- (um registro por boletim diário)
-- ------------------------------------------------------------
CREATE TABLE bdt (
  id                    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Cabeçalho
  data                  DATE        NOT NULL,          -- Data do boletim
  placa                 TEXT        NOT NULL,          -- Placa do veículo (ex.: TTV-4J54)
  modelo                TEXT,                          -- Modelo (ex.: Fiat Cronos)
  responsavel           TEXT,                          -- Responsável pela utilização

  -- Página do motorista
  motorista_nome        TEXT        NOT NULL,          -- Nome do motorista
  matricula             TEXT,                          -- Matrícula (ex.: 390342-4)
  ocorrencias           TEXT,                          -- Ocorrências (texto livre)

  -- Rodapé de quilometragem / abastecimento
  km_inicial            INTEGER,
  km_final              INTEGER,
  km_percorrido         INTEGER GENERATED ALWAYS AS (km_final - km_inicial) STORED,
  abastecimento_litros  NUMERIC(6,2),                  -- Litros abastecidos

  -- Checklist do veículo (10 itens)
  -- checklist_alterado = FALSE  -> todos os itens OK automaticamente
  -- checklist_alterado = TRUE   -> ver o JSON item a item
  checklist_alterado    BOOLEAN     NOT NULL DEFAULT FALSE,
  checklist             JSONB       NOT NULL DEFAULT '{
    "brat": true,
    "triangulo": true,
    "macaco": true,
    "chave_roda": true,
    "estepe": true,
    "documento_veiculo": true,
    "afericao_pneus": true,
    "cartao_abastecimento": true,
    "nivel_agua": true,
    "nivel_oleo": true
  }'::jsonb,

  -- Canal de captura do boletim: 'web' (app) ou, no futuro, 'whatsapp'
  origem                TEXT        NOT NULL DEFAULT 'web',

  criado_em             TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ------------------------------------------------------------
-- Tabela TRECHO: uma linha por viagem dentro de um boletim
-- (a tabela de trechos: partida, chegada, horários, odômetro)
-- ------------------------------------------------------------
CREATE TABLE trecho (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  bdt_id          BIGINT   NOT NULL REFERENCES bdt(id) ON DELETE CASCADE,
  ordem           SMALLINT NOT NULL,        -- ordem do trecho no boletim (1, 2, 3...)

  local_partida   TEXT,                     -- Local da partida (ex.: Macaé)
  local_chegada   TEXT,                     -- Local da chegada (ex.: SUPRID)
  hora_partida    TIME,                     -- Hora da partida (ex.: 08:00)
  hora_chegada    TIME,                     -- Hora da chegada (ex.: 09:15)
  odometro        INTEGER                   -- Leitura do odômetro no trecho
);

-- ------------------------------------------------------------
-- Índices
-- ------------------------------------------------------------
CREATE INDEX idx_trecho_bdt ON trecho (bdt_id);   -- buscar trechos de um boletim
CREATE INDEX idx_bdt_data   ON bdt (data);        -- listar/filtrar boletins por data

-- ============================================================
-- Observações:
--  * km_percorrido é calculado automaticamente (km_final - km_inicial),
--    então nunca fica inconsistente. Não precisa preencher na mão.
--  * O checklist mora num único campo JSONB; a flag checklist_alterado
--    diz se vale olhar item a item ou se está tudo OK.
--  * ON DELETE CASCADE: apagar um boletim apaga os trechos dele junto.
-- ============================================================
