const { resolveRotatingZapNumber } = require('./zap-control');

function parseCookies(cookieHeader = '') {
  return cookieHeader
    .split(';')
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((acc, cookie) => {
      const separatorIndex = cookie.indexOf('=');
      if (separatorIndex === -1) return acc;
      const key = cookie.slice(0, separatorIndex).trim();
      const value = cookie.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function parseUsedNumbers(cookieValue) {
  if (!cookieValue) return [];
  return cookieValue
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildUsedCookie(name, usedNumbers) {
  const value = encodeURIComponent(usedNumbers.join(','));
  return `${name}=${value}; Path=/; Max-Age=604800; SameSite=Lax`;
}

exports.handler = async function(event, context) {
    const cookieHeader = event.headers?.cookie || event.headers?.Cookie || '';
    const cookies = parseCookies(cookieHeader);
    const usedNumbers = parseUsedNumbers(cookies.zapdisponivel);
    const { number: targetNumber, nextUsed } = await resolveRotatingZapNumber(usedNumbers);
    const redirectUrl = `https://wa.me/${targetNumber}`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="4;url=${redirectUrl}">
    <title>Procurando WhatsApp disponível...</title>
    <style>
      body { margin: 0; font-family: Arial, sans-serif; background: #0f0f0f; color: #fff; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
      .card { max-width: 560px; text-align: center; background: #1c1c1c; border-radius: 12px; padding: 28px; box-shadow: 0 10px 30px rgba(0,0,0,0.35); }
      .logo { width: 120px; height: auto; margin: 0 auto 16px; display: block; }
      h1 { font-size: 22px; margin-bottom: 12px; }
      p { margin: 8px 0; line-height: 1.5; color: #d6d6d6; }
      .spinner { width: 48px; height: 48px; border: 5px solid #2d2d2d; border-top-color: #25D366; border-radius: 50%; margin: 20px auto; animation: spin 1s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .hint { font-size: 13px; color: #9b9b9b; margin-top: 12px; }
      .manual-link { display: inline-block; margin-top: 14px; color: #25D366; text-decoration: none; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="card">
      <img class="logo" src="/logo.png" alt="DALTV">
      <h1>Aguarde um instante...</h1>
      <div class="spinner"></div>
      <p>Estamos buscando um WhatsApp disponível.</p>
      <p>Se o número não funcionar, volte e abra o link novamente.</p>
      <div class="hint">Redirecionando agora...</div>
      <a class="manual-link" href="${redirectUrl}">Clique aqui se não redirecionar automaticamente</a>
    </div>
    <script>
      setTimeout(function() {
        window.location.href = ${JSON.stringify(redirectUrl)};
      }, 3500);
    </script>
  </body>
</html>`;

    return {
        statusCode: 200,
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Set-Cookie': buildUsedCookie('zapdisponivel', nextUsed)
        },
        body: html
    };
};
