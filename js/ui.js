/**
 * @file ui.js
 * @description Renderizado DOM, Chart.js (3 subgráficos sincronizados), textos educativos dinámicos.
 */
window.UI = (() => {

  const App = window.GammaTR;

  // ===== FORMATTERS =====

  /** Formatea precio con decimales adecuados según magnitud. */
  function fmtPrice(p) {
    if (p === null || p === undefined || isNaN(p)) return '—';
    if (p >= 1000) return p.toLocaleString('en-US', { maximumFractionDigits: 2 });
    if (p >= 1)    return p.toFixed(4);
    return p.toFixed(6);
  }

  /** Formatea porcentaje con signo. */
  function fmtPct(p) {
    if (p === null || isNaN(p)) return '—%';
    return `${p >= 0 ? '+' : ''}${p.toFixed(2)}%`;
  }

  /** Formatea timestamp a hora local. */
  function fmtTime(ts) {
    return new Date(ts).toLocaleString('es-ES', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });
  }

  // ===== CHARTS (3 subgráficos sincronizados) =====

  let chartCandle = null, chartMACD = null, chartRSI = null;
  let chartCandleMob = null;

  /**
   * @description Renderiza o actualiza los 3 gráficos de la zona 2 con los datos calculados.
   * @param {Object} arrays - Resultado de Indicators.buildChartData().arrays
   */
  function renderCharts(arrays) {
    renderCandle(arrays);
    renderMACD(arrays);
    renderRSI(arrays);
  }

  function renderCandle(arrays) {
    const canvas = document.getElementById('chartCandle');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const candleData = arrays.candle.filter(Boolean);
    const ema9Data   = arrays.ema9.filter(Boolean);
    const ema21Data  = arrays.ema21.filter(Boolean);

    if (chartCandle) {
      chartCandle.data.datasets[0].data = candleData;
      chartCandle.data.datasets[1].data = ema9Data;
      chartCandle.data.datasets[2].data = ema21Data;
      chartCandle.update('none');
      return;
    }

    chartCandle = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [
          {
            type: 'candlestick',
            label: 'Precio',
            data: candleData,
            color: { up: '#00d4a0', down: '#ff4757', unchanged: '#94a3b8' },
            borderColor: { up: '#00d4a0', down: '#ff4757', unchanged: '#94a3b8' },
          },
          { type: 'line', label: 'EMA9',  data: ema9Data,  borderColor: '#4dabf7', borderWidth: 1.2, pointRadius: 0, tension: 0.3 },
          { type: 'line', label: 'EMA21', data: ema21Data, borderColor: '#ffa726', borderWidth: 1.2, pointRadius: 0, tension: 0.3 },
        ]
      },
      options: chartOptions({ showX: false }),
    });
    App.charts.candle = chartCandle;
  }

  function renderMACD(arrays) {
    const canvas = document.getElementById('chartMACD');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const histData   = arrays.hist.filter(Boolean);
    const macdData   = arrays.macd.filter(Boolean);
    const signalData = arrays.signal.filter(Boolean);

    if (chartMACD) {
      chartMACD.data.datasets[0].data = histData;
      chartMACD.data.datasets[1].data = macdData;
      chartMACD.data.datasets[2].data = signalData;
      chartMACD.update('none');
      return;
    }

    // Colorear barras del histograma según signo
    const histColors = histData.map(d => d.y >= 0 ? 'rgba(0,212,160,0.6)' : 'rgba(255,71,87,0.6)');

    chartMACD = new Chart(ctx, {
      type: 'bar',
      data: {
        datasets: [
          { type: 'bar',  label: 'Histograma', data: histData,   backgroundColor: histColors, borderWidth: 0 },
          { type: 'line', label: 'MACD',        data: macdData,   borderColor: '#4dabf7', borderWidth: 1.2, pointRadius: 0, tension: 0.3 },
          { type: 'line', label: 'Signal',      data: signalData, borderColor: '#ffa726', borderWidth: 1.2, pointRadius: 0, tension: 0.3 },
        ]
      },
      options: chartOptions({ showX: false }),
    });
    App.charts.macd = chartMACD;
  }

  function renderRSI(arrays) {
    const canvas = document.getElementById('chartRSI');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const rsiData = arrays.rsi.filter(Boolean);

    if (chartRSI) {
      chartRSI.data.datasets[0].data = rsiData;
      chartRSI.update('none');
      return;
    }

    chartRSI = new Chart(ctx, {
      type: 'line',
      data: {
        datasets: [
          {
            label: 'RSI',
            data: rsiData,
            borderColor: '#a78bfa',
            borderWidth: 1.5,
            pointRadius: 0,
            tension: 0.3,
            fill: false,
          }
        ]
      },
      options: {
        ...chartOptions({ showX: true }),
        plugins: {
          ...chartOptions({ showX: true }).plugins,
          annotation: undefined,
        },
        scales: {
          ...chartOptions({ showX: true }).scales,
          y: {
            ...chartOptions({ showX: true }).scales.y,
            min: 0, max: 100,
            ticks: {
              ...chartOptions({ showX: true }).scales.y.ticks,
              callback: v => v,
              stepSize: 30,
            },
            // Líneas de referencia en 30 y 70
            afterDraw: (chart) => {
              const { ctx: c, chartArea: { left, right }, scales: { y } } = chart;
              [30, 70].forEach(val => {
                const yPos = y.getPixelForValue(val);
                c.save();
                c.strokeStyle = 'rgba(255,255,255,0.15)';
                c.lineWidth = 1;
                c.setLineDash([4, 4]);
                c.beginPath(); c.moveTo(left, yPos); c.lineTo(right, yPos); c.stroke();
                c.restore();
              });
            }
          }
        }
      },
    });
    App.charts.rsi = chartRSI;
  }

  /**
   * @description Opciones base compartidas para los 3 gráficos (dark theme, eje X tiempo).
   * @param {{ showX: boolean }} opts
   */
  function chartOptions({ showX = true } = {}) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1a2235',
          borderColor: 'rgba(255,255,255,0.08)',
          borderWidth: 1,
          titleColor: '#94a3b8',
          bodyColor: '#e2e8f0',
          titleFont: { family: 'Space Mono', size: 10 },
          bodyFont:  { family: 'Space Mono', size: 11 },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: { tooltipFormat: 'dd/MM HH:mm' },
          display: showX,
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { family: 'Space Mono', size: 9 }, maxTicksLimit: 6 },
        },
        y: {
          position: 'right',
          grid:  { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: '#64748b', font: { family: 'Space Mono', size: 9 }, callback: v => fmtPrice(v) },
        },
      },
    };
  }

  /** @description Chart de velas para móvil (solo candlestick + EMA). */
  function renderMobChart(arrays) {
    const canvas = document.getElementById('chartCandleMob');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const candleData = arrays.candle.filter(Boolean);
    const ema9Data   = arrays.ema9.filter(Boolean);
    const ema21Data  = arrays.ema21.filter(Boolean);

    if (chartCandleMob) {
      chartCandleMob.data.datasets[0].data = candleData;
      chartCandleMob.data.datasets[1].data = ema9Data;
      chartCandleMob.data.datasets[2].data = ema21Data;
      chartCandleMob.update('none');
      return;
    }

    chartCandleMob = new Chart(ctx, {
      type: 'candlestick',
      data: {
        datasets: [
          { type: 'candlestick', data: candleData, color: { up:'#00d4a0', down:'#ff4757', unchanged:'#94a3b8' }, borderColor: { up:'#00d4a0', down:'#ff4757', unchanged:'#94a3b8' } },
          { type: 'line', data: ema9Data,  borderColor: '#4dabf7', borderWidth: 1, pointRadius: 0, tension: 0.3 },
          { type: 'line', data: ema21Data, borderColor: '#ffa726', borderWidth: 1, pointRadius: 0, tension: 0.3 },
        ]
      },
      options: chartOptions({ showX: true }),
    });
    App.charts.candleMob = chartCandleMob;
  }

  /** @description Destruye todos los charts (para forzar recreación al cambiar par/tf). */
  function destroyCharts() {
    [chartCandle, chartMACD, chartRSI, chartCandleMob].forEach(c => { if (c) c.destroy(); });
    chartCandle = chartMACD = chartRSI = chartCandleMob = null;
    App.charts = { candle: null, macd: null, rsi: null };
  }

  // ===== WATCHLIST =====

  /** @description Construye y actualiza ambas listas (desktop + mobile). */
  function renderWatchlist() {
    const desktop = document.getElementById('watchlistDesktop');
    const mobile  = document.getElementById('watchlistMobile');
    if (desktop) desktop.innerHTML = App.pairs.map(p => buildWLRow(p, 'desktop')).join('');
    if (mobile)  renderWatchlistMobile();
  }

  function buildWLRow(pair, mode) {
    const d   = App.priceData[pair] || {};
    const sig = App.signals[pair]  || {};
    const ticker = pair.replace('USDT','');
    const changeClass = (d.change >= 0) ? 'pos' : 'neg';
    const isSelected  = pair === App.selectedPair ? 'selected' : '';

    if (mode === 'desktop') {
      return `
        <div class="wl-row ${isSelected}" data-pair="${pair}" onclick="UI.selectPair('${pair}')">
          <div class="wl-top">
            <span class="wl-ticker">${ticker}</span>
            <span class="signal-badge ${sig.type || '—'}">${sig.type || '—'}</span>
          </div>
          <div class="wl-bottom">
            <span class="wl-price" id="wlPrice_${pair}">${d.price ? fmtPrice(d.price) : '…'}</span>
            <span class="wl-change ${changeClass}" id="wlChange_${pair}">${d.change !== undefined ? fmtPct(d.change) : '…'}</span>
          </div>
        </div>`;
    }
    return buildMobWLRow(pair);
  }

  function buildMobWLRow(pair) {
    const d   = App.priceData[pair] || {};
    const sig = App.signals[pair]  || {};
    const ticker = pair.replace('USDT','');
    const changeClass = (d.change >= 0) ? 'pos' : 'neg';
    return `
      <div class="wl-row" data-pair="${pair}" onclick="UI.selectPair('${pair}');UI.goTab('Dashboard')">
        <div class="wl-top">
          <span class="wl-ticker">${ticker}/USDT</span>
          <span class="signal-badge ${sig.type || '—'}">${sig.type || '—'}</span>
        </div>
        <div class="wl-bottom">
          <span class="wl-price" id="wlMPrice_${pair}">${d.price ? fmtPrice(d.price) : '…'}</span>
          <span class="wl-change ${changeClass}" id="wlMChange_${pair}">${d.change !== undefined ? fmtPct(d.change) : '…'}</span>
        </div>
      </div>`;
  }

  function renderWatchlistMobile(filter = 'ALL') {
    const container = document.getElementById('watchlistMobile');
    if (!container) return;
    const pairs = filter === 'ALL'
      ? App.pairs
      : App.pairs.filter(p => (App.signals[p]?.type || 'WAIT') === filter);
    container.innerHTML = pairs.length
      ? pairs.map(p => buildMobWLRow(p)).join('')
      : '<div class="empty-state">Sin pares con esa señal.</div>';
  }

  /**
   * @description Actualiza precio y cambio de una fila sin reconstruir toda la lista.
   * @param {string} pair
   */
  function refreshPriceRow(pair) {
    const d   = App.priceData[pair] || {};
    const sig = App.signals[pair]  || {};
    if (!d.price) return;

    // Desktop watchlist
    const priceEl  = document.getElementById(`wlPrice_${pair}`);
    const changeEl = document.getElementById(`wlChange_${pair}`);
    if (priceEl) {
      const prev = parseFloat(priceEl.dataset.prev || 0);
      priceEl.textContent  = fmtPrice(d.price);
      priceEl.dataset.prev = d.price;
      priceEl.classList.remove('flash-up','flash-down');
      void priceEl.offsetWidth;
      priceEl.classList.add(d.price > prev ? 'flash-up' : 'flash-down');
    }
    if (changeEl) {
      changeEl.textContent = fmtPct(d.change);
      changeEl.className   = `wl-change ${d.change >= 0 ? 'pos' : 'neg'}`;
    }

    // Mobile watchlist
    const mpEl = document.getElementById(`wlMPrice_${pair}`);
    const mcEl = document.getElementById(`wlMChange_${pair}`);
    if (mpEl) { mpEl.textContent = fmtPrice(d.price); }
    if (mcEl) { mcEl.textContent = fmtPct(d.change); mcEl.className = `wl-change ${d.change >= 0 ? 'pos' : 'neg'}`; }

    // Si es el par seleccionado, actualizar header del chart
    if (pair === App.selectedPair) {
      const lbl = document.getElementById('chartPriceLabel');
      const chg = document.getElementById('chartChangeLabel');
      if (lbl) lbl.textContent = fmtPrice(d.price);
      if (chg) { chg.textContent = fmtPct(d.change); chg.className = `chart-change-label ${d.change >= 0 ? 'pos' : 'neg'}`; }

      // Mobile price header
      const mp = document.getElementById('mobPrice');
      const mc = document.getElementById('mobChange');
      if (mp) mp.textContent = fmtPrice(d.price);
      if (mc) { mc.textContent = fmtPct(d.change); mc.className = `mob-change ${d.change >= 0 ? 'pos' : 'neg'}`; }
    }

    // Señal badge en watchlist desktop
    const row = document.querySelector(`#watchlistDesktop [data-pair="${pair}"]`);
    if (row) {
      const badge = row.querySelector('.signal-badge');
      if (badge && sig.type) { badge.textContent = sig.type; badge.className = `signal-badge ${sig.type}`; }
    }
  }

  // ===== INDICADORES — textos educativos dinámicos =====

  /**
   * @description Actualiza el panel de indicadores (Zona 3) con los valores e interpreta.
   * @param {Object} last - Resultado de Indicators.buildChartData().last
   */
  function renderIndicators(last) {
    if (!last) return;
    renderRSICard(last.rsi);
    renderMACDCard(last.macd);
    renderEMACard(last.ema);
    renderMobIndicators(last);
  }

  function renderRSICard(rsi) {
    if (!rsi) return;
    const v = rsi.value;

    // Valor
    setEl('rsiValue', v.toFixed(2));

    // Barra 0-100
    const fill = document.getElementById('rsiFill');
    if (fill) {
      fill.style.width = `${v}%`;
      fill.style.background = v < 30 ? '#00d4a0' : v > 70 ? '#ff4757' : '#a78bfa';
    }

    // Badge
    let badgeClass = 'neutral', badgeTxt = 'NEUTRAL';
    if (v < 30) { badgeClass = 'oversold';    badgeTxt = 'SOBREVENDIDO'; }
    else if (v > 70) { badgeClass = 'overbought'; badgeTxt = 'SOBRECOMPRADO'; }
    setBadge('rsiBadge', badgeTxt, badgeClass);

    // Texto educativo dinámico
    let txt = '';
    if      (v < 25)  txt = `RSI en ${v.toFixed(1)} — sobreventa extrema. Alta probabilidad de rebote. Señal de compra fuerte si el resto de indicadores acompañan.`;
    else if (v < 35)  txt = `RSI en ${v.toFixed(1)} — zona de sobreventa. El activo ha caído con fuerza. Posible oportunidad de entrada próxima.`;
    else if (v < 50)  txt = `RSI en ${v.toFixed(1)} — zona neutral-baja. Sin señal clara aún. Espera que baje de 35 para confirmar entrada.`;
    else if (v < 65)  txt = `RSI en ${v.toFixed(1)} — zona neutral-alta. Momentum positivo pero sin sobrecompra. Mantén si tienes posición.`;
    else if (v < 75)  txt = `RSI en ${v.toFixed(1)} — acercándose a sobrecompra. Si tienes posición, considera proteger ganancias.`;
    else              txt = `RSI en ${v.toFixed(1)} — sobrecompra. Alta probabilidad de corrección. No es buen momento para entrar.`;
    setEl('rsiText', txt);
  }

  function renderMACDCard(macd) {
    if (!macd) return;
    const { macd: m, signal: s, histogram: h, trend } = macd;

    setEl('macdVal',     m.toFixed(5));
    setEl('macdSigVal',  s.toFixed(5));
    setEl('macdHistVal', h.toFixed(5));

    const histEl = document.getElementById('macdHistVal');
    if (histEl) histEl.style.color = h >= 0 ? '#00d4a0' : '#ff4757';

    // Flecha y badge
    let arrow = '→', badgeClass = 'neutral', badgeTxt = 'SIN CRUCE';
    if      (trend === 'bullish_cross') { arrow = '↑'; badgeClass = 'bullish_cross'; badgeTxt = 'BULLISH CROSS'; }
    else if (trend === 'bearish_cross') { arrow = '↓'; badgeClass = 'bearish_cross'; badgeTxt = 'BEARISH CROSS'; }
    else if (trend === 'bullish')       { arrow = '↗'; badgeClass = 'bullish';       badgeTxt = 'BULLISH'; }
    else if (trend === 'bearish')       { arrow = '↘'; badgeClass = 'bearish';       badgeTxt = 'BEARISH'; }

    const arrowEl = document.getElementById('macdArrow');
    if (arrowEl) {
      arrowEl.textContent = arrow;
      arrowEl.style.color = trend.includes('bullish') ? '#00d4a0' : trend.includes('bearish') ? '#ff4757' : '#94a3b8';
    }
    setBadge('macdBadge', badgeTxt, badgeClass);

    // Texto educativo dinámico
    let txt = '';
    if      (trend === 'bullish_cross') txt = `Cruce alcista recién producido: la línea MACD cruzó por encima de la señal. Momentum positivo activándose. Señal de compra técnica.`;
    else if (trend === 'bearish_cross') txt = `Cruce bajista recién producido: la línea MACD cruzó por debajo de la señal. Momentum negativo. Señal de venta técnica.`;
    else if (trend === 'bullish')       txt = `MACD sobre su línea de señal. Histograma positivo (${h.toFixed(5)}): el momentum alcista se mantiene. Sin cambio de tendencia inminente.`;
    else if (trend === 'bearish')       txt = `MACD bajo su línea de señal. Histograma negativo (${h.toFixed(5)}): el momentum bajista se mantiene. Evita compras precipitadas.`;
    else                                txt = `MACD sin señal clara. Espera un cruce para confirmar dirección.`;
    setEl('macdText', txt);
  }

  function renderEMACard(ema) {
    if (!ema) return;
    const { ema9, ema21, cross } = ema;

    setEl('ema9Val',  fmtPrice(ema9));
    setEl('ema21Val', fmtPrice(ema21));

    const spread = ema21 !== 0 ? ((ema9 - ema21) / ema21 * 100).toFixed(3) : '0';
    const spreadEl = document.getElementById('emaSpread');
    if (spreadEl) {
      spreadEl.textContent = `Spread EMA9-EMA21: ${spread > 0 ? '+' : ''}${spread}%`;
      spreadEl.style.color = spread > 0 ? '#00d4a0' : '#ff4757';
    }

    let badgeTxt = 'SIN CRUCE', badgeClass = 'neutral';
    if (cross === 'bullish') { badgeTxt = 'GOLDEN CROSS ✨'; badgeClass = 'GOLDEN'; }
    else if (cross === 'bearish') { badgeTxt = 'DEATH CROSS 💀'; badgeClass = 'DEATH'; }
    setBadge('emaBadge', badgeTxt, badgeClass);

    let txt = '';
    if (cross === 'bullish') {
      txt = `EMA9 (${fmtPrice(ema9)}) está sobre EMA21 (${fmtPrice(ema21)}). Tendencia alcista a corto plazo confirmada. El spread de ${spread}% indica la fuerza del movimiento.`;
    } else if (cross === 'bearish') {
      txt = `EMA9 (${fmtPrice(ema9)}) está bajo EMA21 (${fmtPrice(ema21)}). Tendencia bajista a corto plazo. Mantente al margen hasta que EMA9 recupere.`;
    } else {
      txt = `EMA9 y EMA21 prácticamente igualadas. Mercado lateral. Espera a que se separen para confirmar dirección.`;
    }
    setEl('emaText', txt);
  }

  /** @description Actualiza las 3 tarjetas compactas en móvil. */
  function renderMobIndicators(last) {
    if (!last) return;

    // RSI
    const rv = last.rsi?.value ?? 0;
    setEl('mobRsiVal', rv.toFixed(1));
    const rsiTxt = rv < 30 ? 'SOBREVENDIDO' : rv > 70 ? 'SOBRECOMPRADO' : 'NEUTRAL';
    const rsiCls = rv < 30 ? 'pos' : rv > 70 ? 'neg' : '';
    setMobBadge('mobRsiBadge', rsiTxt, rsiCls);

    // MACD
    const mt = last.macd?.trend || 'neutral';
    const macdTxt = mt === 'bullish_cross' ? 'BULLISH ↑' : mt === 'bearish_cross' ? 'BEARISH ↓' : mt === 'bullish' ? 'BULLISH' : mt === 'bearish' ? 'BEARISH' : 'NEUTRAL';
    const macdCls = mt.includes('bullish') ? 'pos' : mt.includes('bearish') ? 'neg' : '';
    setEl('mobMacdVal', (last.macd?.histogram ?? 0).toFixed(4));
    setMobBadge('mobMacdBadge', macdTxt, macdCls);

    // EMA
    const ec = last.ema?.cross || 'neutral';
    setEl('mobEmaVal', ec === 'bullish' ? '9>21 ↑' : ec === 'bearish' ? '9<21 ↓' : '=');
    const emaTxt = ec === 'bullish' ? 'ALCISTA' : ec === 'bearish' ? 'BAJISTA' : 'LATERAL';
    const emaCls = ec === 'bullish' ? 'pos' : ec === 'bearish' ? 'neg' : '';
    setMobBadge('mobEmaBadge', emaTxt, emaCls);

    // Señal badge en móvil header
    const sig = App.signals[App.selectedPair] || {};
    const mobSig = document.getElementById('mobSignalBadge');
    if (mobSig) { mobSig.textContent = sig.type || '—'; mobSig.className = `signal-badge ${sig.type || '—'}`; }
  }

  // ===== ZONA 4 — ANÁLISIS IA =====

  /**
   * @description Renderiza el resultado del análisis Gemini en Zona 4 (desktop) y tarjeta móvil.
   * @param {Object} analysis - { signal, confidence, summary, reasoning, risk, target, pair, timestamp }
   */
  function renderAIAnalysis(analysis) {
    if (!analysis) return;

    // Desktop
    const badge = document.getElementById('aiSignalBadge');
    const conf  = document.getElementById('aiConfidence');
    const risk  = document.getElementById('aiRisk');
    const ts    = document.getElementById('aiTimestamp');
    const text  = document.getElementById('aiText');
    const pair  = document.getElementById('aiPairLabel');

    if (pair)  pair.textContent  = analysis.pair;
    if (badge) { badge.textContent = analysis.signal; badge.className = `signal-badge ${analysis.signal}`; badge.classList.remove('hidden'); }
    if (conf)  { conf.textContent = `${analysis.confidence}%`; conf.style.color = analysis.confidence >= 70 ? '#00d4a0' : analysis.confidence >= 50 ? '#ffa726' : '#ff4757'; conf.classList.remove('hidden'); }
    if (risk)  { risk.textContent = `Riesgo: ${analysis.risk}`; risk.style.color = analysis.risk === 'BAJO' ? '#00d4a0' : analysis.risk === 'ALTO' ? '#ff4757' : '#ffa726'; risk.classList.remove('hidden'); }
    if (ts)    { ts.textContent = fmtTime(analysis.timestamp); ts.classList.remove('hidden'); }
    if (text)  text.textContent = `${analysis.summary} — ${analysis.reasoning}`;

    // Móvil
    const mobText  = document.getElementById('mobAiText');
    const mobBadge = document.getElementById('mobAiSignalBadge');
    if (mobText)  mobText.textContent = `${analysis.summary} — ${analysis.reasoning}`;
    if (mobBadge) { mobBadge.textContent = analysis.signal; mobBadge.className = `signal-badge ${analysis.signal} mob-ai-badge`; mobBadge.classList.remove('hidden'); }
  }

  // ===== ALERTAS =====

  /** @description Renderiza listas de alertas activas e historial. */
  function renderAlerts() {
    const activeEl   = document.getElementById('alertsActiveList');
    const historyEl  = document.getElementById('alertsHistoryList');
    const badgeEl    = document.getElementById('alertsBadge');

    const active    = App.alerts.filter(a => a.active);
    const triggered = App.alerts.filter(a => !a.active && a.triggered_at);

    if (activeEl) {
      activeEl.innerHTML = active.length
        ? active.map(a => alertRow(a, false)).join('')
        : '<div class="empty-state">No hay alertas activas.</div>';
    }
    if (historyEl) {
      historyEl.innerHTML = triggered.length
        ? triggered.slice(0, 20).map(a => alertRow(a, true)).join('')
        : '<div class="empty-state">Sin disparos aún.</div>';
    }
    if (badgeEl) {
      badgeEl.textContent = active.length;
      badgeEl.classList.toggle('hidden', active.length === 0);
    }
  }

  function alertRow(a, isTriggered) {
    return `
      <div class="alert-item ${isTriggered ? 'triggered' : ''}" data-id="${a.id}">
        <div class="alert-info">
          <div class="alert-pair">${a.pair}</div>
          <div class="alert-desc">${Alerts.describeAlert(a)}</div>
          ${isTriggered ? `<div class="alert-time">${fmtTime(a.triggered_at)}</div>` : ''}
        </div>
        ${!isTriggered ? `<button class="btn-danger" onclick="UI.deleteAlert('${a.id}')">✕</button>` : ''}
      </div>`;
  }

  /** @description Elimina una alerta localmente y en Supabase. */
  function deleteAlert(id) {
    App.alerts = App.alerts.filter(a => a.id !== id);
    SupabaseClient.deleteAlert(id).catch(() => {});
    renderAlerts();
    showToast('Alerta eliminada', 'success');
  }

  // ===== CONFIG =====

  /** @description Rellena el panel de config con los valores guardados. */
  function renderConfig() {
    setInput('cfgGeminiKey',   App.config.geminiKey);
    setInput('cfgSupabaseUrl', App.config.supabaseUrl);
    setInput('cfgSupabaseKey', App.config.supabaseKey);

    const notif  = document.getElementById('cfgNotif');
    const sound  = document.getElementById('cfgSound');
    const tf     = document.getElementById('cfgDefaultTf');
    if (notif) notif.checked = App.config.notificationsOn !== false;
    if (sound) sound.checked = App.config.soundOn !== false;
    if (tf)    tf.value      = App.config.defaultTimeframe || '5m';

    renderPairChips();
  }

  /** @description Chips de pares en config. */
  function renderPairChips() {
    const el = document.getElementById('pairChips');
    if (!el) return;
    el.innerHTML = App.pairs.map(p => `
      <span class="pair-chip">
        ${p.replace('USDT','')}
        <button class="pair-chip-rm" onclick="UI.removePair('${p}')">✕</button>
      </span>`).join('');
  }

  /** @description Actualiza los selects de pares en el modal de alertas. */
  function renderPairSelects() {
    const sel = document.getElementById('alertPairSel');
    if (!sel) return;
    const cur = sel.value;
    sel.innerHTML = App.pairs.map(p =>
      `<option value="${p}" ${p === cur ? 'selected' : ''}>${p.replace('USDT','/USDT')}</option>`
    ).join('');
  }

  /** @description Elimina un par. */
  function removePair(pair) {
    if (App.pairs.length <= 1) return showToast('Debe haber al menos 1 par', 'warning');
    App.pairs = App.pairs.filter(p => p !== pair);
    localStorage.setItem('gammatr_pairs', JSON.stringify(App.pairs));
    renderPairChips();
    renderPairSelects();
    renderWatchlist();
    showToast(`${pair} eliminado`, 'success');
  }

  // ===== NAVEGACIÓN =====

  /** @description Cambia el par seleccionado y recarga datos. */
  function selectPair(pair) {
    App.selectedPair = pair;

    // Actualizar selected en watchlist desktop
    document.querySelectorAll('#watchlistDesktop .wl-row').forEach(r =>
      r.classList.toggle('selected', r.dataset.pair === pair));

    // Actualizar labels
    setEl('chartPairLabel', pair);
    setEl('headerPair',     pair.replace('USDT',''));
    setEl('mobPairName',    pair.replace('USDT',''));
    setEl('mobChartPairLabel', pair);
    setEl('aiPairLabel', pair);

    const d = App.priceData[pair] || {};
    if (d.price) {
      setEl('chartPriceLabel', fmtPrice(d.price));
      setEl('mobPrice',        fmtPrice(d.price));
    }

    // Recargar datos del chart
    window.loadPairCharts(pair, App.selectedTimeframe);
  }

  /** @description Navega a una tab en móvil. */
  function goTab(tabName) {
    document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const pane = document.getElementById(`tab${tabName}`);
    const btn  = document.querySelector(`.nav-btn[data-tab="${tabName}"]`);
    if (pane) pane.classList.add('active');
    if (btn)  btn.classList.add('active');
    if (tabName === 'Config')    renderConfig();
    if (tabName === 'Alerts')    renderAlerts();
    if (tabName === 'Watchlist') renderWatchlistMobile();
  }

  // ===== TOAST =====

  /**
   * @description Muestra un toast temporal.
   * @param {string} msg @param {'success'|'error'|'warning'|'info'} type @param {number} ms
   */
  function showToast(msg, type = 'info', ms = 3500) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const icons = { success:'✓', error:'✗', warning:'⚠', info:'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
    container.appendChild(toast);
    setTimeout(() => { toast.classList.add('fade-out'); setTimeout(() => toast.remove(), 300); }, ms);
  }

  // ===== HELPERS INTERNOS =====

  function setEl(id, txt)   { const e = document.getElementById(id); if (e) e.textContent = txt; }
  function setInput(id, val){ const e = document.getElementById(id); if (e) e.value = val || ''; }
  function setBadge(id, txt, cls) {
    const e = document.getElementById(id);
    if (!e) return;
    e.textContent = txt;
    e.className   = `ind-badge ${cls}`;
  }
  function setMobBadge(id, txt, cls) {
    const e = document.getElementById(id);
    if (!e) return;
    e.textContent = txt;
    e.className   = `mob-ind-badge signal-badge ${cls === 'pos' ? 'BUY' : cls === 'neg' ? 'SELL' : 'WAIT'}`;
  }

  // ===== INIT =====

  /** @description Bindings de UI que no dependen del estado de la app. */
  function bindEvents() {
    // Bottom nav (móvil)
    document.querySelectorAll('.nav-btn[data-tab]').forEach(btn =>
      btn.addEventListener('click', () => goTab(btn.dataset.tab)));

    // Timeframe buttons (todos: desktop + móvil)
    document.querySelectorAll('.tf-btn[data-tf]').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll(`.tf-btn[data-tf="${btn.dataset.tf}"]`).forEach(b => b.classList.add('active'));
        App.selectedTimeframe = btn.dataset.tf;
        destroyCharts();
        window.loadPairCharts(App.selectedPair, btn.dataset.tf);
        window.Binance?.resubscribe(App.pairs, btn.dataset.tf);
      }));

    // Prev/Next par en chart (desktop + móvil)
    ['prevPairBtn','mobPrevPair'].forEach(id =>
      document.getElementById(id)?.addEventListener('click', () => {
        const idx = App.pairs.indexOf(App.selectedPair);
        if (idx > 0) selectPair(App.pairs[idx - 1]);
      }));
    ['nextPairBtn','mobNextPair'].forEach(id =>
      document.getElementById(id)?.addEventListener('click', () => {
        const idx = App.pairs.indexOf(App.selectedPair);
        if (idx < App.pairs.length - 1) selectPair(App.pairs[idx + 1]);
      }));

    // Swipe en chart móvil
    const mobChart = document.getElementById('mobChartWrap');
    if (mobChart) {
      let startX = 0;
      mobChart.addEventListener('touchstart', e => { startX = e.changedTouches[0].clientX; }, { passive: true });
      mobChart.addEventListener('touchend',   e => {
        const dx = e.changedTouches[0].clientX - startX;
        if (Math.abs(dx) < 50) return;
        const idx = App.pairs.indexOf(App.selectedPair);
        if (dx < 0 && idx < App.pairs.length - 1) selectPair(App.pairs[idx + 1]);
        else if (dx > 0 && idx > 0)               selectPair(App.pairs[idx - 1]);
      }, { passive: true });
    }

    // Watchlist filters
    document.querySelectorAll('.wl-filter').forEach(btn =>
      btn.addEventListener('click', () => {
        document.querySelectorAll('.wl-filter').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderWatchlistMobile(btn.dataset.filter);
      }));

    // IA toggle móvil
    document.getElementById('mobAiToggle')?.addEventListener('click', () => {
      const body   = document.getElementById('mobAiBody');
      const header = document.getElementById('mobAiToggle');
      body?.classList.toggle('hidden');
      header?.classList.toggle('open');
    });

    // Modal alerta
    document.getElementById('newAlertBtn')?.addEventListener('click', () =>
      document.getElementById('alertModal').classList.remove('hidden'));
    document.getElementById('closeAlertModal')?.addEventListener('click', () =>
      document.getElementById('alertModal').classList.add('hidden'));
    document.getElementById('alertTypeSel')?.addEventListener('change', e => {
      const noThresh = ['MACD_BULLISH_CROSS','MACD_BEARISH_CROSS'].includes(e.target.value);
      document.getElementById('alertThresholdGroup').classList.toggle('hidden', noThresh);
    });

    // Eye buttons (mostrar/ocultar contraseña)
    document.querySelectorAll('.eye-btn').forEach(btn =>
      btn.addEventListener('click', () => {
        const input = document.getElementById(btn.dataset.target);
        if (input) input.type = input.type === 'password' ? 'text' : 'password';
      }));

    // Config pair add
    document.getElementById('addPairBtn')?.addEventListener('click', () => window.handleAddPair());
    document.getElementById('addPairInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') window.handleAddPair();
    });
  }

  function setChartsLoading(on) {
    const el = document.getElementById('chartsLoadingOverlay');
    if (el) el.classList.toggle('hidden', !on);
  }

  function setGeminiLoading(on) {
    const btn = document.getElementById('analyzeBtn');
    const mob = document.getElementById('mobAnalyzeBtn');
    const txt = on ? 'Analizando...' : 'Analizar con IA';
    if (btn) { btn.disabled = on; btn.textContent = txt; }
    if (mob) { mob.disabled = on; mob.textContent = txt; }
  }

  function highlightActivePair(pair) {
    document.querySelectorAll('.wl-row').forEach(r => r.classList.remove('active'));
    document.querySelector(`.wl-row[data-pair="${pair}"]`)?.classList.add('active');
  }

  function closeAlertModal() {
    const modal = document.getElementById('alertModal');
    if (modal) modal.classList.add('hidden');
  }

  return {
    fmtPrice, fmtPct, fmtTime,
    renderWatchlist, renderWatchlistMobile, refreshPriceRow,
    renderCharts, renderMobChart, destroyCharts,
    renderIndicators,
    renderAIAnalysis,
    renderAlerts, deleteAlert,
    renderConfig, renderPairChips, renderPairSelects, removePair,
    selectPair, goTab,
    showToast,
    bindEvents,
    setChartsLoading, setGeminiLoading, highlightActivePair, closeAlertModal,
  };
})();
