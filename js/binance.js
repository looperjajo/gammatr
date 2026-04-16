/**
 * @file binance.js
 * @description Gestión de WebSocket y REST API de Binance para datos de mercado en tiempo real.
 * Expone métodos en window.Binance.
 */
window.Binance = (() => {

  const App = window.GammaTR;

  const WS_BASE  = 'wss://stream.binance.com:9443/stream';
  const REST_BASE = 'https://api.binance.com/api/v3';

  let wsConn = null;          // Conexión WebSocket activa
  let reconnectTimer = null;  // Timer de reconexión
  let reconnectDelay = 3000;  // Delay inicial de reconexión (ms)
  let isConnecting = false;

  // ===== WEBSOCKET =====

  /**
   * @description Establece conexión WebSocket con Binance para los pares y timeframe dados.
   * Suscribe a: miniTicker (precios) + kline (velas) para el par seleccionado.
   * @param {string[]} pairs - Array de símbolos ej. ['BTCUSDT','ETHUSDT']
   * @param {string} timeframe - Intervalo de kline ej. '5m'
   */
  function connect(pairs, timeframe) {
    if (isConnecting) return;
    isConnecting = true;
    setStatus('connecting');

    // Stream combinado: miniTicker para todos los pares + klines del par seleccionado
    const streams = [
      ...pairs.map(p => `${p.toLowerCase()}@miniTicker`),
      `${App.selectedPair.toLowerCase()}@kline_${timeframe}`,
    ].join('/');

    const url = `${WS_BASE}?streams=${streams}`;

    wsConn = new WebSocket(url);

    wsConn.onopen = () => {
      isConnecting = false;
      reconnectDelay = 3000;
      setStatus('connected');
      console.log('[Binance WS] Conectado');
    };

    wsConn.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
      } catch (e) {
        console.warn('[Binance WS] Error parseando mensaje:', e);
      }
    };

    wsConn.onerror = (err) => {
      console.warn('[Binance WS] Error:', err);
    };

    wsConn.onclose = () => {
      isConnecting = false;
      setStatus('disconnected');
      console.warn('[Binance WS] Desconectado. Reconectando en', reconnectDelay, 'ms...');
      // Reconexión exponencial
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
        connect(App.pairs, App.selectedTimeframe);
      }, reconnectDelay);
    };
  }

  /**
   * @description Cierra la conexión WebSocket actual.
   */
  function disconnect() {
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (wsConn) {
      wsConn.onclose = null; // Evitar reconexión automática
      wsConn.close();
      wsConn = null;
    }
    setStatus('disconnected');
  }

  /**
   * @description Re-suscribe cuando cambia el timeframe o el par seleccionado.
   * @param {string} timeframe
   */
  function resubscribeAll(timeframe) {
    disconnect();
    connect(App.pairs, timeframe);
  }

  /**
   * @description Suscribe un nuevo símbolo al stream existente.
   * (Reconecta con el nuevo par incluido)
   * @param {string} symbol
   * @param {string} timeframe
   */
  function subscribeSymbol(symbol, timeframe) {
    // Reconectar con la lista actualizada
    resubscribeAll(timeframe);
  }

  /**
   * @description Procesa cada mensaje del WebSocket.
   * @param {Object} msg - Mensaje parseado
   */
  function handleMessage(msg) {
    const { stream, data } = msg;
    if (!stream || !data) return;

    if (stream.includes('@miniTicker')) {
      handleMiniTicker(data);
    } else if (stream.includes('@kline_')) {
      handleKline(data);
    }
  }

  /**
   * @description Actualiza el precio y cambio 24h de un par desde el miniTicker.
   * @param {Object} d - Datos del miniTicker de Binance
   */
  function handleMiniTicker(d) {
    const pair = d.s; // Symbol
    if (!App.pairs.includes(pair)) return;

    const price  = parseFloat(d.c); // Close price
    const open   = parseFloat(d.o); // Open 24h
    const change = ((price - open) / open) * 100;

    App.priceData[pair] = { price, change, volume: parseFloat(d.q) };
    UI.refreshPriceRow(pair);

    // Comprobar alertas de precio
    Alerts.checkPriceAlerts(pair, price);
  }

  /**
   * @description Actualiza la última vela del chart en tiempo real.
   * @param {Object} d - Datos del evento kline
   */
  function handleKline(d) {
    const k = d.k;
    const pair = k.s;
    if (pair !== App.selectedPair) return;

    const candle = {
      time:   k.t,
      open:   parseFloat(k.o),
      high:   parseFloat(k.h),
      low:    parseFloat(k.l),
      close:  parseFloat(k.c),
      volume: parseFloat(k.v),
    };

    const cacheKey = `${pair}_${App.selectedTimeframe}`;
    const klines = App.klineCache[cacheKey];
    if (!klines) return;

    // Actualizar o añadir la última vela
    const lastCandle = klines[klines.length - 1];
    if (lastCandle && lastCandle.time === candle.time) {
      klines[klines.length - 1] = candle;
    } else if (k.x) {
      // Vela cerrada — añadir nueva
      klines.push(candle);
      if (klines.length > 200) klines.shift(); // Mantener máx 200 velas
    }

    // Actualizar chart si es el par seleccionado
    if (pair === App.selectedPair && App.chart) {
      const chartData = App.chart.data.datasets[0].data;
      const lastPoint = chartData[chartData.length - 1];
      if (lastPoint && lastPoint.x === candle.time) {
        lastPoint.o = candle.open;
        lastPoint.h = candle.high;
        lastPoint.l = candle.low;
        lastPoint.c = candle.close;
      } else if (k.x) {
        chartData.push({ x: candle.time, o: candle.open, h: candle.high, l: candle.low, c: candle.close });
        if (chartData.length > 200) chartData.shift();
      }
      App.chart.update('none');
    }
  }

  // ===== REST API =====

  /**
   * @description Obtiene datos históricos de velas (klines) desde la REST API de Binance.
   * @param {string} pair - Símbolo ej. 'BTCUSDT'
   * @param {string} timeframe - Intervalo ej. '5m'
   * @param {number} limit - Número de velas a obtener (máx 1000)
   * @returns {Promise<Array>} - Array de objetos vela
   */
  async function fetchKlines(pair, timeframe, limit = 150) {
    const cacheKey = `${pair}_${timeframe}`;

    try {
      const url = `${REST_BASE}/klines?symbol=${pair}&interval=${timeframe}&limit=${limit}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const raw = await res.json();

      // Formato Binance: [openTime, open, high, low, close, volume, closeTime, ...]
      const klines = raw.map(k => ({
        time:   k[0],
        open:   parseFloat(k[1]),
        high:   parseFloat(k[2]),
        low:    parseFloat(k[3]),
        close:  parseFloat(k[4]),
        volume: parseFloat(k[5]),
      }));

      App.klineCache[cacheKey] = klines;
      return klines;

    } catch (err) {
      console.error(`[Binance REST] Error fetchKlines ${pair}:`, err);
      return App.klineCache[cacheKey] || [];
    }
  }

  /**
   * @description Obtiene el ticker de 24h para todos los pares de la lista.
   * Usado para inicializar precios antes de que lleguen datos del WebSocket.
   * @returns {Promise<void>}
   */
  async function fetchTickers() {
    try {
      const symbols = JSON.stringify(App.pairs);
      const url = `${REST_BASE}/ticker/24hr?symbols=${encodeURIComponent(symbols)}`;
      const res = await fetch(url);
      if (!res.ok) return;

      const tickers = await res.json();
      tickers.forEach(t => {
        const price  = parseFloat(t.lastPrice);
        const change = parseFloat(t.priceChangePercent);
        App.priceData[t.symbol] = { price, change, volume: parseFloat(t.quoteVolume) };
        UI.refreshPriceRow(t.symbol);
      });
    } catch (err) {
      console.warn('[Binance REST] Error fetchTickers:', err);
    }
  }

  // ===== STATUS INDICATOR =====
  /**
   * @description Actualiza el indicador de estado WS en el header.
   * @param {'connected'|'disconnected'|'connecting'} status
   */
  function setStatus(status) {
    const dot   = document.getElementById('wsIndicator');
    const label = document.getElementById('wsLabel');
    if (!dot || !label) return;

    const labelMap = {
      connected:    'Live',
      disconnected: 'Offline',
      connecting:   'Conectando...',
    };

    dot.className = `ws-dot ${status}`;
    label.textContent = labelMap[status] || status;
  }

  // API pública
  return { connect, disconnect, resubscribeAll, subscribeSymbol, fetchKlines, fetchTickers };

})();
