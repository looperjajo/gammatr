/**
 * @file app.js
 * @description Punto de entrada principal de GammaTR.
 * Inicializa todos los módulos, carga datos y arranca la app.
 */
(() => {
  'use strict';

  const App = window.GammaTR;

  // ===== CONFIG =====

  function loadConfig() {
    App.config.geminiKey        = localStorage.getItem('gammatr_gemini_key')   || '';
    App.config.supabaseUrl      = localStorage.getItem('gammatr_supabase_url') || '';
    App.config.supabaseKey      = localStorage.getItem('gammatr_supabase_key') || '';
    App.config.theme            = localStorage.getItem('gammatr_theme')        || 'dark';
    App.config.defaultTimeframe = localStorage.getItem('gammatr_timeframe')    || '5m';
    App.config.notificationsOn  = localStorage.getItem('gammatr_notif')  !== 'false';
    App.config.soundOn          = localStorage.getItem('gammatr_sound')  !== 'false';

    const savedPairs = localStorage.getItem('gammatr_pairs');
    if (savedPairs) {
      try {
        const p = JSON.parse(savedPairs);
        if (Array.isArray(p) && p.length) App.pairs = p;
      } catch (e) {}
    }

    App.selectedTimeframe = App.config.defaultTimeframe;
    applyTheme(App.config.theme);
  }

  function saveConfig() {
    localStorage.setItem('gammatr_gemini_key',   App.config.geminiKey);
    localStorage.setItem('gammatr_supabase_url', App.config.supabaseUrl);
    localStorage.setItem('gammatr_supabase_key', App.config.supabaseKey);
    localStorage.setItem('gammatr_theme',        App.config.theme);
    localStorage.setItem('gammatr_timeframe',    App.config.defaultTimeframe);
    localStorage.setItem('gammatr_notif',        String(App.config.notificationsOn));
    localStorage.setItem('gammatr_sound',        String(App.config.soundOn));
    localStorage.setItem('gammatr_pairs',        JSON.stringify(App.pairs));
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
  }

  // ===== LOAD PAIR CHARTS =====

  /**
   * @description Carga klines históricos, recalcula indicadores y renderiza los 3 charts.
   * @param {string} pair @param {string} timeframe
   */
  window.loadPairCharts = async function loadPairCharts(pair, timeframe) {
    App.selectedPair      = pair;
    App.selectedTimeframe = timeframe;

    const tfSel    = document.getElementById('timeframeSelect');
    const tfSelMob = document.getElementById('tfSelectMob');
    if (tfSel)    tfSel.value    = timeframe;
    if (tfSelMob) tfSelMob.value = timeframe;

    UI.setChartsLoading(true);

    try {
      const klines = await Binance.fetchKlines(pair, timeframe, 300);
      if (!klines.length) { UI.setChartsLoading(false); return; }

      const built    = Indicators.buildChartData(klines);
      const cacheKey = `${pair}_${timeframe}`;
      App.indicatorCache[cacheKey] = built;

      const sig = Signals.generate(built.last, klines[klines.length - 1].close);
      App.signals[pair] = sig;

      UI.renderCharts(built.arrays);
      UI.renderIndicators(built.last);
      UI.refreshPriceRow(pair);
      UI.highlightActivePair(pair);

      Binance.resubscribe(App.pairs, timeframe);
    } catch (e) {
      console.warn('[App] loadPairCharts error:', e.message);
    }

    UI.setChartsLoading(false);
  };

  // ===== ADD / REMOVE PAIR =====

  window.handleAddPair = function handleAddPair() {
    const input = document.getElementById('addPairInput');
    if (!input) return;
    const val = input.value.trim().toUpperCase().replace(/\s/g, '');
    if (!val || App.pairs.includes(val)) { input.value = ''; return; }
    App.pairs.push(val);
    saveConfig();
    UI.renderWatchlist();
    UI.renderPairSelects();
    UI.renderPairChips();
    Binance.resubscribe(App.pairs, App.selectedTimeframe);
    Binance.fetchTickers();
    input.value = '';
  };

  window.handleRemovePair = function handleRemovePair(pair) {
    const idx = App.pairs.indexOf(pair);
    if (idx === -1) return;
    App.pairs.splice(idx, 1);
    saveConfig();
    UI.renderWatchlist();
    UI.renderPairSelects();
    UI.renderPairChips();
    if (App.selectedPair === pair && App.pairs.length) {
      window.loadPairCharts(App.pairs[0], App.selectedTimeframe);
    }
    Binance.resubscribe(App.pairs, App.selectedTimeframe);
  };

  // ===== GEMINI ANALYZE =====

  async function runGeminiAnalysis() {
    const pair      = App.selectedPair;
    const timeframe = App.selectedTimeframe;
    const cacheKey  = `${pair}_${timeframe}`;
    const cached    = App.indicatorCache[cacheKey];
    const price     = App.priceData[pair]?.price ?? 0;

    if (!price || !cached) {
      UI.showToast('Sin datos suficientes para el análisis.', 'warning');
      return;
    }

    UI.setGeminiLoading(true);

    try {
      const klines   = App.klineCache[cacheKey] || [];
      const analysis = await Gemini.analyze(pair, cached.last, price, timeframe, klines);
      App.geminiAnalysis = analysis;
      UI.renderAIAnalysis(analysis);

      await SupabaseClient.saveSignal({
        pair,
        timeframe,
        signal:          analysis.signal,
        score:           analysis.confidence,
        indicators:      cached.last,
        gemini_analysis: analysis,
        price,
      }).catch(() => {});

    } catch (e) {
      UI.showToast(`Gemini: ${e.message}`, 'error');
    }

    UI.setGeminiLoading(false);
  }

  function startGeminiTimer() {
    if (App.geminiTimer) clearInterval(App.geminiTimer);
    App.geminiTimer = setInterval(() => {
      if (App.config.geminiKey) runGeminiAnalysis();
    }, 15 * 60 * 1000);
  }

  // ===== ALERTS =====

  window.handleSaveAlert = async function handleSaveAlert() {
    const pairSel  = document.getElementById('alertPairSelect');
    const typeSel  = document.getElementById('alertTypeSelect');
    const threshEl = document.getElementById('alertThreshold');
    if (!pairSel || !typeSel) return;

    const pair       = pairSel.value;
    const alert_type = typeSel.value;
    const threshold  = parseFloat(threshEl?.value) || 0;

    const noThresh = ['MACD_BULLISH_CROSS', 'MACD_BEARISH_CROSS'];
    if (!noThresh.includes(alert_type) && !threshold) {
      UI.showToast('Indica un umbral válido.', 'warning');
      return;
    }

    const alert = {
      id:           `alert_${Date.now()}`,
      pair,
      alert_type,
      threshold,
      active:       true,
      created_at:   new Date().toISOString(),
      triggered_at: null,
    };

    const saved = await SupabaseClient.saveAlert(alert).catch(() => null);
    App.alerts.push(saved || alert);

    UI.renderAlerts();
    UI.closeAlertModal();
    UI.showToast('Alerta creada ✓', 'success');
  };

  window.handleDeleteAlert = async function handleDeleteAlert(id) {
    const idx = App.alerts.findIndex(a => a.id === id);
    if (idx === -1) return;
    App.alerts.splice(idx, 1);
    await SupabaseClient.deleteAlert(id).catch(() => {});
    UI.renderAlerts();
  };

  // ===== CONFIG PANEL =====

  function bindConfigHandlers() {
    const saveKeysBtn = document.getElementById('saveKeysBtn');
    if (saveKeysBtn) {
      saveKeysBtn.addEventListener('click', () => {
        App.config.geminiKey   = document.getElementById('geminiKeyInput')?.value.trim()  || '';
        App.config.supabaseUrl = document.getElementById('supabaseUrlInput')?.value.trim()|| '';
        App.config.supabaseKey = document.getElementById('supabaseKeyInput')?.value.trim()|| '';
        saveConfig();
        if (App.config.supabaseUrl && App.config.supabaseKey) {
          SupabaseClient.init(App.config.supabaseUrl, App.config.supabaseKey);
        }
        UI.showToast('Configuración guardada ✓', 'success');
      });
    }

    const themeToggle = document.getElementById('themeToggle');
    if (themeToggle) {
      themeToggle.checked = App.config.theme === 'light';
      themeToggle.addEventListener('change', () => {
        App.config.theme = themeToggle.checked ? 'light' : 'dark';
        applyTheme(App.config.theme);
        saveConfig();
      });
    }

    const notifToggle = document.getElementById('notifToggle');
    if (notifToggle) {
      notifToggle.checked = App.config.notificationsOn;
      notifToggle.addEventListener('change', () => {
        App.config.notificationsOn = notifToggle.checked;
        saveConfig();
        if (notifToggle.checked) Alerts.requestPermissions();
      });
    }

    const soundToggle = document.getElementById('soundToggle');
    if (soundToggle) {
      soundToggle.checked = App.config.soundOn;
      soundToggle.addEventListener('change', () => {
        App.config.soundOn = soundToggle.checked;
        saveConfig();
      });
    }

    const defTf = document.getElementById('defaultTfSelect');
    if (defTf) {
      defTf.value = App.config.defaultTimeframe;
      defTf.addEventListener('change', () => {
        App.config.defaultTimeframe = defTf.value;
        saveConfig();
      });
    }

    const analyzeBtn    = document.getElementById('analyzeBtn');
    const mobAnalyzeBtn = document.getElementById('mobAnalyzeBtn');
    if (analyzeBtn)    analyzeBtn.addEventListener('click', runGeminiAnalysis);
    if (mobAnalyzeBtn) mobAnalyzeBtn.addEventListener('click', runGeminiAnalysis);

    // Prefill
    const gi  = document.getElementById('geminiKeyInput');
    const sbu = document.getElementById('supabaseUrlInput');
    const sbk = document.getElementById('supabaseKeyInput');
    if (gi)  gi.value  = App.config.geminiKey;
    if (sbu) sbu.value = App.config.supabaseUrl;
    if (sbk) sbk.value = App.config.supabaseKey;
  }

  // ===== SETUP OVERLAY =====

  function bindSetupHandlers() {
    const overlay      = document.getElementById('setupOverlay');
    const saveSetupBtn = document.getElementById('saveSetupBtn');
    const skipSetupBtn = document.getElementById('skipSetupBtn');

    if (saveSetupBtn) {
      saveSetupBtn.addEventListener('click', () => {
        App.config.geminiKey   = document.getElementById('setupGeminiKey')?.value.trim()   || '';
        App.config.supabaseUrl = document.getElementById('setupSupabaseUrl')?.value.trim() || '';
        App.config.supabaseKey = document.getElementById('setupSupabaseKey')?.value.trim() || '';
        saveConfig();
        localStorage.setItem('gammatr_setup_done', '1');
        if (App.config.supabaseUrl && App.config.supabaseKey) {
          SupabaseClient.init(App.config.supabaseUrl, App.config.supabaseKey);
        }
        if (overlay) overlay.classList.add('hidden');
        startApp();
      });
    }

    if (skipSetupBtn) {
      skipSetupBtn.addEventListener('click', () => {
        localStorage.setItem('gammatr_setup_done', '1');
        if (overlay) overlay.classList.add('hidden');
        startApp();
      });
    }
  }

  // ===== CLOCK =====

  function startClock() {
    const tick = () => {
      const el = document.getElementById('clockEl');
      if (el) el.textContent = new Date().toLocaleTimeString('es-ES');
    };
    tick();
    setInterval(tick, 1000);
  }

  // ===== START APP =====

  async function startApp() {
    const [savedAlerts, savedSignals] = await Promise.all([
      SupabaseClient.getAlerts().catch(() => []),
      SupabaseClient.getSignals(null, 50).catch(() => []),
    ]);
    if (savedAlerts.length)  App.alerts        = savedAlerts;
    if (savedSignals.length) App.signalHistory  = savedSignals;

    UI.renderWatchlist();
    UI.renderPairSelects();
    UI.renderPairChips();
    UI.renderAlerts();
    UI.bindEvents();
    bindConfigHandlers();

    Binance.fetchTickers().catch(() => {}); // no bloquear si hay CORS
    Binance.connect(App.pairs, App.selectedTimeframe);
    await window.loadPairCharts(App.selectedPair, App.selectedTimeframe);

    startGeminiTimer();
    startClock();
    Alerts.requestPermissions();
  }

  // ===== ENTRY POINT =====

  document.addEventListener('DOMContentLoaded', () => {
    loadConfig();
    bindSetupHandlers();

    const splash = document.getElementById('splash');
    setTimeout(() => {
      if (splash) splash.classList.add('hidden');

      const setupDone = localStorage.getItem('gammatr_setup_done');
      const overlay   = document.getElementById('setupOverlay');

      if (!setupDone) {
        if (overlay) overlay.classList.remove('hidden');
        // La app arranca cuando el usuario guarda/salta el setup
      } else {
        if (overlay) overlay.classList.add('hidden');
        startApp();
      }
    }, 1500);
  });

})();
