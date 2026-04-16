/**
 * @file gemini.js
 * @description Integración con Gemini AI para análisis de mercado.
 * La API key SIEMPRE se lee de localStorage, nunca hardcodeada.
 */
window.Gemini = (() => {

  const KEY   = () => localStorage.getItem('gammatr_gemini_key') || '';
  const MODEL = 'gemini-1.5-flash';
  const URL   = () => `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${KEY()}`;

  /**
   * @description Envía datos del par a Gemini y devuelve análisis parseado.
   * @param {string} pair @param {Object} ind @param {number} price
   * @param {string} timeframe @param {Array} klines
   * @returns {Promise<Object>}
   */
  async function analyze(pair, ind, price, timeframe, klines = []) {
    const key = KEY();
    if (!key) throw new Error('Sin Gemini API Key. Configúrala en ⚙️.');

    const context = Signals.summaryForGemini(ind, price, pair, klines);
    const change24 = window.GammaTR.priceData[pair]?.change?.toFixed(2) ?? '0';

    const prompt = `Analiza este activo de crypto para trading de scalping (sin apalancamiento):
${context}
Cambio 24h: ${change24}%
Timeframe: ${timeframe}

Responde en español con exactamente este formato JSON (sin texto extra):
{
  "resumen": "análisis en 2-3 frases",
  "señal": "BUY|SELL|WAIT",
  "confianza": 75,
  "razonamiento": "por qué esta señal en 1 frase",
  "riesgo": "BAJO|MEDIO|ALTO",
  "precio_objetivo": null
}`;

    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.25,
        maxOutputTokens: 512,
        responseMimeType: 'application/json',
      },
    };

    const res = await fetch(URL(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      if (res.status === 400) throw new Error('Gemini API Key inválida');
      if (res.status === 429) throw new Error('Límite de tasa Gemini alcanzado. Espera un momento.');
      throw new Error(`Gemini error ${res.status}`);
    }

    const data = await res.json();
    const raw  = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) throw new Error('Respuesta vacía de Gemini');

    return parse(raw, pair, price);
  }

  /**
   * @description Parsea y normaliza la respuesta JSON de Gemini.
   * @param {string} raw @param {string} pair @param {number} price
   * @returns {Object}
   */
  function parse(raw, pair, price) {
    let obj;
    try {
      obj = JSON.parse(raw);
    } catch {
      const m = raw.match(/\{[\s\S]*\}/);
      if (m) obj = JSON.parse(m[0]);
      else throw new Error('Gemini no devolvió JSON válido');
    }

    const signal = ['BUY','SELL','WAIT'].includes(obj['señal']?.toUpperCase())
      ? obj['señal'].toUpperCase() : 'WAIT';

    return {
      signal,
      confidence: Math.max(0, Math.min(100, parseInt(obj.confianza) || 50)),
      summary:    obj.resumen    || '—',
      reasoning:  obj.razonamiento || '—',
      risk:       ['BAJO','MEDIO','ALTO'].includes(obj.riesgo?.toUpperCase()) ? obj.riesgo.toUpperCase() : 'MEDIO',
      target:     parseFloat(obj.precio_objetivo) || null,
      pair,
      price,
      timestamp:  Date.now(),
    };
  }

  return { analyze };
})();
