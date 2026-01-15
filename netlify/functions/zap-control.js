const ZAP_CONTROL = {
  fallbackOrder: [
    'ZAP01','ZAP02','ZAP03','ZAP04','ZAP05','ZAP06','ZAP07','ZAP08','ZAP09'
  ],
  zaps: {
    ZAP00: { number: '558893509111', active: false },
    ZAP01: { number: '558894635325', active: false },
    ZAP02: { number: '558894492159', active: false },
    ZAP03: { number: '558892532304', active: true },
    ZAP04: { number: '558892063359', active: false },
    ZAP05: { number: '558894959133', active: true },
    ZAP06: { number: '558894963227', active: true },
    ZAP07: { number: '558894968232', active: true },
    ZAP08: { number: '558894976237', active: true },
    ZAP09: { number: '558894927965', active: true }
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
  const candidates = Object.keys(control.zaps)
    .filter((zapId) => isZapSelectable(control.zaps, zapId, bannedNumbers))
    .map((zapId) => control.zaps[zapId].number);
  if (candidates.length === 0) return null;
  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
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
    const activeNumbers = Object.keys(control.zaps)
      .filter((zapId) => isZapSelectable(control.zaps, zapId, bannedNumbers))
      .map((zapId) => control.zaps[zapId].number);
    if (activeNumbers.length > 0) {
      const index = Math.floor(Math.random() * activeNumbers.length);
      return activeNumbers[index];
    }
    return getRandomFallbackNumber(bannedNumbers);
  }
  return getRandomFallbackNumber();
}

module.exports = {
  ZAP_CONTROL,
  resolveZapNumber,
  resolveRandomZapNumber,

  // ✅ Netlify Function Handler com CORS + OPTIONS
  handler: async (event) => {
    const origin = event.headers?.origin || event.headers?.Origin;
    const corsHeaders = buildCorsHeaders(origin);

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
