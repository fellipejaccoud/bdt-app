// ============================================================
// Middleware global — protege TODO o site (tela e API) com uma
// senha única compartilhada (HTTP Basic Auth), já que o app não
// tem login de usuário individual.
//
// Sem BASIC_AUTH_PASSWORD configurada, o middleware não bloqueia
// nada (fica igual estava antes) — só passa a proteger de verdade
// depois que a variável é cadastrada no ambiente (local via
// .dev.vars, produção via Cloudflare Pages > Settings > Variables
// and secrets).
// ============================================================

export async function onRequest(context) {
  const { request, env, next } = context;
  const validPassword = env.BASIC_AUTH_PASSWORD;

  // Sem senha configurada, a proteção fica desativada (não trava o app).
  if (!validPassword) return next();

  const validUser = env.BASIC_AUTH_USER || 'dirsup';
  const header = request.headers.get('Authorization') || '';

  if (header.startsWith('Basic ')) {
    try {
      const [user, pass] = atob(header.slice(6)).split(':');
      if (user === validUser && pass === validPassword) {
        return next();
      }
    } catch (e) {
      // header malformado — cai para o 401 abaixo
    }
  }

  return new Response('Autenticação necessária.', {
    status: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="BDT Digital - INEA/DIRSUP"' },
  });
}
