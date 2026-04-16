/**
 * @file indicators.js
 * @description Cálculo de indicadores técnicos: RSI, MACD, EMA, Bollinger Bands.
 * Todas las funciones son puras (sin efectos secundarios).
 * Expone window.Indicators.
 */
window.Indicators = (() => {

  // ===== EMA =====
  /**
   * @description Calcula la Media Móvil Exponencial (EMA).
   * @param {number[]} closes - Array de precios de cierre (orden cronológico)
   * @param {number} period - Período de la EMA
   * @returns {number[]} - Array de valores EMA
   */
  function ema(closes, period) {
    if (closes.length < period) return [];
    const k = 2 / (period + 1);
    const result = [];

    // SMA inicial para el primer valor
    let sum = 0;
    for (let i = 0; i < period; i++) sum += closes[i];
    let emaVal = sum / period;
    result.push(emaVal);

    for (let i = period; i < closes.length; i++) {
      emaVal = closes[i] * k + emaVal * (1 - k);
      result.push(emaVal);
    }

    return result;
  }

  /**
   * @description Devuelve el último valor de EMA para un período dado.
   * @param {number[]} closes
   * @param {number} period
   * @returns {number|null}
   */
  function lastEMA(closes, period) {
    const arr = ema(closes, period);
    return arr.length ? arr[arr.length - 1] : null;
  }

  // ===== RSI =====
  /**
   * @description Calcula el RSI (Relative Strength Index).
   * @param {number[]} closes - Array de cierres
   * @param {number} period - Período (14 por defecto)
   * @returns {{ value: number, signal: string }}
   */
  function calculateRSI(closes, period = 14) {
    if (closes.length < period + 1) return { value: 50, signal: 'neutral' };

    let gains = 0, losses = 0;

    // Cálculo inicial de ganancias y pérdidas promedio
    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains  += diff;
      else           losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    // Suavizado de Wilder para el resto
    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0  ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
    }

    const rs    = avgLoss === 0 ? 100 : avgGain / avgLoss;
    const value = parseFloat((100 - 100 / (1 + rs)).toFixed(2));

    let signal = 'neutral';
    if (value < 30) signal = 'oversold';   // Sobreventa → posible compra
    else if (value > 70) signal = 'overbought'; // Sobrecompra → posible venta

    return { value, signal };
  }

  // ===== MACD =====
  /**
   * @description Calcula el MACD (Moving Average Convergence Divergence).
   * @param {number[]} closes
   * @param {number} fastPeriod - EMA rápida (12)
   * @param {number} slowPeriod - EMA lenta (26)
   * @param {number} signalPeriod - Señal (9)
   * @returns {{ macd: number, signal: number, histogram: number, trend: string }}
   */
  function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
    if (closes.length < slowPeriod + signalPeriod) {
      return { macd: 0, signal: 0, histogram: 0, trend: 'neutral' };
    }

    const fastEMA = ema(closes, fastPeriod);
    const slowEMA = ema(closes, slowPeriod);

    // La EMA lenta empieza en index (slowPeriod - 1) del array de cierres
    // La EMA rápida empieza antes — alinear por el final
    const offset = fastEMA.length - slowEMA.length;
    const macdLine = slowEMA.map((s, i) => fastEMA[i + offset] - s);

    const signalLine = ema(macdLine, signalPeriod);
    const lastMACD   = macdLine[macdLine.length - 1];
    const lastSignal = signalLine[signalLine.length - 1];
    const histogram  = parseFloat((lastMACD - lastSignal).toFixed(6));

    let trend = 'neutral';
    if (histogram > 0 && macdLine[macdLine.length - 2] < signalLine[signalLine.length - 2]) {
      trend = 'bullish_cross'; // Cruce alcista reciente
    } else if (histogram < 0 && macdLine[macdLine.length - 2] > signalLine[signalLine.length - 2]) {
      trend = 'bearish_cross'; // Cruce bajista reciente
    } else if (histogram > 0) {
      trend = 'bullish';
    } else {
      trend = 'bearish';
    }

    return {
      macd:      parseFloat(lastMACD.toFixed(6)),
      signal:    parseFloat(lastSignal.toFixed(6)),
      histogram: parseFloat(histogram.toFixed(6)),
      trend,
    };
  }

  // ===== BOLLINGER BANDS =====
  /**
   * @description Calcula las Bandas de Bollinger.
   * @param {number[]} closes
   * @param {number} period - Período de la SMA (20)
   * @param {number} stdDevMultiplier - Multiplicador de desviación estándar (2)
   * @returns {{ upper: number, middle: number, lower: number, bandwidth: number, percentB: number }}
   */
  function calculateBollingerBands(closes, period = 20, stdDevMultiplier = 2) {
    if (closes.length < period) {
      const price = closes[closes.length - 1] || 0;
      return { upper: price, middle: price, lower: price, bandwidth: 0, percentB: 50 };
    }

    // Usar los últimos `period` cierres
    const slice = closes.slice(-period);
    const sma = slice.reduce((a, b) => a + b, 0) / period;

    // Desviación estándar poblacional
    const variance = slice.reduce((sum, v) => sum + Math.pow(v - sma, 2), 0) / period;
    const stdDev   = Math.sqrt(variance);

    const upper = sma + stdDevMultiplier * stdDev;
    const lower = sma - stdDevMultiplier * stdDev;
    const bandwidth = upper - lower === 0 ? 0 : ((upper - lower) / sma) * 100;
    const price = closes[closes.length - 1];
    const percentB = upper - lower === 0 ? 50 : ((price - lower) / (upper - lower)) * 100;

    return {
      upper:     parseFloat(upper.toFixed(8)),
      middle:    parseFloat(sma.toFixed(8)),
      lower:     parseFloat(lower.toFixed(8)),
      bandwidth: parseFloat(bandwidth.toFixed(2)),
      percentB:  parseFloat(percentB.toFixed(2)),
    };
  }

  // ===== VOLUMEN (OBV simplificado) =====
  /**
   * @description Calcula On-Balance Volume simplificado para detectar tendencia de volumen.
   * @param {Array} klines - Array de { close, volume }
   * @returns {{ trend: 'rising'|'falling'|'neutral' }}
   */
  function calculateVolumeTrend(klines) {
    if (klines.length < 10) return { trend: 'neutral' };
    const recent = klines.slice(-10);
    let obv = 0;
    const obvArr = [0];
    for (let i = 1; i < recent.length; i++) {
      if (recent[i].close > recent[i-1].close)      obv += recent[i].volume;
      else if (recent[i].close < recent[i-1].close) obv -= recent[i].volume;
      obvArr.push(obv);
    }
    const slope = obvArr[obvArr.length - 1] - obvArr[0];
    return { trend: slope > 0 ? 'rising' : slope < 0 ? 'falling' : 'neutral', obv: parseFloat(obv.toFixed(2)) };
  }

  // ===== CÁLCULO CONJUNTO =====
  /**
   * @description Calcula todos los indicadores para un array de velas.
   * @param {number[]} closes - Array de precios de cierre
   * @param {Array} klines - Array completo de velas { time, open, high, low, close, volume }
   * @returns {Object} - Todos los indicadores calculados
   */
  function calculateAll(closes, klines = []) {
    const rsi  = calculateRSI(closes);
    const macd = calculateMACD(closes);
    const bb   = calculateBollingerBands(closes);

    const ema9Val  = lastEMA(closes, 9);
    const ema21Val = lastEMA(closes, 21);
    const ema50Val = lastEMA(closes, 50);

    // Detectar cruce EMA 9/21
    let emaCross = 'neutral';
    const ema9Arr  = ema(closes, 9);
    const ema21Arr = ema(closes, 21);
    const offset   = ema9Arr.length - ema21Arr.length;
    if (ema9Arr.length >= 2 && ema21Arr.length >= 2) {
      const prevDiff = ema9Arr[ema9Arr.length - 2] - ema21Arr[ema21Arr.length - 2 - offset + offset];
      const currDiff = ema9Val - ema21Val;
      if (prevDiff < 0 && currDiff >= 0) emaCross = 'bullish';
      else if (prevDiff > 0 && currDiff <= 0) emaCross = 'bearish';
      else emaCross = currDiff > 0 ? 'bullish' : 'bearish';
    }

    const volumeTrend = calculateVolumeTrend(klines);

    return {
      rsi,
      macd,
      bb,
      ema: {
        ema9:  parseFloat((ema9Val || 0).toFixed(8)),
        ema21: parseFloat((ema21Val || 0).toFixed(8)),
        ema50: parseFloat((ema50Val || 0).toFixed(8)),
        cross: emaCross,
      },
      volume: volumeTrend,
      closes, // Pasar los cierres para uso en signals.js
    };
  }

  // API pública
  return {
    ema,
    lastEMA,
    calculateRSI,
    calculateMACD,
    calculateBollingerBands,
    calculateVolumeTrend,
    calculateAll,
  };

})();
