/**
 * @file state.js
 * @description Estado global de GammaTR. Debe cargarse ANTES que cualquier otro módulo.
 */
window.GammaTR = {
  pairs: ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','DOGEUSDT',
          'ADAUSDT','XRPUSDT','TRXUSDT','LINKUSDT','WIFUSDT'],
  priceData:         {},
  klineCache:        {},
  indicators:        {},
  signals:           {},
  alerts:            [],
  selectedPair:      'BTCUSDT',
  selectedTimeframe: '5m',
  signalHistory:     [],
  config: {
    geminiKey:    '',
    supabaseUrl:  '',
    supabaseKey:  '',
    theme:        'dark',
  },
  chart:       null,
  touchStartX: 0,
};
