/**
 * @file signals.js
 * @description Scoring para señales BUY/SELL/WAIT basado en confluencia de indicadores.
 */
window.Signals = (() => {

  /**
   * @description Genera señal y score 0-100 a partir de los indicadores calculados.
   * @param {Object} ind - { rsi, macd, ema, bb }
   * @param {number} price - Precio actual
   * @param {number} change1h - Cambio % última hora
   * @returns {{ type: string, score: number, reasoning: string }}
   */
  function generate(ind, price, change1h = 0) {
    if (!ind) return { type: 'WAIT', score: 50, reasoning: 'Sin datos' };

    let buyPts = 0, sellPts = 0;
    const reasons = [];

    const r  = ind.rsi?.value  ?? 50;
    const m  = ind.macd        ?? {};
    const e  = ind.ema         ?? {};
    const bb = ind.bb          ?? {};

    // RSI — máx 20 pts BUY / 20 pts SELL
    if      (r < 35) { buyPts  += 20; reasons.push(`RSI ${r.toFixed(1)} sobreventa`); }
    else if (r < 45) { buyPts  += 10; reasons.push(`RSI ${r.toFixed(1)} bajo`); }
    else if (r > 65) { sellPts += 10; reasons.push(`RSI ${r.toFixed(1)} alto`); }
    if       (r > 65){ sellPts += 10; } // doble penalización si >65

    // MACD — máx 25 pts
    const t = m.trend || 'neutral';
    if      (t === 'bullish_cross') { buyPts  += 25; reasons.push('MACD cruce alcista ↑'); }
    else if (t === 'bearish_cross') { sellPts += 25; reasons.push('MACD cruce bajista ↓'); }
    else if (t === 'bullish')       { buyPts  += 10; }
    else if (t === 'bearish')       { sellPts += 10; }

    // EMA 9/21 — máx 20 pts
    if      (e.cross === 'bullish') { buyPts  += 20; reasons.push('EMA9 > EMA21 alcista'); }
    else if (e.cross === 'bearish') { sellPts += 20; reasons.push('EMA9 < EMA21 bajista'); }

    // Bollinger Bands — máx 15 pts
    if (bb.upper && bb.lower && price) {
      const dLow  = ((price - bb.lower) / price) * 100;
      const dHigh = ((bb.upper - price) / price) * 100;
      if (dLow  < 2) { buyPts  += 15; reasons.push('Precio ≈ banda BB inferior'); }
      if (dHigh < 2) { sellPts += 15; reasons.push('Precio ≈ banda BB superior'); }
    }

    // Cambio 1h — máx 10 pts
    if      (change1h > 0)  { buyPts  += 10; }
    else if (change1h < 0)  { sellPts += 10; }

    // Decisión final
    const MAX = 80;
    let type = 'WAIT', score = 50;

    if (buyPts >= 60) {
      type  = 'BUY';
      score = Math.min(Math.round(50 + (buyPts  / MAX) * 50), 95);
    } else if (sellPts >= 60) {
      type  = 'SELL';
      score = Math.min(Math.round(50 + (sellPts / MAX) * 50), 95);
    } else {
      score = Math.round(50 + ((buyPts - sellPts) / MAX) * 30);
      score = Math.max(20, Math.min(score, 80));
    }

    return { type, score, reasoning: reasons.join(' | ') || 'Sin confluencia clara' };
  }

  /**
   * @description Texto resumen de indicadores para el prompt de Gemini.
   * @param {Object} ind @param {number} price @param {string} pair @param {Array} klines
   * @returns {string}
   */
  function summaryForGemini(ind, price, pair, klines = []) {
    const r  = ind?.rsi?.value ?? 0;
    const m  = ind?.macd ?? {};
    const e  = ind?.ema  ?? {};
    const bb = ind?.bb   ?? {};
    const last10 = klines.slice(-10).map(k =>
      `${new Date(k.time).toISOString().substring(11,16)} O:${k.open.toFixed(2)} H:${k.high.toFixed(2)} L:${k.low.toFixed(2)} C:${k.close.toFixed(2)} V:${Math.round(k.volume)}`
    ).join('\n');

    return `Par: ${pair}
Precio actual: ${price}
RSI(14): ${r.toFixed(2)}
MACD: ${(m.macd||0).toFixed(5)} | Signal: ${(m.signal||0).toFixed(5)} | Histograma: ${(m.histogram||0).toFixed(5)}
EMA9: ${(e.ema9||0).toFixed(4)} | EMA21: ${(e.ema21||0).toFixed(4)}
Bollinger Upper: ${(bb.upper||0).toFixed(4)} | Lower: ${(bb.lower||0).toFixed(4)}
Últimas 10 velas (OHLCV):
${last10}`;
  }

  return { generate, summaryForGemini };
})();
