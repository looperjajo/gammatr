/**
 * @file binance.js
 * @description WebSocket y REST API de Binance. Reconexión exponencial automática.
 */
window.Binance = (() => {

  const WS_BASE   = 'wss://stream.binance.com:9443/stream';
  const REST_BASE = 'https://api.binance.com/api/v3';
  const App = window.GammaTR;

  let ws = null;
  let reconnectDelay = 3000;
  let reconnectTimer = null;
  let active = false;

  // ===== WEBSOCKET =====

  /**
   * @description Conecta WebSocket combinado: miniTicker de todos los pares + kline del par activo.
   * @param {string[]} pairs @param {string} timeframe
   */
  function connect(pairs, timeframe) {
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    active = true;
    setStatus('connecting');

    const streams = [
      ...pairs.map(p => `${p.toLowerCase()}@miniTicker`),
      `${App.selectedPair.toLowerCase()}@kline_${timeframe}`,
    ].join('/');

    ws = new WebSocket(`${WS_BASE}?streams=${streams}`);

    ws.onopen = () => {
      reconnectDelay = 3000;
      setStatus('connected');
    };

    ws.onmessage = ({ data }) => {
      try { handleMsg(JSON.parse(data)); } catch (e) {}
    };

    ws.onerror = () => {};

    ws.onclose = () => {
      setStatus('disconnected');
      if (!active) return;
      reconnectTimer = setTimeout(() => {
        reconnectDelay = Math.min(reconnectDelay * 1.5, 30000);
        connect(App.pairs, App.selectedTimeframe);
      }, reconnectDelay);
    };
  }

  /**
   * @description Reconecta con el estado actual (tras cambio de timeframe o par).
   * @param {string[]} pairs @param {string} timeframe
   */
  function resubscribe(pairs, timeframe) {
    active = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    setTimeout(() => { active = true; connect(pairs, timeframe); }, 200);
  }

  function disconnect() {
    active = false;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) { ws.onclose = null; ws.close(); ws = null; }
    setStatus('disconnected');
  }

  // ===== HANDLERS =====

  function handleMsg(msg) {
    const { stream, data } = msg;
    if (!stream || !data) return;
    if (stream.includes('@miniTicker')) handleTicker(data);
    else if (stream.includes('@kline_'))  handleKline(data);
  }

  /** @description Actualiza precio y cambio 24h en App.priceData. */
  function handleTicker(d) {
    const pair = d.s;
    if (!App.pairs.includes(pair)) return;
    const price  = parseFloat(d.c);
    const open   = parseFloat(d.o);
    const change = ((price - open) / open) * 100;
    App.priceData[pair] = { price, change, volume: parseFloat(d.q) };
    UI.refreshPriceRow(pair);
    // Comprobar alertas de precio/cambio
    const ind = App.indicatorCache[`${pair}_${App.selectedTimeframe}`]?.last;
    Alerts.checkAll(pair, price, ind || null);
  }

  /** @description Actualiza la última vela del cache y el chart en tiempo real. */
  function handleKline(d) {
    const k    = d.k;
    const pair = k.s;
    const cacheKey = `${pair}_${App.selectedTimeframe}`;
    const candle = { time: k.t, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v };

    const klines = App.klineCache[cacheKey];
    if (!klines) return;

    const last = klines[klines.length - 1];
    if (last && last.time === candle.time) klines[klines.length - 1] = candle;
    else if (k.x) { klines.push(candle); if (klines.length > 300) klines.shift(); }

    // Recalcular indicadores y señal
    if (pair === App.selectedPair) {
      const built = Indicators.buildChartData(klines);
      App.indicatorCache[cacheKey] = built;
      const sig = Signals.generate(built.last, candle.close);
      App.signals[pair] = sig;
      UI.renderIndicators(built.last);
      UI.refreshPriceRow(pair);
      // Actualizar último punto del chart sin destruirlo
      updateLiveCandle(candle, built.arrays);
    }
  }

  /**
   * @description Actualiza el último punto de los 3 charts sin redibujarlos completos.
   * @param {Object} candle @param {Object} arrays
   */
  function updateLiveCandle(candle, arrays) {
    const charts = App.charts;
    if (charts.candle) {
      const ds = charts.candle.data.datasets[0].data;
      if (ds.length) {
        const last = ds[ds.length - 1];
        if (last && last.x === candle.time) {
          last.o = candle.open; last.h = candle.high; last.l = candle.low; last.c = candle.close;
        } else {
          ds.push({ x: candle.time, o: candle.open, h: candle.high, l: candle.low, c: candle.close });
          if (ds.length > 200) ds.shift();
        }
        charts.candle.update('none');
      }
    }
    // MACD y RSI: re-renderizar completo (cálculo cambia con cada cierre)
    if (arrays && (charts.macd || charts.rsi)) {
      UI.renderCharts(arrays);
    }
  }

  // ===== REST =====

  /**
   * @description Obtiene klines históricas para un par y timeframe.
   * @param {string} pair @param {string} timeframe @param {number} limit
   * @returns {Promise<Array>}
   */
  async function fetchKlines(pair, timeframe, limit = 200) {
    const cacheKey = `${pair}_${timeframe}`;
    try {
      const res  = await fetch(`${REST_BASE}/klines?symbol=${pair}&interval=${timeframe}&limit=${limit}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw  = await res.json();
      const klines = raw.map(k => ({
        time: k[0], open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
      }));
      App.klineCache[cacheKey] = klines;
      return klines;
    } catch (e) {
      console.warn('[Binance] fetchKlines:', e.message);
      return App.klineCache[cacheKey] || [];
    }
  }

  /**
   * @description Obtiene tickers 24h para todos los pares (inicialización rápida de precios).
   */
  async function fetchTickers() {
    try {
      const symbols = JSON.stringify(App.pairs);
      const res = await fetch(`${REST_BASE}/ticker/24hr?symbols=${encodeURIComponent(symbols)}`);
      if (!res.ok) return;
      const data = await res.json();
      data.forEach(t => {
        App.priceData[t.symbol] = {
          price:  parseFloat(t.lastPrice),
          change: parseFloat(t.priceChangePercent),
          volume: parseFloat(t.quoteVolume),
        };
        UI.refreshPriceRow(t.symbol);
      });
    } catch (e) { console.warn('[Binance] fetchTickers:', e.message); }
  }

  // ===== STATUS =====
  function setStatus(status) {
    const dot   = document.getElementById('wsIndicator');
    const label = document.getElementById('wsLabel');
    const map   = { connected:'Live', disconnected:'Offline', connecting:'Conectando...' };
    if (dot)   dot.className   = `ws-dot ${status}`;
    if (label) label.textContent = map[status] || status;
  }

  return { connect, disconnect, resubscribe, fetchKlines, fetchTickers };
})();
