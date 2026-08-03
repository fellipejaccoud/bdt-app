-- ============================================================
-- BDT Digital (INEA/DIRSUP) — cadastro de veículos
-- Rode este script no SQL Editor do Neon, na branch "production",
-- DEPOIS de já ter rodado o bdt_schema.sql.
-- ============================================================

CREATE TABLE veiculo (
  placa       TEXT PRIMARY KEY,          -- ex.: TTV-4J54
  modelo      TEXT,                      -- ex.: Fiat Cronos
  ativo       BOOLEAN     NOT NULL DEFAULT TRUE,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cadastra o veículo que já estava fixo no código, para não quebrar
-- o que já estava em uso.
INSERT INTO veiculo (placa, modelo) VALUES ('TTV-4J54', 'Fiat Cronos');
