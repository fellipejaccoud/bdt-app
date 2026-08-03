// ============================================================
// /api/veiculos  — lista e cadastra veículos da frota
//
// Roda como Cloudflare Pages Function (runtime Workers).
//
//   GET  /api/veiculos  -> lista os veículos ativos (placa + modelo)
//   POST /api/veiculos  -> cadastra um veículo novo { placa, modelo }
//
// A DATABASE_URL vem das variáveis de ambiente (context.env),
// nunca fica escrita no código.
// ============================================================

import { neon } from '@neondatabase/serverless';

// ------------------------------------------------------------
// GET /api/veiculos  — lista os veículos ativos
// ------------------------------------------------------------
export async function onRequestGet(context) {
  const sql = neon(context.env.DATABASE_URL);
  try {
    const veiculos = await sql`
      SELECT placa, modelo
      FROM veiculo
      WHERE ativo = true
      ORDER BY placa
    `;
    return Response.json(veiculos);
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}

// ------------------------------------------------------------
// POST /api/veiculos  — cadastra um veículo novo
//
// Corpo esperado: { "placa": "TTV-4J54", "modelo": "Fiat Cronos" }
// ------------------------------------------------------------
export async function onRequestPost(context) {
  const sql = neon(context.env.DATABASE_URL);
  try {
    const body = await context.request.json();
    const placa = (body.placa || '').trim().toUpperCase();
    const modelo = (body.modelo || '').trim() || null;

    if (!placa) {
      return Response.json({ error: 'Informe a placa.' }, { status: 400 });
    }

    const [row] = await sql`
      INSERT INTO veiculo (placa, modelo)
      VALUES (${placa}, ${modelo})
      ON CONFLICT (placa) DO UPDATE SET ativo = true, modelo = COALESCE(EXCLUDED.modelo, veiculo.modelo)
      RETURNING placa, modelo
    `;

    return Response.json(row, { status: 201 });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
