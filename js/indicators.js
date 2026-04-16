/**
 * @file indicators.js
 * @description Indicadores técnicos con arrays alineados para Chart.js.
 */
window.Indicators = (() => {

  /** EMA clásica. result[0] = closes[period-1]. */
  function ema(closes, period) {
    if (closes.length < period) return [];
    const k = 2 / (period + 1);
    let val = closes.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const result = [val];
    for (let i = period; i < closes.length; i++) {
      val = closes[i] * k + val * (1 - k);
      result.push(val);
    }
    return result;
  }

  /** EMA alineada con closes (nulls en warmup). */
  function emaAligned(closes, period) {
    return [...new Array(period - 1).fill(null), ...ema(closes, period)];
  }

  /** RSI array alineado. */
  function rsiAligned(closes, period = 14) {
    const result = new Array(period).fill(null);
    if (closes.length <= period) return result;
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const d = closes[i] - closes[i - 1];
      if (d > 0) avgGain += d; else avgLoss -= d;
    }
    avgGain /= period; avgLoss /= period;
    const toRSI = (g, l) => l === 0 ? 100 : +(100 - 100 / (1 + g / l)).toFixed(2);
    result.push(toRSI(avgGain, avgLoss));
    for (let i = period + 1; i < closes.length; i++) {
      const d = closes[i] - closes[i - 1];
      avgGain = (avgGain * (period - 1) + (d > 0 ? d : 0)) / period;
      avgLoss = (avgLoss * (period - 1) + (d < 0 ? -d : 0)) / period;
      result.push(toRSI(avgGain, avgLoss));
    }
    return result;
  }

  /** MACD/Signal/Hist arrays alineados. */
  function macdAligned(closes, fast = 12, slow = 26, sig = 9) {
    const len = closes.length;
    const empty = () => new Array(len).fill(null);
    const fastE = ema(closes, fast);
    const slowE = ema(closes, slow);
    if (!slowE.length) return { macdArr: empty(), signalArr: empty(), histArr: empty() };
    const off = fastE.length - slowE.length;
    const macdLine   = slowE.map((s, i) => fastE[i + off] - s);
    const signalLine = ema(macdLine, sig);
    const histOff    = macdLine.length - signalLine.length;
    const histogram  = signalLine.map((s, i) => macdLine[i + histOff] - s);
    return {
      macdArr:   [...new Array(slow - 1).fill(null),           ...macdLine],
      signalArr: [...new Array(slow - 1 + sig - 1).fill(null), ...signalLine],
      histArr:   [...new Array(slow - 1 + sig - 1).fill(null), ...histogram],
    };
  }

  /** Bollinger Bands. */
  function calculateBB(closes, period = 20, mult = 2) {
    if (closes.length < period) {
      const p = closes[closes.length - 1] || 0;
      return { upper: p, middle: p, lower: p, percentB: 50, bandwidth: 0 };
    }
    const slice = closes.slice(-period);
    const sma   = slice.reduce((a, b) => a + b, 0) / period;
    const std   = Math.sqrt(slice.reduce((s, v) => s + (v - sma) ** 2, 0) / period);
    const upper = sma + mult * std, lower = sma - mult * std;
    const price = closes[closes.length - 1];
    return {
      upper, middle: sma, lower,
      percentB:  upper === lower ? 50 : ((price - lower) / (upper - lower)) * 100,
      bandwidth: sma === 0 ? 0 : ((upper - lower) / sma) * 100,
    };
  }

  /**
   * @description Construye todos los datos para los 3 charts + tarjetas educativas.
   * @param {Array} klines - [{ time, open, high, low, close, volume }]
   * @returns {{ last: Object, arrays: Object }}
   */
  function buildChartData(klines) {
    const closes = klines.map(k => k.close);
    const times  = klines.map(k => k.time);

    const ema9Arr  = emaAligned(closes, 9);
    const ema21Arr = emaAligned(closes, 21);
    const rsiArr   = rsiAligned(closes, 14);
    const { macdArr, signalArr, histArr } = macdAligned(closes);

    const toXY = (arr) => arr.map((v, i) =>
      v !== null ? { x: times[i], y: +Number(v).toFixed(6) } : null);

    const arrays = {
      candle: klines.map(k => ({ x: k.time, o: k.open, h: k.high, l: k.low, c: k.close })),
      ema9:   toXY(ema9Arr),
      ema21:  toXY(ema21Arr),
      macd:   toXY(macdArr),
      signal: toXY(signalArr),
      hist:   toXY(histArr),
      rsi:    toXY(rsiArr),
    };

    const lastOf  = arr => [...arr].reverse().find(v => v !== null) ?? 0;
    const prevOf  = arr => { const v = arr.filter(x => x !== null); return v[v.length - 2] ?? 0; };

    const lastEMA9  = lastOf(ema9Arr);
    const lastEMA21 = lastOf(ema21Arr);
    const lastRSI   = lastOf(rsiArr);
    const lastMACD  = lastOf(macdArr);
    const lastSig   = lastOf(signalArr);
    const lastHist  = lastOf(histArr);
    const prevHist  = prevOf(histArr);

    let macdTrend = 'neutral';
    if (prevHist <= 0 && lastHist > 0)       macdTrend = 'bullish_cross';
    else if (prevHist >= 0 && lastHist < 0)  macdTrend = 'bearish_cross';
    else if (lastHist > 0)                   macdTrend = 'bullish';
    else if (lastHist < 0)                   macdTrend = 'bearish';

    let emaCross = 'neutral';
    const pv9 = prevOf(ema9Arr), pv21 = prevOf(ema21Arr);
    if (pv9 !== 0 && pv21 !== 0) {
      if (pv9 <= pv21 && lastEMA9 > lastEMA21)       emaCross = 'bullish';
      else if (pv9 >= pv21 && lastEMA9 < lastEMA21)  emaCross = 'bearish';
      else emaCross = lastEMA9 > lastEMA21 ? 'bullish' : 'bearish';
    }

    const bb = calculateBB(closes);

    return {
      arrays,
      last: {
        rsi:  { value: lastRSI },
        macd: { macd: lastMACD, signal: lastSig, histogram: lastHist, trend: macdTrend },
        ema:  { ema9: lastEMA9, ema21: lastEMA21, cross: emaCross },
        bb, closes,
        price: closes[closes.length - 1] || 0,
      },
    };
  }

  return { ema, emaAligned, rsiAligned, macdAligned, calculateBB, buildChartData };
})();
