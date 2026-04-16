/**
 * @file signals.js
 * @description Lógica de generación de señales BUY/SELL/WAIT basada en indicadores técnicos.
 * Sistema de puntuación ponderada multi-indicador.
 * Expone window.Signals.
 */
window.Signals = (() => {

  // ===== PESOS DE CADA INDICADOR EN LA SEÑAL FINAL =====
  const WEIGHTS = {
    rsi:    25,   // RSI: 25% del score
    macd:   30,   // MACD: 30% del score
    ema:    25,   // EMA cross: 25% del score
    bb:     15,   // Bollinger: 15% del score
    volume:  5,   // Volumen: 5% del score
  };

  // ===== EVALUADORES POR INDICADOR =====

  /**
   * @description Evalúa el RSI y devuelve puntuación de dirección.
   * Devuelve valor entre -100 (muy bajista) y +100 (muy alcista).
   * @param {{ value: number, signal: string }} rsi
   * @returns {number}
   */
  function scoreRSI(rsi) {
    if (!rsi) return 0;
    const v = rsi.value;
    if (v < 25)  return 90;   // Sobreventa extrema → fuerte señal de compra
    if (v < 30)  return 70;   // Sobreventa → compra
    if (v < 40)  return 30;   // Ligeramente sobrevendido
    if (v < 60)  return 0;    // Zona neutral
    if (v < 70)  return -30;  // Ligeramente sobrecomprado
    if (v < 75)  return -70;  // Sobrecompra → venta
    return -90;               // Sobrecompra extrema → fuerte venta
  }

  /**
   * @description Evalúa el MACD y devuelve puntuación de dirección.
   * @param {{ macd: number, signal: number, histogram: number, trend: string }} macd
   * @returns {number}
   */
  function scoreMACD(macd) {
    if (!macd) return 0;
    const { histogram, trend } = macd;

    let score = 0;
    // Cruce reciente pesa más
    if (trend === 'bullish_cross') score = 90;
    else if (trend === 'bearish_cross') score = -90;
    else if (trend === 'bullish') score = 50;
    else if (trend === 'bearish') score = -50;

    // Ajuste por magnitud del histograma (histograma grande = momentum fuerte)
    const histBonus = Math.min(Math.abs(histogram) / 0.001 * 10, 20);
    score += histogram >= 0 ? histBonus : -histBonus;

    return Math.max(-100, Math.min(100, score));
  }

  /**
   * @description Evalúa el cruce de EMAs.
   * @param {{ ema9: number, ema21: number, cross: string }} ema
   * @returns {number}
   */
  function scoreEMA(ema) {
    if (!ema) return 0;
    const { cross, ema9, ema21 } = ema;
    if (!ema9 || !ema21) return 0;

    const pct = ((ema9 - ema21) / ema21) * 100;

    if (cross === 'bullish') {
      return Math.min(60 + pct * 10, 90); // Cruce alcista
    } else if (cross === 'bearish') {
      return Math.max(-60 + pct * 10, -90); // Cruce bajista
    }
    return pct * 5; // Sin cruce reciente: pequeño bias
  }

  /**
   * @description Evalúa las Bandas de Bollinger.
   * @param {{ upper: number, middle: number, lower: number, percentB: number }} bb
   * @param {number} price - Precio actual
   * @returns {number}
   */
  function scoreBB(bb, price) {
    if (!bb || !price) return 0;
    const { percentB } = bb;

    if (percentB < 5)  return 85;   // Precio rozando banda inferior → rebote probable
    if (percentB < 20) return 50;   // Precio en zona baja
    if (percentB < 40) return 20;   // Ligeramente bajo
    if (percentB < 60) return 0;    // Centro de la banda
    if (percentB < 80) return -20;  // Ligeramente alto
    if (percentB < 95) return -50;  // Precio en zona alta
    return -85;                     // Precio rozando banda superior → corrección probable
  }

  /**
   * @description Evalúa la tendencia de volumen.
   * @param {{ trend: string }} volume
   * @returns {number}
   */
  function scoreVolume(volume) {
    if (!volume) return 0;
    if (volume.trend === 'rising')  return 50;
    if (volume.trend === 'falling') return -50;
    return 0;
  }

  // ===== GENERACIÓN DE SEÑAL FINAL =====

  /**
   * @description Genera una señal BUY/SELL/WAIT basada en todos los indicadores.
   * @param {Object} indicators - Resultado de Indicators.calculateAll()
   * @param {number} price - Precio actual del par
   * @returns {{ type: 'BUY'|'SELL'|'WAIT', score: number, reasoning: string, breakdown: Object }}
   */
  function generate(indicators, price) {
    if (!indicators) return { type: 'WAIT', score: 50, reasoning: 'Sin datos suficientes', breakdown: {} };

    const scores = {
      rsi:    scoreRSI(indicators.rsi),
      macd:   scoreMACD(indicators.macd),
      ema:    scoreEMA(indicators.ema),
      bb:     scoreBB(indicators.bb, price),
      volume: scoreVolume(indicators.volume),
    };

    // Score ponderado: de -100 a +100
    const weightedScore =
      (scores.rsi    * WEIGHTS.rsi  +
       scores.macd   * WEIGHTS.macd +
       scores.ema    * WEIGHTS.ema  +
       scores.bb     * WEIGHTS.bb   +
       scores.volume * WEIGHTS.volume) / 100;

    // Convertir a rango 0-100 para el UI (50 = neutral)
    const uiScore = Math.round(50 + weightedScore / 2);

    // Determinar tipo de señal
    let type = 'WAIT';
    let confScore = uiScore;

    if (weightedScore >= 30) {
      type = 'BUY';
      confScore = Math.min(uiScore, 95);
    } else if (weightedScore <= -30) {
      type = 'SELL';
      confScore = Math.max(100 - uiScore, 5);
    }

    // Construir reasoning en español
    const parts = [];
    if (indicators.rsi) {
      const r = indicators.rsi;
      if (r.value < 30) parts.push(`RSI sobrevendido (${r.value.toFixed(0)})`);
      else if (r.value > 70) parts.push(`RSI sobrecomprado (${r.value.toFixed(0)})`);
    }
    if (indicators.macd) {
      const m = indicators.macd;
      if (m.trend === 'bullish_cross') parts.push('MACD cruce alcista');
      else if (m.trend === 'bearish_cross') parts.push('MACD cruce bajista');
      else if (m.trend === 'bullish') parts.push('MACD momentum positivo');
      else parts.push('MACD momentum negativo');
    }
    if (indicators.ema) {
      const e = indicators.ema;
      if (e.cross === 'bullish') parts.push('EMA9 > EMA21 (alcista)');
      else if (e.cross === 'bearish') parts.push('EMA9 < EMA21 (bajista)');
    }
    if (indicators.bb) {
      const b = indicators.bb;
      if (b.percentB < 20) parts.push('Precio en banda Bollinger inferior');
      else if (b.percentB > 80) parts.push('Precio en banda Bollinger superior');
    }

    const reasoning = parts.length
      ? parts.join(' | ')
      : 'Señal débil — mercado lateral';

    return {
      type,
      score: confScore,
      reasoning,
      breakdown: scores,
      raw: parseFloat(weightedScore.toFixed(2)),
    };
  }

  /**
   * @description Genera un resumen textual de los indicadores para enviar a Gemini.
   * @param {Object} indicators
   * @param {number} price
   * @returns {string}
   */
  function summarizeForGemini(indicators, price) {
    if (!indicators) return '';
    const { rsi, macd, ema, bb } = indicators;
    const sig = generate(indicators, price);

    return `
PRECIO ACTUAL: $${price || 'N/A'}

RSI (14): ${rsi?.value?.toFixed(2) || 'N/A'} — ${rsi?.signal || 'N/A'}

MACD:
  MACD Line: ${macd?.macd || 'N/A'}
  Signal Line: ${macd?.signal || 'N/A'}
  Histograma: ${macd?.histogram || 'N/A'}
  Tendencia: ${macd?.trend || 'N/A'}

EMA:
  EMA 9:  ${ema?.ema9?.toFixed(4) || 'N/A'}
  EMA 21: ${ema?.ema21?.toFixed(4) || 'N/A'}
  Cruce:  ${ema?.cross || 'N/A'}

Bollinger Bands (20, 2σ):
  Superior: ${bb?.upper?.toFixed(4) || 'N/A'}
  Media:    ${bb?.middle?.toFixed(4) || 'N/A'}
  Inferior: ${bb?.lower?.toFixed(4) || 'N/A'}
  %B:       ${bb?.percentB?.toFixed(1) || 'N/A'}%

SEÑAL TÉCNICA CALCULADA: ${sig.type} (Score: ${sig.score}%)
Razonamiento: ${sig.reasoning}
    `.trim();
  }

  // API pública
  return { generate, summarizeForGemini, scoreRSI, scoreMACD, scoreEMA, scoreBB };

})();
