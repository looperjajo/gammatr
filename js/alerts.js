/**
 * @file alerts.js
 * @description Sistema de alertas: verificación de condiciones, notificaciones push,
 * sonido y feedback visual. Se ejecuta cada vez que llegan precios/indicadores nuevos.
 * Expone window.Alerts.
 */
window.Alerts = (() => {

  const App = window.GammaTR;

  // Cooldown por alerta para evitar spam (ms)
  const COOLDOWN_MS = 60 * 1000; // 1 minuto entre disparos del mismo alerta

  // Registro de últimos disparos por alerta ID
  const lastTriggered = {};

  // ===== PERMISOS DE NOTIFICACIÓN =====
  /**
   * @description Solicita permiso del navegador para notificaciones push.
   * Solo pide si no se ha pedido antes.
   */
  async function requestPermissions() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      try {
        const perm = await Notification.requestPermission();
        console.log('[Alerts] Permiso de notificación:', perm);
      } catch (e) {
        console.warn('[Alerts] No se pudo obtener permiso:', e);
      }
    }
  }

  // ===== COMPROBACIÓN DE ALERTAS DE PRECIO =====
  /**
   * @description Comprueba alertas de precio para un par dado.
   * Se llama desde binance.js cuando llega cada actualización de precio.
   * @param {string} pair - Símbolo del par
   * @param {number} price - Precio actual
   */
  function checkPriceAlerts(pair, price) {
    const relevant = App.alerts.filter(a =>
      a.active &&
      a.pair === pair &&
      (a.alert_type === 'PRICE_ABOVE' || a.alert_type === 'PRICE_BELOW')
    );

    relevant.forEach(alert => {
      if (isCoolingDown(alert.id)) return;

      const shouldTrigger =
        (alert.alert_type === 'PRICE_ABOVE' && price >= alert.threshold) ||
        (alert.alert_type === 'PRICE_BELOW' && price <= alert.threshold);

      if (shouldTrigger) {
        const msg = alert.alert_type === 'PRICE_ABOVE'
          ? `${pair} subió a $${price.toFixed(2)} (umbral: $${alert.threshold})`
          : `${pair} bajó a $${price.toFixed(2)} (umbral: $${alert.threshold})`;

        triggerAlert(alert, msg);
      }
    });
  }

  /**
   * @description Comprueba alertas de RSI para un par dado.
   * Se llama desde ui.js cuando se recalculan los indicadores.
   * @param {string} pair
   * @param {number} rsiValue
   */
  function checkRSIAlerts(pair, rsiValue) {
    const relevant = App.alerts.filter(a =>
      a.active &&
      a.pair === pair &&
      (a.alert_type === 'RSI_ABOVE' || a.alert_type === 'RSI_BELOW')
    );

    relevant.forEach(alert => {
      if (isCoolingDown(alert.id)) return;

      const shouldTrigger =
        (alert.alert_type === 'RSI_ABOVE' && rsiValue >= alert.threshold) ||
        (alert.alert_type === 'RSI_BELOW' && rsiValue <= alert.threshold);

      if (shouldTrigger) {
        const msg = alert.alert_type === 'RSI_ABOVE'
          ? `RSI de ${pair} subió a ${rsiValue.toFixed(1)} (umbral: ${alert.threshold})`
          : `RSI de ${pair} bajó a ${rsiValue.toFixed(1)} (umbral: ${alert.threshold})`;

        triggerAlert(alert, msg);
      }
    });
  }

  /**
   * @description Comprueba alertas de señal para un par dado.
   * @param {string} pair
   * @param {string} signalType - 'BUY' | 'SELL' | 'WAIT'
   */
  function checkSignalAlerts(pair, signalType) {
    const relevant = App.alerts.filter(a =>
      a.active &&
      a.pair === pair &&
      a.alert_type === 'SIGNAL' &&
      a.signal_target === signalType
    );

    relevant.forEach(alert => {
      if (isCoolingDown(alert.id)) return;
      triggerAlert(alert, `Señal ${signalType} detectada en ${pair}`);
    });
  }

  // ===== DISPARO DE ALERTA =====
  /**
   * @description Dispara una alerta: notificación push + sonido + toast + actualización de estado.
   * @param {Object} alert - El objeto alerta
   * @param {string} message - Mensaje descriptivo
   */
  async function triggerAlert(alert, message) {
    console.log('[Alerts] Disparando:', message);

    // Registrar cooldown
    lastTriggered[alert.id] = Date.now();

    // 1. Toast en la app
    UI.showToast(`🔔 ${message}`, 'warning', 6000);

    // 2. Notificación del navegador
    sendBrowserNotification(`GammaTR — ${alert.pair}`, message);

    // 3. Sonido de alerta
    playAlertSound();

    // 4. Highlight visual en la tabla (parpadeo de la fila)
    highlightPairRow(alert.pair);

    // 5. Marcar como disparada en estado local
    alert.triggered_at = new Date().toISOString();
    alert.active = false;

    // 6. Actualizar en Supabase
    await SupabaseClient.updateAlert(alert.id, {
      active: false,
      triggered_at: alert.triggered_at,
    }).catch(() => {});

    // 7. Actualizar badge y lista de alertas
    UI.renderAlertsList();
  }

  // ===== NOTIFICACIÓN DEL NAVEGADOR =====
  /**
   * @description Envía una notificación push del navegador si hay permiso.
   * @param {string} title
   * @param {string} body
   */
  function sendBrowserNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const notification = new Notification(title, {
        body,
        icon: './icons/icon-192.png',
        badge: './icons/icon-192.png',
        tag: 'gammatr-alert',  // Reemplaza notificaciones anteriores del mismo tag
        renotify: true,
        vibrate: [200, 100, 200],
      });

      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      setTimeout(() => notification.close(), 10000);
    } catch (err) {
      console.warn('[Alerts] Error en notificación:', err);
    }
  }

  // ===== SONIDO =====
  /**
   * @description Reproduce el sonido de alerta.
   * Genera un beep sintético usando Web Audio API como fallback.
   */
  function playAlertSound() {
    try {
      // Intentar con el elemento audio del HTML
      const audio = document.getElementById('alertSound');
      if (audio && audio.src && audio.src !== window.location.href) {
        audio.volume = 0.5;
        audio.play().catch(() => playBeep());
        return;
      }
      playBeep();
    } catch(e) {
      playBeep();
    }
  }

  /**
   * @description Genera un beep sintético de alerta usando Web Audio API.
   */
  function playBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const frequencies = [880, 1100, 880]; // Patrón de alerta

      let time = ctx.currentTime;
      frequencies.forEach(freq => {
        const osc  = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.3, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

        osc.start(time);
        osc.stop(time + 0.15);
        time += 0.2;
      });
    } catch (e) {
      // Sin audio disponible — silencio
    }
  }

  // ===== HIGHLIGHT VISUAL =====
  /**
   * @description Aplica un parpadeo visual a la fila de la tabla para un par.
   * @param {string} pair
   */
  function highlightPairRow(pair) {
    const row = document.querySelector(`#pricesBody tr[data-pair="${pair}"]`);
    if (!row) return;

    row.style.transition = 'background 0.2s ease';
    const flashes = [
      { bg: 'rgba(255,167,38,0.3)', delay: 0 },
      { bg: '',                     delay: 300 },
      { bg: 'rgba(255,167,38,0.3)', delay: 600 },
      { bg: '',                     delay: 900 },
    ];

    flashes.forEach(({ bg, delay }) => {
      setTimeout(() => { row.style.background = bg; }, delay);
    });
  }

  // ===== COOLDOWN CHECK =====
  /**
   * @description Comprueba si una alerta está en período de enfriamiento.
   * @param {string|number} alertId
   * @returns {boolean}
   */
  function isCoolingDown(alertId) {
    const last = lastTriggered[alertId];
    if (!last) return false;
    return (Date.now() - last) < COOLDOWN_MS;
  }

  // ===== COMPROBAR TODAS LAS ALERTAS =====
  /**
   * @description Punto de entrada para comprobar todas las alertas de un par.
   * Recibe el estado completo del par.
   * @param {string} pair
   * @param {number} price
   * @param {Object} indicators
   */
  function checkAll(pair, price, indicators) {
    checkPriceAlerts(pair, price);
    if (indicators?.rsi?.value !== undefined) {
      checkRSIAlerts(pair, indicators.rsi.value);
    }
  }

  // API pública
  return {
    requestPermissions,
    checkPriceAlerts,
    checkRSIAlerts,
    checkSignalAlerts,
    checkAll,
    triggerAlert,
    playAlertSound,
  };

})();
