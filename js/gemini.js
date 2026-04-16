/**
 * @file gemini.js
 * @description Integración con Google Gemini AI para análisis de mercado.
 * Envía datos OHLCV + indicadores y recibe análisis en lenguaje natural.
 * Expone window.Gemini.
 */
window.Gemini = (() => {

  // IMPORTANTE: La API key se obtiene SIEMPRE desde localStorage, nunca hardcodeada
  const GEMINI_API_KEY = () =>
    localStorage.getItem('gammatr_gemini_key') || 'YOUR_GEMINI_KEY_HERE';

  const GEMINI_MODEL = 'gemini-1.5-flash'; // Modelo rápido y económico
  const GEMINI_URL   = () =>
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY()}`;

  // ===== CONSTRUCCIÓN DEL PROMPT =====
  /**
   * @description Construye el prompt que se envía a Gemini con datos de mercado.
   * @param {string} pair - Símbolo del par ej. 'BTCUSDT'
   * @param {string} timeframe - Intervalo temporal ej. '5m'
   * @param {Array} klines - Últimas velas (hasta 50)
   * @param {Object} indicators - Indicadores calculados
   * @returns {string}
   */
  function buildPrompt(pair, timeframe, klines, indicators) {
    const price = window.GammaTR.priceData[pair]?.price;

    // Últimas 50 velas como CSV
    const last50 = klines.slice(-50);
    const ohlcvCsv = last50.map(k =>
      `${new Date(k.time).toISOString()},${k.open},${k.high},${k.low},${k.close},${k.volume}`
    ).join('\n');

    // Resumen de indicadores
    const indSummary = Signals.summarizeForGemini(indicators, price);

    return `Eres un trader profesional experto en análisis técnico de criptomonedas.
Analiza los siguientes datos del par ${pair} en timeframe ${timeframe} y proporciona un análisis detallado.

## DATOS OHLCV (últimas ${last50.length} velas)
timestamp,open,high,low,close,volume
${ohlcvCsv}

## INDICADORES TÉCNICOS
${indSummary}

## TU TAREA
Proporciona un análisis estructurado con:

1. **SEÑAL**: BUY, SELL o WAIT
2. **SCORE DE CONFIANZA**: 0-100%
3. **ANÁLISIS DE MERCADO**: Descripción del contexto actual del mercado (2-3 párrafos)
4. **RAZONAMIENTO**: Por qué recomiendas esa señal
5. **NIVEL DE RIESGO**: BAJO / MEDIO / ALTO
6. **PRECIO OBJETIVO**: Si señal es BUY/SELL, sugiere un precio objetivo realista
7. **STOP LOSS SUGERIDO**: Precio de stop loss recomendado

Responde ESTRICTAMENTE en el siguiente formato JSON (sin texto extra, sin markdown):
{
  "signal": "BUY|SELL|WAIT",
  "score": 75,
  "analysis": "Análisis detallado aquí...",
  "reasoning": "Por qué esta señal...",
  "risk": "BAJO|MEDIO|ALTO",
  "target": 85000,
  "stop_loss": 78000
}`;
  }

  // ===== LLAMADA A LA API =====
  /**
   * @description Envía datos a Gemini y devuelve el análisis parseado.
   * @param {string} pair
   * @param {string} timeframe
   * @param {Array} klines
   * @param {Object} indicators
   * @returns {Promise<{ signal: string, score: number, text: string, risk: string, target: number|null, timestamp: number }>}
   */
  async function analyze(pair, timeframe, klines, indicators) {
    const key = GEMINI_API_KEY();
    if (!key || key === 'YOUR_GEMINI_KEY_HERE') {
      throw new Error('Gemini API Key no configurada. Ve a Configuración.');
    }

    const prompt = buildPrompt(pair, timeframe, klines, indicators);

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature:     0.3,   // Baja temperatura para análisis consistente
        maxOutputTokens: 1024,
        responseMimeType: 'application/json',
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      ]
    };

    let response;
    try {
      response = await fetch(GEMINI_URL(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(`Error de red al contactar Gemini: ${err.message}`);
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      if (response.status === 400) throw new Error('API Key de Gemini inválida');
      if (response.status === 429) throw new Error('Límite de tasa de Gemini alcanzado. Espera un momento.');
      throw new Error(`Gemini API error ${response.status}: ${errorText.substring(0, 100)}`);
    }

    const data = await response.json();

    // Extraer el texto de la respuesta
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      throw new Error('Respuesta vacía de Gemini');
    }

    return parseGeminiResponse(rawText);
  }

  // ===== PARSEO DE RESPUESTA =====
  /**
   * @description Parsea la respuesta JSON de Gemini y la normaliza.
   * @param {string} rawText - Texto crudo de Gemini
   * @returns {Object}
   */
  function parseGeminiResponse(rawText) {
    let parsed;
    try {
      // Intentar parsear directamente
      parsed = JSON.parse(rawText);
    } catch (e) {
      // Intentar extraer JSON de un bloque de texto
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { parsed = JSON.parse(match[0]); }
        catch(e2) { throw new Error('No se pudo parsear la respuesta de Gemini'); }
      } else {
        throw new Error('Gemini no devolvió JSON válido');
      }
    }

    // Validar y normalizar campos
    const signal = ['BUY','SELL','WAIT'].includes(parsed.signal?.toUpperCase())
      ? parsed.signal.toUpperCase()
      : 'WAIT';

    const score = Math.max(0, Math.min(100, parseInt(parsed.score) || 50));

    const text = [
      parsed.analysis || '',
      parsed.reasoning ? `\n\nRazonamiento: ${parsed.reasoning}` : '',
    ].filter(Boolean).join('').trim() || 'Sin análisis disponible.';

    const risk   = ['BAJO','MEDIO','ALTO'].includes(parsed.risk?.toUpperCase())
      ? parsed.risk.toUpperCase()
      : 'MEDIO';

    const target   = parseFloat(parsed.target)   || null;
    const stopLoss = parseFloat(parsed.stop_loss) || null;

    return {
      signal,
      score,
      text,
      risk,
      target,
      stopLoss,
      timestamp: Date.now(),
      raw: parsed,
    };
  }

  // ===== ANÁLISIS RÁPIDO (sin historial, solo señal) =====
  /**
   * @description Versión rápida que solo pide señal + score, sin análisis completo.
   * Útil para refrescar señales en background.
   * @param {string} pair
   * @param {Object} indicators
   * @param {number} price
   * @returns {Promise<{ signal: string, score: number }>}
   */
  async function quickSignal(pair, indicators, price) {
    const key = GEMINI_API_KEY();
    if (!key || key === 'YOUR_GEMINI_KEY_HERE') return null;

    const indSummary = Signals.summarizeForGemini(indicators, price);
    const prompt = `Par: ${pair}. Precio: $${price}.
${indSummary}
Responde solo: {"signal":"BUY|SELL|WAIT","score":75}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 64, responseMimeType: 'application/json' }
    };

    try {
      const res = await fetch(GEMINI_URL(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) return null;
      const data = await res.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) return null;
      const parsed = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] || '{}');
      return {
        signal: ['BUY','SELL','WAIT'].includes(parsed.signal) ? parsed.signal : 'WAIT',
        score:  Math.max(0, Math.min(100, parseInt(parsed.score) || 50)),
      };
    } catch(e) {
      return null;
    }
  }

  // API pública
  return { analyze, quickSignal, buildPrompt };

})();
