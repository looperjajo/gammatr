/**
 * @file ui.js
 * @description Módulo de renderizado DOM y gestión de Chart.js para GammaTR.
 * Expone métodos en window.UI.
 */
window.UI = (() => {

  const App = window.GammaTR;

  // ===== FORMATTERS =====
  /**
   * @description Formatea un precio con decimales apropiados según su magnitud.
   * @param {number} price
   * @returns {string}
   */
  function fmtPrice(price) {
    if (price === null || price === undefined || isNaN(price)) return '—';
    if (price >= 1000) return price.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (price >= 1)    return price.toFixed(4);
    return price.toFixed(6);
  }

  /**
   * @description Formatea un porcentaje de cambio.
   * @param {number} pct
   * @returns {string}
   */
  function fmtPct(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return '—%';
    const sign = pct >= 0 ? '+' : '';
    return `${sign}${pct.toFixed(2)}%`;
  }

  /**
   * @description Formatea timestamp a hora local legible.
   * @param {string|number} ts
   * @returns {string}
   */
  function fmtTime(ts) {
    return new Date(ts).toLocaleString('es-ES', {
      day: '2-digit', month: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // ===== TABLA DE PRECIOS =====
  /**
   * @description Construye la tabla de precios desde cero.
   */
  function renderPriceTable() {
    const tbody = document.getElementById('pricesBody');
    if (!tbody) return;
    tbody.innerHTML = '';
    App.pairs.forEach(pair => {
      tbody.appendChild(buildPriceRow(pair));
    });
  }

  /**
   * @description Construye una fila <tr> para un par.
   * @param {string} pair
   * @returns {HTMLElement}
   */
  function buildPriceRow(pair) {
    const d    = App.priceData[pair] || {};
    const sig  = App.signals[pair]  || {};
    const base = pair.replace('USDT','');

    const tr = document.createElement('tr');
    tr.dataset.pair = pair;
    if (pair === App.selectedPair) tr.classList.add('selected');

    const changeClass = (d.change >= 0) ? 'positive' : 'negative';
    const sigType  = sig.type  || '—';
    const sigScore = sig.score || 0;
    const scoreColor = sigType === 'BUY' ? '#00d4a0' : sigType === 'SELL' ? '#ff4757' : '#ffa726';

    tr.innerHTML = `
      <td>
        <div class="pair-cell">
          <span class="pair-base">${base}</span><span class="pair-quote">/USDT</span>
        </div>
      </td>
      <td class="text-right">
        <span class="price-cell" id="price_${pair}">${d.price ? fmtPrice(d.price) : '…'}</span>
      </td>
      <td class="text-right">
        <span class="change-cell ${changeClass}" id="change_${pair}">
          ${d.change !== undefined ? fmtPct(d.change) : '…'}
        </span>
      </td>
      <td class="text-center">
        <span class="signal-badge ${sigType}" id="signal_${pair}">${sigType}</span>
      </td>
      <td class="text-right">
        <div class="score-bar" id="score_${pair}">
          <span style="font-family:var(--font-mono);font-size:0.78rem;">${sigScore ? sigScore+'%' : '—'}</span>
          <div class="score-bar-track">
            <div class="score-bar-fill" style="width:${sigScore}%;background:${scoreColor}"></div>
          </div>
        </div>
      </td>
    `;
    return tr;
  }

  /**
   * @description Añade una fila nueva a la tabla para un par recién añadido.
   * @param {string} pair
   */
  function addPriceRow(pair) {
    const tbody = document.getElementById('pricesBody');
    if (!tbody) return;
    if (tbody.querySelector(`tr[data-pair="${pair}"]`)) return;
    tbody.appendChild(buildPriceRow(pair));
  }

  /**
   * @description Actualiza los campos de precio/cambio/señal de una fila existente.
   * @param {string} pair
   */
  function refreshPriceRow(pair) {
    const d   = App.priceData[pair] || {};
    const sig = App.signals[pair]   || {};

    const priceEl  = document.getElementById(`price_${pair}`);
    const changeEl = document.getElementById(`change_${pair}`);
    const signalEl = document.getElementById(`signal_${pair}`);
    const scoreEl  = document.getElementById(`score_${pair}`);

    if (priceEl) {
      const prev = parseFloat(priceEl.dataset.prev || 0);
      const curr = d.price || 0;
      priceEl.textContent = fmtPrice(curr);
      priceEl.dataset.prev = curr;
      // Flash animación
      priceEl.classList.remove('flash-up', 'flash-down');
      void priceEl.offsetWidth; // reflow
      if (curr > prev) priceEl.classList.add('flash-up');
      else if (curr < prev) priceEl.classList.add('flash-down');
    }

    if (changeEl) {
      changeEl.textContent = fmtPct(d.change);
      changeEl.className = `change-cell ${d.change >= 0 ? 'positive' : 'negative'}`;
    }

    if (signalEl) {
      const type = sig.type || '—';
      signalEl.textContent = type;
      signalEl.className = `signal-badge ${type}`;
    }

    if (scoreEl && sig.score) {
      const score = sig.score;
      const color = sig.type === 'BUY' ? '#00d4a0' : sig.type === 'SELL' ? '#ff4757' : '#ffa726';
      scoreEl.innerHTML = `
        <span style="font-family:var(--font-mono);font-size:0.78rem;">${score}%</span>
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${score}%;background:${color}"></div>
        </div>`;
    }

    // Actualizar precio en header del chart si es el par seleccionado
    if (pair === App.selectedPair) {
      const chartPrice = document.getElementById('chartPriceLabel');
      if (chartPrice && d.price) chartPrice.textContent = fmtPrice(d.price);
    }
  }

  // ===== CHART DE VELAS =====
  let chart = null;

  /**
   * @description Inicializa o actualiza el candlestick chart con datos del par seleccionado.
   * @param {string} pair
   */
  async function updateChartForPair(pair) {
    const cacheKey = `${pair}_${App.selectedTimeframe}`;
    const loader = document.getElementById('chartLoader');

    // Actualizar labels del chart
    document.getElementById('chartPairLabel').textContent = pair;
    const d = App.priceData[pair];
    if (d?.price) document.getElementById('chartPriceLabel').textContent = fmtPrice(d.price);

    // Marcar fila en tabla
    document.querySelectorAll('#pricesBody tr').forEach(r => {
      r.classList.toggle('selected', r.dataset.pair === pair);
    });

    // Actualizar selectores de señales/alertas
    ['signalPairSelect','alertPairSelect'].forEach(id => {
      const sel = document.getElementById(id);
      if (sel) sel.value = pair;
    });

    if (loader) loader.classList.remove('hidden');

    // Obtener klines (del caché o fetching)
    if (!App.klineCache[cacheKey]) {
      await Binance.fetchKlines(pair, App.selectedTimeframe).catch(() => {});
    }

    if (loader) loader.classList.add('hidden');

    const klines = App.klineCache[cacheKey] || [];
    renderCandlestickChart(klines);

    // Calcular y renderizar indicadores
    const closes = klines.map(k => k.close);
    if (closes.length > 30) {
      const inds = Indicators.calculateAll(closes, klines);
      App.indicators[pair] = inds;
      renderIndicators(inds, App.priceData[pair]?.price);

      // Generar señal local (sin IA)
      const sig = Signals.generate(inds, App.priceData[pair]?.price);
      App.signals[pair] = sig;
      refreshPriceRow(pair);
    }
  }

  /**
   * @description Renderiza el chart de velas con Chart.js Financial.
   * @param {Array} klines - Array de { time, open, high, low, close, volume }
   */
  function renderCandlestickChart(klines) {
    const canvas = document.getElementById('candlestickChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const data = klines.map(k => ({
      x: k.time,
      o: k.open,
      h: k.high,
      l: k.low,
      c: k.close,
    }));

    if (chart) {
      chart.data.datasets[0].data = data;
      chart.update('none');
      return;
    }

    chart = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [{
          label: App.selectedPair,
          data,
          color: {
            up:   '#00d4a0',
            down: '#ff4757',
            unchanged: '#94a3b8',
          },
          borderColor: {
            up:   '#00d4a0',
            down: '#ff4757',
            unchanged: '#94a3b8',
          },
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const d = ctx.raw;
                return [`O: ${fmtPrice(d.o)}`, `H: ${fmtPrice(d.h)}`, `L: ${fmtPrice(d.l)}`, `C: ${fmtPrice(d.c)}`];
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: { tooltipFormat: 'dd/MM HH:mm' },
            grid: { color: '#1e2d45' },
            ticks: {
              color: '#64748b',
              font: { family: 'Space Mono', size: 10 },
              maxTicksLimit: 6,
            }
          },
          y: {
            position: 'right',
            grid: { color: '#1e2d45' },
            ticks: {
              color: '#64748b',
              font: { family: 'Space Mono', size: 10 },
              callback: v => fmtPrice(v),
            }
          }
        }
      }
    });
    App.chart = chart;
  }

  // ===== PANEL DE INDICADORES =====
  /**
   * @description Actualiza los valores del panel de indicadores.
   * @param {Object} inds - Resultado de Indicators.calculateAll()
   * @param {number} price - Precio actual
   */
  function renderIndicators(inds, price) {
    if (!inds) return;

    // RSI
    if (inds.rsi) {
      const rsi = inds.rsi.value;
      document.getElementById('rsiValue').textContent = rsi.toFixed(2);
      const fill = document.getElementById('rsiFill');
      fill.style.width = `${rsi}%`;
      fill.style.background = rsi < 30 ? '#00d4a0' : rsi > 70 ? '#ff4757' : '#ffa726';
      document.getElementById('indRSI').style.borderColor =
        rsi < 30 ? '#00d4a0' : rsi > 70 ? '#ff4757' : 'var(--border)';
    }

    // MACD
    if (inds.macd) {
      const { macd: m, signal: s, histogram: h } = inds.macd;
      document.getElementById('macdValue').textContent = m.toFixed(4);
      document.getElementById('macdSignalVal').textContent = `Señal: ${s.toFixed(4)}`;
      document.getElementById('macdHistVal').textContent = `Hist: ${h.toFixed(4)}`;
      document.getElementById('macdHistVal').style.color = h >= 0 ? '#00d4a0' : '#ff4757';
    }

    // EMA
    if (inds.ema) {
      const { ema9, ema21, cross } = inds.ema;
      document.getElementById('ema9Val').textContent  = `9: ${fmtPrice(ema9)}`;
      document.getElementById('ema21Val').textContent = `21: ${fmtPrice(ema21)}`;
      document.getElementById('emaValue').textContent = cross === 'bullish' ? '↑ Alcista' :
                                                        cross === 'bearish' ? '↓ Bajista' : '→ Lateral';
      document.getElementById('emaValue').style.color =
        cross === 'bullish' ? '#00d4a0' : cross === 'bearish' ? '#ff4757' : '#94a3b8';
    }

    // Bollinger
    if (inds.bb) {
      const { upper, middle, lower } = inds.bb;
      document.getElementById('bbValue').textContent   = fmtPrice(middle);
      document.getElementById('bbUpperVal').textContent = `↑ ${fmtPrice(upper)}`;
      document.getElementById('bbLowerVal').textContent = `↓ ${fmtPrice(lower)}`;
      if (price) {
        const pct = ((price - lower) / (upper - lower) * 100).toFixed(1);
        document.getElementById('bbValue').textContent = `${pct}% banda`;
        const isnear = price <= lower * 1.01 ? '#00d4a0' : price >= upper * 0.99 ? '#ff4757' : '#94a3b8';
        document.getElementById('indBB').style.borderColor = isnear;
      }
    }
  }

  // ===== RESULTADO GEMINI =====
  /**
   * @description Renderiza el resultado del análisis Gemini en el panel de señales.
   * @param {string} pair
   * @param {Object} analysis - { signal, score, text, risk, target, timestamp }
   */
  function renderGeminiResult(pair, analysis) {
    const container = document.getElementById('geminiResult');
    container.classList.remove('hidden');

    document.getElementById('geminiResultPair').textContent = pair;

    const badge = document.getElementById('geminiSignalBadge');
    badge.textContent = analysis.signal;
    badge.className = `signal-badge ${analysis.signal}`;

    document.getElementById('geminiScoreLabel').textContent = `Score: ${analysis.score}%`;
    document.getElementById('geminiResultText').textContent = analysis.text;
    document.getElementById('geminiTimestamp').textContent  = fmtTime(analysis.timestamp || Date.now());
    document.getElementById('geminiRisk').textContent = `Riesgo: ${analysis.risk || '—'}`;
    document.getElementById('geminiTarget').textContent = analysis.target ? `Objetivo: $${fmtPrice(analysis.target)}` : '';
  }

  // ===== HISTORIAL DE SEÑALES =====
  /**
   * @description Renderiza el historial de señales en el panel IA.
   */
  function renderSignalHistory() {
    const container = document.getElementById('historyList');
    const statsEl   = document.getElementById('historyStats');
    if (!container) return;

    const history = App.signalHistory;

    if (!history.length) {
      container.innerHTML = '<div class="empty-state">Aún no hay señales. ¡Analiza un par!</div>';
      if (statsEl) statsEl.innerHTML = '';
      return;
    }

    // Estadísticas
    const counts = { BUY: 0, SELL: 0, WAIT: 0 };
    history.forEach(s => { if (counts[s.signal_type] !== undefined) counts[s.signal_type]++; });
    if (statsEl) {
      statsEl.innerHTML = `
        <span class="hist-stat-buy">BUY ${counts.BUY}</span>
        <span class="hist-stat-sell">SELL ${counts.SELL}</span>
        <span class="hist-stat-wait">WAIT ${counts.WAIT}</span>`;
    }

    // Lista (máx 20 en pantalla)
    container.innerHTML = history.slice(0, 20).map(s => `
      <div class="history-item">
        <span class="hi-pair">${s.pair}</span>
        <span class="signal-badge ${s.signal_type}">${s.signal_type}</span>
        <span class="hi-price">$${s.price ? fmtPrice(s.price) : '—'}</span>
        <span class="hi-time">${fmtTime(s.created_at)}</span>
      </div>
    `).join('');

    const loadMore = document.getElementById('loadMoreSignals');
    if (loadMore) loadMore.classList.toggle('hidden', history.length <= 20);
  }

  // ===== ALERTAS =====
  /**
   * @description Renderiza la lista de alertas activas y el historial de disparos.
   */
  function renderAlertsList() {
    const listEl    = document.getElementById('alertsList');
    const historyEl = document.getElementById('alertsHistory');
    if (!listEl) return;

    const active    = App.alerts.filter(a => a.active);
    const triggered = App.alerts.filter(a => !a.active && a.triggered_at);

    // Activas
    if (!active.length) {
      listEl.innerHTML = '<div class="empty-state">No hay alertas activas.</div>';
    } else {
      listEl.innerHTML = active.map(a => `
        <div class="alert-item" data-id="${a.id}">
          <div class="alert-info">
            <div class="alert-pair">${a.pair}</div>
            <div class="alert-desc">${alertDesc(a)}</div>
          </div>
          <button class="btn-danger" onclick="UI.deleteAlert('${a.id}')">✕</button>
        </div>
      `).join('');
    }

    // Historial
    if (historyEl) {
      if (!triggered.length) {
        historyEl.innerHTML = '<div class="empty-state">Ninguna alerta disparada aún.</div>';
      } else {
        historyEl.innerHTML = triggered.slice(0, 10).map(a => `
          <div class="alert-item triggered">
            <div class="alert-info">
              <div class="alert-pair">${a.pair}</div>
              <div class="alert-desc">${alertDesc(a)}</div>
              <div class="alert-time">${fmtTime(a.triggered_at)}</div>
            </div>
          </div>
        `).join('');
      }
    }

    // Badge en nav
    const badge = document.getElementById('alertsBadge');
    if (badge) {
      badge.textContent = active.length;
      badge.classList.toggle('hidden', active.length === 0);
    }
  }

  /**
   * @description Devuelve texto descriptivo para una alerta.
   * @param {Object} a - Alerta
   * @returns {string}
   */
  function alertDesc(a) {
    const typeMap = {
      PRICE_ABOVE: `Precio sube de $${a.threshold}`,
      PRICE_BELOW: `Precio baja de $${a.threshold}`,
      RSI_ABOVE:   `RSI sube de ${a.threshold}`,
      RSI_BELOW:   `RSI baja de ${a.threshold}`,
      SIGNAL:      `Señal ${a.signal_target}`,
    };
    return typeMap[a.alert_type] || a.alert_type;
  }

  /**
   * @description Elimina una alerta por ID.
   * @param {string} id
   */
  function deleteAlert(id) {
    App.alerts = App.alerts.filter(a => a.id !== id);
    SupabaseClient.deleteAlert(id).catch(() => {});
    renderAlertsList();
    showToast('Alerta eliminada', 'success');
  }

  // ===== CONFIGURACIÓN =====
  /**
   * @description Rellena los campos del panel de config con los valores guardados.
   */
  function renderConfigSection() {
    const g = document.getElementById('cfgGeminiKey');
    const u = document.getElementById('cfgSupabaseUrl');
    const k = document.getElementById('cfgSupabaseKey');
    if (g) g.value = App.config.geminiKey   || '';
    if (u) u.value = App.config.supabaseUrl || '';
    if (k) k.value = App.config.supabaseKey || '';
    renderPairsChips();
  }

  /**
   * @description Renderiza los chips de pares en config.
   */
  function renderPairsChips() {
    const container = document.getElementById('pairsList');
    if (!container) return;
    container.innerHTML = App.pairs.map(p => `
      <span class="pair-chip">
        ${p.replace('USDT','')}
        <button class="pair-chip-remove" onclick="UI.removePair('${p}')">✕</button>
      </span>
    `).join('');
  }

  /**
   * @description Elimina un par de la lista.
   * @param {string} pair
   */
  function removePair(pair) {
    if (App.pairs.length <= 1) return showToast('Debes tener al menos 1 par', 'warning');
    App.pairs = App.pairs.filter(p => p !== pair);
    window.saveConfig({ pairs: App.pairs });
    renderPairsChips();
    renderPairSelects();
    // Eliminar fila de la tabla
    const row = document.querySelector(`#pricesBody tr[data-pair="${pair}"]`);
    if (row) row.remove();
    showToast(`${pair} eliminado`, 'success');
  }

  /**
   * @description Actualiza todos los <select> de pares con la lista actual.
   */
  function renderPairSelects() {
    ['signalPairSelect','alertPairSelect'].forEach(id => {
      const sel = document.getElementById(id);
      if (!sel) return;
      const current = sel.value;
      sel.innerHTML = App.pairs.map(p =>
        `<option value="${p}" ${p === current ? 'selected' : ''}>${p.replace('USDT','/USDT')}</option>`
      ).join('');
    });
  }

  // ===== TOAST NOTIFICATIONS =====
  /**
   * @description Muestra un mensaje toast temporal en la UI.
   * @param {string} msg - Mensaje a mostrar
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} duration - ms hasta que desaparece
   */
  function showToast(msg, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✗', warning: '⚠', info: 'ℹ' };
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('fade-out');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  }

  // ===== INIT =====
  /**
   * @description Inicialización general de la UI.
   */
  function init() {
    renderPriceTable();
    renderPairSelects();
  }

  // API pública del módulo
  return {
    init,
    renderPriceTable,
    addPriceRow,
    refreshPriceRow,
    updateChartForPair,
    renderCandlestickChart,
    renderIndicators,
    renderGeminiResult,
    renderSignalHistory,
    renderAlertsList,
    renderConfigSection,
    renderPairsChips,
    renderPairSelects,
    removePair,
    deleteAlert,
    showToast,
    fmtPrice,
    fmtTime,
    alertDesc,
  };
})();
