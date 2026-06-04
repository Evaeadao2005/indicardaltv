const ZAP_CONTROL = {
  fallbackOrder: [
    'ZAP01','ZAP02','ZAP03','ZAP04','ZAP05','ZAP06','ZAP07','ZAP08','ZAP09'
  ],
  zaps: {
    ZAP00: { number: '558893509111', active: true, rotate: true },
    ZAP01: { number: '558894635325', active: true, rotate: true },
    ZAP02: { number: '558894492159', active: true, rotate: false },
    ZAP03: { number: '558892532304', active: true, rotate: false },
    ZAP04: { number: '558892063359', active: false, rotate: true },
    ZAP05: { number: '558894959133', active: true, rotate: true },
    ZAP06: { number: '558894963227', active: true, rotate: true },
    ZAP07: { number: '558894968232', active: true, rotate: true },
    ZAP08: { number: '558894976237', active: true, rotate: true },
    ZAP09: { number: '558894927965', active: true, rotate: false }
  }
};

const FALLBACK_ZAP_MAP = {
  ZAP00: '558893509111',
  ZAP01: '558894635325',
  ZAP02: '558894492159',
  ZAP03: '558892532304',
  ZAP04: '558892063359',
  ZAP05: '558894959133',
  ZAP06: '558894963227',
  ZAP07: '558894968232',
  ZAP08: '558894976237',
  ZAP09: '558894927965'
};

// ✅ Ajuste aqui os domínios permitidos
const ALLOWED_ORIGINS = new Set([
  'https://daltv.site',
  'https://indicar.daltv.site',
  // opcional para desenvolvimento:
  'http://localhost:3000',
  'http://localhost:5173'
]);

function buildCorsHeaders(origin) {
  // Se veio origin e ele é permitido, devolve ele. Se não, não libera.
  const allowOrigin = origin && ALLOWED_ORIGINS.has(origin) ? origin : null;

  const headers = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };

  if (allowOrigin) headers['Access-Control-Allow-Origin'] = allowOrigin;

  return headers;
}

function normalizeZapId(zapId) {
  return (zapId || '').toUpperCase();
}

function getSaudacao(adjustedHour) {
  const saudacoes = {
    morning: 'Bom dia! Tenho interesse em assinar a DALTV',
    afternoon: 'Boa tarde! Tenho interesse em assinar a DALTV',
    night: 'Boa noite! Tenho interesse em assinar a DALTV',
    earlyMorning: 'Boa madrugada! Tenho interesse em assinar a DALTV'
  };

  if (adjustedHour >= 6 && adjustedHour < 12) return saudacoes.morning;
  if (adjustedHour >= 12 && adjustedHour < 18) return saudacoes.afternoon;
  if (adjustedHour >= 0 && adjustedHour < 6) return saudacoes.earlyMorning;
  return saudacoes.night;
}

function readTextParam(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';
  try {
    return decodeURIComponent(rawValue.replace(/\+/g, '%20'));
  } catch (error) {
    return rawValue;
  }
}

function getRequestPath(event) {
  const rawUrl = event && event.rawUrl;
  if (rawUrl) {
    try {
      return new URL(rawUrl).pathname;
    } catch (error) {}
  }
  return String((event && event.path) || '');
}

function isFunctionApiPath(event) {
  return getRequestPath(event).includes('/.netlify/functions/zap-control');
}

function wantsJsonResponse(event) {
  const query = (event && event.queryStringParameters) || {};
  const mode = String(query.mode || query.format || '').trim().toLowerCase();
  if (mode === 'json' || mode === 'config') return true;
  const accept = String((event && (event.headers?.accept || event.headers?.Accept)) || '').toLowerCase();
  if (accept.includes('application/json') && !accept.includes('text/html')) return true;
  return isFunctionApiPath(event) && !query.text && !query.message && !query.redirect;
}

async function buildWhatsappRedirectUrl(event) {
  const hour = new Date().getUTCHours() - 3;
  const adjustedHour = (hour + 24) % 24;
  const saudacao = getSaudacao(adjustedHour);
  const query = (event && event.queryStringParameters) || {};
  const requestedZap = query.zap;
  const customText = readTextParam(query.text || query.message);
  const zapNumber = await resolveZapNumber(requestedZap);
  if (!zapNumber) return null;
  const message = customText || saudacao;
  return `https://api.whatsapp.com/send?phone=${zapNumber}&text=${encodeURIComponent(message)}`;
}

function getBannedNumbers(control) {
  if (!control || !control.zaps) return new Set();
  const bannedNumbers = new Set();
  Object.keys(control.zaps).forEach((zapId) => {
    const zap = control.zaps[zapId];
    if (!zap || !zap.number) return;
    if (zap.active === false || zap.banned === true) {
      bannedNumbers.add(zap.number);
    }
  });
  return bannedNumbers;
}

function isZapSelectable(zaps, zapId, bannedNumbers) {
  return zaps
    && zaps[zapId]
    && zaps[zapId].active !== false
    && zaps[zapId].banned !== true
    && zaps[zapId].number
    && (!bannedNumbers || !bannedNumbers.has(zaps[zapId].number));
}

function isZapRotatable(zaps, zapId, bannedNumbers) {
  return isZapSelectable(zaps, zapId, bannedNumbers)
    && zaps[zapId].rotate !== false;
}

function getRandomFallbackNumber(bannedNumbers) {
  const candidates = Object.keys(FALLBACK_ZAP_MAP)
    .map((zapId) => FALLBACK_ZAP_MAP[zapId])
    .filter((number) => !bannedNumbers || !bannedNumbers.has(number));
  if (candidates.length === 0) return null;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}

function getRandomSelectableNumber(control) {
  if (!control || !control.zaps) return null;
  const bannedNumbers = getBannedNumbers(control);
  const candidates = getSelectableNumbers(control, bannedNumbers);
  if (candidates.length === 0) return null;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}

function getSelectableNumbers(control, bannedNumbers) {
  if (!control || !control.zaps) return [];
  const activeBannedNumbers = bannedNumbers || getBannedNumbers(control);
  return Object.keys(control.zaps)
    .filter((zapId) => isZapSelectable(control.zaps, zapId, activeBannedNumbers))
    .map((zapId) => control.zaps[zapId].number);
}

function getRotatableNumbers(control, bannedNumbers) {
  if (!control || !control.zaps) return [];
  const activeBannedNumbers = bannedNumbers || getBannedNumbers(control);
  return Object.keys(control.zaps)
    .filter((zapId) => isZapRotatable(control.zaps, zapId, activeBannedNumbers))
    .map((zapId) => control.zaps[zapId].number);
}

function pickZapNumber(control, requestedZap) {
  const requestedId = normalizeZapId(requestedZap);
  if (control && control.zaps) {
    const bannedNumbers = getBannedNumbers(control);
    if (requestedId && isZapSelectable(control.zaps, requestedId, bannedNumbers)) {
      return control.zaps[requestedId].number;
    }
    const randomSelectable = getRandomSelectableNumber(control);
    if (randomSelectable) return randomSelectable;
    return getRandomFallbackNumber(bannedNumbers);
  }
  if (requestedId && FALLBACK_ZAP_MAP[requestedId]) {
    return FALLBACK_ZAP_MAP[requestedId];
  }
  return getRandomFallbackNumber();
}

async function loadZapControl() {
  return ZAP_CONTROL;
}

async function resolveZapNumber(requestedZap) {
  const control = await loadZapControl();
  return pickZapNumber(control, requestedZap);
}

async function resolveRandomZapNumber() {
  const control = await loadZapControl();
  if (control && control.zaps) {
    const bannedNumbers = getBannedNumbers(control);
    const activeNumbers = getSelectableNumbers(control, bannedNumbers);
    if (activeNumbers.length > 0) {
      const index = Math.floor(Math.random() * activeNumbers.length);
      return activeNumbers[index];
    }
    return getRandomFallbackNumber(bannedNumbers);
  }
  return getRandomFallbackNumber();
}

async function resolveRotatingZapNumber(usedNumbers = []) {
  const control = await loadZapControl();
  const bannedNumbers = getBannedNumbers(control);
  const rotatableNumbers = getRotatableNumbers(control, bannedNumbers);
  if (rotatableNumbers.length === 0) {
    return { number: getRandomFallbackNumber(bannedNumbers), nextUsed: [] };
  }

  const normalizedUsed = new Set(
    (usedNumbers || [])
      .filter((number) => rotatableNumbers.includes(number))
  );
  const remaining = rotatableNumbers.filter((number) => !normalizedUsed.has(number));

  if (remaining.length === 0) {
    const index = Math.floor(Math.random() * rotatableNumbers.length);
    const number = rotatableNumbers[index];
    return { number, nextUsed: [number] };
  }

  const index = Math.floor(Math.random() * remaining.length);
  const number = remaining[index];
  return { number, nextUsed: [...Array.from(normalizedUsed), number] };
}

module.exports = {
  ZAP_CONTROL,
  resolveZapNumber,
  resolveRandomZapNumber,
  resolveRotatingZapNumber,
  buildWhatsappRedirectUrl,

  // ✅ Netlify Function Handler com CORS + OPTIONS
  handler: async (event) => {
    const origin = event.headers?.origin || event.headers?.Origin;
    const corsHeaders = buildCorsHeaders(origin);

    if (!wantsJsonResponse(event) && event.httpMethod !== 'OPTIONS') {
      const redirectUrl = await buildWhatsappRedirectUrl(event);
      if (!redirectUrl) {
        return {
          statusCode: 503,
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'X-Robots-Tag': 'noindex, nofollow, noarchive'
          },
          body: 'Atendimento indisponível no momento.'
        };
      }
      return {
        statusCode: 302,
        headers: {
          Location: redirectUrl,
          'Cache-Control': 'no-store',
          'X-Robots-Tag': 'noindex, nofollow, noarchive'
        },
        body: ''
      };
    }

    // Se o origin não for permitido e veio de browser, já responde negando CORS
    // (o browser vai bloquear do mesmo jeito; isso é só pra ficar explícito)
    if (origin && !corsHeaders['Access-Control-Allow-Origin']) {
      return {
        statusCode: 403,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store'
        },
        body: JSON.stringify({ error: 'CORS: origin not allowed', origin })
      };
    }

    // Preflight
    if (event.httpMethod === 'OPTIONS') {
      return {
        statusCode: 200,
        headers: {
          ...corsHeaders,
          'Cache-Control': 'no-store'
        },
        body: ''
      };
    }

    return {
      statusCode: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store'
      },
      body: JSON.stringify(ZAP_CONTROL)
    };
  }
};
