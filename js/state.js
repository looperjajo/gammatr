/**
 * @file state.js
 * @description Estado global de GammaTR. Carga ANTES que cualquier otro módulo.
 */
window.GammaTR = {
  pairs: ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','DOGEUSDT',
          'ADAUSDT','XRPUSDT','TRXUSDT','LINKUSDT','WIFUSDT'],
  priceData:         {},   // par → { price, change, volume }
  klineCache:        {},   // "BTCUSDT_5m" → [{ time, open, high, low, close, volume }]
  indicatorCache:    {},   // "BTCUSDT_5m" → { last: {...}, arrays: {...} }
  signals:           {},   // par → { type, score, reasoning }
  alerts:            [],
  selectedPair:      'BTCUSDT',
  selectedTimeframe: '5m',
  signalHistory:     [],
  geminiAnalysis:    {},   // par → análisis más reciente
  geminiTimer:       null,
  config: {
    geminiKey:        '',
    supabaseUrl:      '',
    supabaseKey:      '',
    theme:            'dark',
    defaultTimeframe: '5m',
    notificationsOn:  true,
    soundOn:          true,
  },
  charts: {
    candle: null,
    macd:   null,
    rsi:    null,
  },
  touchStartX: 0,
};
