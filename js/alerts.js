/**
 * @file alerts.js
 * @description Sistema de alertas: 10 tipos, notificaciones push, sonido Web Audio, feedback visual.
 */
window.Alerts = (() => {

  const App = window.GammaTR;
  const COOLDOWN = 60_000; // 1 min entre disparos del mismo alerta
  const fired = {}; // alertId -> timestamp último disparo

  /** @description Solicita permiso de notificaciones al navegador. */
  async function requestPermissions() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      await Notification.requestPermission().catch(() => {});
    }
  }

  // ===== COMPROBACIONES POR TIPO =====

  /**
   * @description Comprueba todas las alertas activas para un par dado tras recibir precio nuevo.
   * @param {string} pair @param {number} price @param {Object} ind - indicadores actuales
   */
  function checkAll(pair, price, ind) {
    if (!App.config.notificationsOn) return;
    const active = App.alerts.filter(a => a.active && a.pair === pair);
    active.forEach(a => evaluate(a, price, ind));
  }

  /**
   * @description Evalúa si una alerta debe dispararse.
   * @param {Object} a - alerta @param {number} price @param {Object} ind
   */
  function evaluate(a, price, ind) {
    if (isCooling(a.id)) return;
    const rsi  = ind?.rsi?.value  ?? null;
    const macd = ind?.macd        ?? {};
    let trigger = false;

    switch (a.alert_type) {
      case 'PRICE_REACH':
        trigger = Math.abs(price - a.threshold) / a.threshold < 0.002; // ±0.2%
        break;
      case 'PRICE_BREAKOUT':
        trigger = price > a.threshold;
        break;
      case 'PRICE_SUPPORT':
        trigger = price < a.threshold;
        break;
      case 'CHANGE_PCT_UP':
        trigger = (App.priceData[a.pair]?.change ?? 0) > a.threshold;
        break;
      case 'CHANGE_PCT_DOWN':
        trigger = (App.priceData[a.pair]?.change ?? 0) < -Math.abs(a.threshold);
        break;
      case 'CHANGE_24H_UP':
        trigger = (App.priceData[a.pair]?.change ?? 0) > a.threshold;
        break;
      case 'RSI_BELOW':
        trigger = rsi !== null && rsi < a.threshold;
        break;
      case 'RSI_ABOVE':
        trigger = rsi !== null && rsi > a.threshold;
        break;
      case 'MACD_BULLISH_CROSS':
        trigger = macd.trend === 'bullish_cross';
        break;
      case 'MACD_BEARISH_CROSS':
        trigger = macd.trend === 'bearish_cross';
        break;
    }

    if (trigger) fire(a, price);
  }

  /**
   * @description Dispara la alerta: push + sonido + toast + actualiza estado.
   * @param {Object} a @param {number} price
   */
  async function fire(a, price) {
    fired[a.id] = Date.now();

    const msg = buildMsg(a, price);
    UI.showToast(`🔔 ${msg}`, 'warning', 7000);
    pushNotification(`GammaTR — ${a.pair}`, msg);
    if (App.config.soundOn) beep();
    highlightRow(a.pair);

    // Marcar como disparada
    a.active       = false;
    a.triggered_at = new Date().toISOString();

    await SupabaseClient.updateAlert(a.id, { active: false, triggered_at: a.triggered_at }).catch(() => {});
    UI.renderAlerts();
  }

  /** @description Construye texto descriptivo del disparo. */
  function buildMsg(a, price) {
    const p = (n) => Number(n).toFixed(n >= 100 ? 2 : 4);
    const map = {
      PRICE_REACH:      `${a.pair} alcanzó $${p(price)} (objetivo $${p(a.threshold)})`,
      PRICE_BREAKOUT:   `${a.pair} rompió $${p(a.threshold)} ↑ Precio: $${p(price)}`,
      PRICE_SUPPORT:    `${a.pair} cayó a $${p(price)} (soporte $${p(a.threshold)})`,
      CHANGE_PCT_UP:    `${a.pair} subió +${a.threshold}% en el timeframe`,
      CHANGE_PCT_DOWN:  `${a.pair} cayó -${Math.abs(a.threshold)}% en el timeframe`,
      CHANGE_24H_UP:    `${a.pair} cambio 24h supera +${a.threshold}%`,
      RSI_BELOW:        `RSI de ${a.pair} bajó de ${a.threshold} → posible compra`,
      RSI_ABOVE:        `RSI de ${a.pair} subió de ${a.threshold} → posible venta`,
      MACD_BULLISH_CROSS: `MACD bullish cross en ${a.pair} ↑`,
      MACD_BEARISH_CROSS: `MACD bearish cross en ${a.pair} ↓`,
    };
    return map[a.alert_type] || `Alerta ${a.pair} disparada`;
  }

  /** @description Descripción corta para la lista de alertas. */
  function describeAlert(a) {
    const map = {
      PRICE_REACH:      `Precio ≈ $${a.threshold}`,
      PRICE_BREAKOUT:   `Precio > $${a.threshold}`,
      PRICE_SUPPORT:    `Precio < $${a.threshold}`,
      CHANGE_PCT_UP:    `Cambio % > +${a.threshold}%`,
      CHANGE_PCT_DOWN:  `Cambio % < -${Math.abs(a.threshold)}%`,
      CHANGE_24H_UP:    `24h > +${a.threshold}%`,
      RSI_BELOW:        `RSI < ${a.threshold}`,
      RSI_ABOVE:        `RSI > ${a.threshold}`,
      MACD_BULLISH_CROSS: 'MACD cruce alcista',
      MACD_BEARISH_CROSS: 'MACD cruce bajista',
    };
    return map[a.alert_type] || a.alert_type;
  }

  // ===== HELPERS =====

  function isCooling(id) {
    return fired[id] && (Date.now() - fired[id]) < COOLDOWN;
  }

  function pushNotification(title, body) {
    if (Notification.permission !== 'granted') return;
    try {
      const n = new Notification(title, { body, icon: './icons/icon-192.png', tag: 'gammatr' });
      setTimeout(() => n.close(), 8000);
    } catch (e) {}
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [880, 1100, 880].forEach((freq, i) => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        const t = ctx.currentTime + i * 0.18;
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
        osc.start(t); osc.stop(t + 0.15);
      });
    } catch (e) {}
  }

  function highlightRow(pair) {
    const row = document.querySelector(`[data-pair="${pair}"]`);
    if (!row) return;
    const colors = ['rgba(255,167,38,.3)', '', 'rgba(255,167,38,.3)', ''];
    colors.forEach((bg, i) => setTimeout(() => { row.style.background = bg; }, i * 300));
  }

  return { requestPermissions, checkAll, evaluate, fire, describeAlert, beep };
})();
