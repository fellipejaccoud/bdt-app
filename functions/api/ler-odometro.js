// ============================================================
// /api/ler-odometro  — lê o número do odômetro de uma foto (IA)
//
// Adaptado do protótipo Express para Cloudflare Pages Function.
//
// A foto chega em base64, é enviada para a API da Anthropic apenas
// para leitura e é DESCARTADA em seguida — nada é gravado. O número
// volta como SUGESTÃO editável: o motorista sempre pode corrigir.
//
// A ANTHROPIC_API_KEY vem das variáveis de ambiente (context.env),
// nunca fica escrita no código nem exposta ao navegador.
// ============================================================

export async function onRequestPost(context) {
  const apiKey = context.env.ANTHROPIC_API_KEY;

  // Sem chave, a leitura automática fica desativada — o app continua
  // funcionando com preenchimento manual (mesma lógica do protótipo).
  if (!apiKey) {
    return Response.json(
      { error: 'ANTHROPIC_API_KEY não configurada no ambiente.' },
      { status: 500 }
    );
  }

  try {
    const { image } = await context.request.json();
    if (!image) {
      return Response.json({ error: 'Nenhuma imagem enviada.' }, { status: 400 });
    }

    // Aceita "data:image/jpeg;base64,..." OU o base64 puro.
    let mediaType = 'image/jpeg';
    let base64 = image;
    if (image.includes(',')) {
      const [prefix, dados] = image.split(',');
      base64 = dados;
      const m = prefix.match(/data:(image\/\w+);base64/);
      if (m) mediaType = m[1];
    }

    const prompt =
      'Esta é a foto do painel de um veículo. Localize o VISOR DO ODÔMETRO ' +
      '(a quilometragem total do veículo — NÃO o velocímetro nem o conta-giros) ' +
      'e responda APENAS com os dígitos que ele mostra, sem pontos, espaços ou ' +
      'qualquer outro texto. Se não conseguir ler com segurança, responda ' +
      'exatamente ILEGIVEL.';

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        // Haiku: barato e suficiente para uma foto já enquadrada.
        // Para fotos difíceis, troque por 'claude-sonnet-5'.
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: { type: 'base64', media_type: mediaType, data: base64 },
              },
              { type: 'text', text: prompt },
            ],
          },
        ],
      }),
    });

    if (!resp.ok) {
      const detalhe = await resp.text();
      return Response.json(
        { error: 'Falha ao chamar a API de leitura.', detalhe },
        { status: 502 }
      );
    }

    const data = await resp.json();
    const texto = (data.content?.[0]?.text ?? '').trim();

    // Extrai apenas os dígitos. Se vier "ILEGIVEL" ou nada, sinaliza.
    const digitos = texto.replace(/\D/g, '');
    if (!digitos || /ILEG/i.test(texto)) {
      return Response.json({ leitura: null, ilegivel: true });
    }

    return Response.json({ leitura: digitos, ilegivel: false });
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 });
  }
}
