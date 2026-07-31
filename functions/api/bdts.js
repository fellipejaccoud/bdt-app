// ============================================================
// /api/bdts  — grava e lista boletins (BDT) no Neon
//
// Roda como Cloudflare Pages Function (runtime Workers).
// Conecta ao Neon pelo serverless driver, por HTTP.
//
//   GET  /api/bdts   -> lista os boletins (mais recentes primeiro), com os
//                        trechos aninhados; aceita filtros ?placa=&mes=
//   POST /api/bdts   -> grava um novo boletim + seus trechos
//
// A DATABASE_URL vem das variáveis de ambiente (context.env),
// nunca fica escrita no código.
// ============================================================

import { neon } from '@neondatabase/serverless';

// ------------------------------------------------------------
// GET /api/bdts  — lista os boletins, com os trechos aninhados
//
// Aceita filtros opcionais por querystring, usados pelo relatório
// mensal do front-end:
//   GET /api/bdts                      -> últimos 100 boletins (qualquer veículo)
//   GET /api/bdts?placa=TTV-4J54       -> boletins dessa placa
//   GET /api/bdts?placa=TTV-4J54&mes=2026-07 -> boletins da placa nesse mês
// ------------------------------------------------------------
export async function onRequestGet(context) {
  const sql = neon(context.env.DATABASE_URL);
  try {
    const url = new URL(context.request.url);
    const placa = url.searchParams.get('placa');
    const mes = url.searchParams.get('mes'); // 'YYYY-MM'

    const bdts = await sql`
      SELECT b.id, b.data, b.placa, b.modelo, b.responsavel, b.motorista_nome,
             b.matricula, b.km_inicial, b.km_final, b.km_percorrido,
             b.abastecimento_litros, b.ocorrencias, b.checklist_alterado,
             b.checklist, b.origem, b.criado_em,
             COALESCE(
               json_agg(
                 json_build_object(
                   'ordem', t.ordem,
                   'local_partida', t.local_partida,
                   'local_chegada', t.local_chegada,
                   'hora_partida', t.hora_partida,
                   'hora_chegada', t.hora_chegada,
                   'odometro', t.odometro
                 ) ORDER BY t.ordem
               ) FILTER (WHERE t.id IS NOT NULL),
               '[]'
             ) AS trechos
      FROM bdt b
      LEFT JOIN trecho t ON t.bdt_id = b.id
      WHERE (${placa}::text IS NULL OR b.placa = ${placa})
        AND (${mes}::text IS NULL OR to_char(b.data, 'YYYY-MM') = ${mes})
      GROUP BY b.id
      ORDER BY b.data DESC, b.id DESC
      LIMIT ${placa || mes ? 1000 : 100}
    `;
    return Response.json(bdts);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ------------------------------------------------------------
// POST /api/bdts  — grava um boletim e seus trechos
//
// Corpo esperado (JSON):
// {
//   "bdt": {
//     "data": "2026-07-11", "placa": "TTV-4J54", "modelo": "Fiat Cronos",
//     "responsavel": "...", "motorista_nome": "...", "matricula": "390342-4",
//     "km_inicial": 20217, "km_final": 20301, "abastecimento_litros": 30,
//     "ocorrencias": "Nenhuma", "checklist_alterado": false,
//     "checklist": { "brat": true, ... }, "origem": "web"
//   },
//   "trechos": [
//     { "ordem": 1, "local_partida": "Macaé", "local_chegada": "SUPRID",
//       "hora_partida": "08:00", "hora_chegada": "09:15", "odometro": 20239 }
//   ]
// }
//
// O cabeçalho e todos os trechos são gravados numa ÚNICA instrução
// (CTE), então a operação é atômica: ou entra tudo, ou nada.
// ------------------------------------------------------------
export async function onRequestPost(context) {
  const sql = neon(context.env.DATABASE_URL);
  try {
    const body = await context.request.json();
    const b = body.bdt ?? body;
    const trechos = body.trechos ?? [];

    const [row] = await sql`
      WITH novo AS (
        INSERT INTO bdt (
          data, placa, modelo, responsavel, motorista_nome, matricula,
          km_inicial, km_final, abastecimento_litros, ocorrencias,
          checklist_alterado, checklist, origem
        ) VALUES (
          ${b.data}, ${b.placa}, ${b.modelo ?? null}, ${b.responsavel ?? null},
          ${b.motorista_nome}, ${b.matricula ?? null},
          ${b.km_inicial ?? null}, ${b.km_final ?? null},
          ${b.abastecimento_litros ?? null}, ${b.ocorrencias ?? null},
          ${b.checklist_alterado ?? false},
          ${JSON.stringify(b.checklist ?? {})}::jsonb, ${b.origem ?? 'web'}
        )
        RETURNING id
      ),
      ins_trechos AS (
        INSERT INTO trecho (
          bdt_id, ordem, local_partida, local_chegada,
          hora_partida, hora_chegada, odometro
        )
        SELECT novo.id, t.ordem, t.local_partida, t.local_chegada,
               t.hora_partida, t.hora_chegada, t.odometro
        FROM novo,
             jsonb_to_recordset(${JSON.stringify(trechos)}::jsonb) AS t(
               ordem int, local_partida text, local_chegada text,
               hora_partida time, hora_chegada time, odometro int
             )
        RETURNING 1
      )
      SELECT id FROM novo
    `;

    return Response.json({ id: row.id, ok: true }, { status: 201 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
