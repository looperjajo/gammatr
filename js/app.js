/**
 * @file app.js
 * @description Punto de entrada de GammaTR. Estado global, inicialización y orquestación de módulos.
 */

// ===== ESTADO GLOBAL =====
window.GammaTR = {
  // Pares por defecto
  pairs: ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','DOGEUSDT',
          'ADAUSDT','XRPUSDT','TRXUSDT','LINKUSDT','WIFUSDT'],

  // Precios y datos en vivo (par -> datos)
  priceData: {},

  // Klines cargadas por par+timeframe (clave: "BTCUSDT_5m")
  klineCache: {},

  // Indicadores calculados (par -> indicadores)
  indicators: {},

  // Señales activas (par -> señal)
  signals: {},

  // Alertas activas
  alerts: [],

  // Par e intervalo seleccionados en el chart
  selectedPair: 'BTCUSDT',
  selectedTimeframe: '5m',

  // Historial de señales (local + Supabase)
  signalHistory: [],

  // Configuración de usuario
  config: {
    geminiKey:    '',
    supabaseUrl:  '',
    supabaseKey:  '',
    theme:        'dark',
  },

  // Referencia al chart de Chart.js
  chart: null,

  // Swipe tracking para el chart
  touchStartX: 0,
};

const App = window.GammaTR;

// ===== CARGA DE CONFIG DESDE LOCALSTORAGE =====
/**
 * @description Lee la configuración guardada en localStorage y la mete en App.config.
 */
function loadConfig() {
  App.config.geminiKey   = localStorage.getItem('gammatr_gemini_key')    || '';
  App.config.supabaseUrl = localStorage.getItem('gammatr_supabase_url')  || '';
  App.config.supabaseKey = localStorage.getItem('gammatr_supabase_key')  || '';
  App.config.theme       = localStorage.getItem('gammatr_theme')         || 'dark';

  // Pares guardados
  const savedPairs = localStorage.getItem('gammatr_pairs');
  if (savedPairs) {
    try { App.pairs = JSON.parse(savedPairs); } catch(e) {}
  }
}

/**
 * @description Guarda la configuración en localStorage.
 * @param {Object} cfg - Objeto con las claves a guardar.
 */
function saveConfig(cfg = {}) {
  if (cfg.geminiKey   !== undefined) localStorage.setItem('gammatr_gemini_key',   cfg.geminiKey);
  if (cfg.supabaseUrl !== undefined) localStorage.setItem('gammatr_supabase_url', cfg.supabaseUrl);
  if (cfg.supabaseKey !== undefined) localStorage.setItem('gammatr_supabase_key', cfg.supabaseKey);
  if (cfg.theme       !== undefined) localStorage.setItem('gammatr_theme',        cfg.theme);
  if (cfg.pairs       !== undefined) localStorage.setItem('gammatr_pairs',        JSON.stringify(cfg.pairs));
  Object.assign(App.config, cfg);
}

// ===== GESTIÓN DE SECCIONES (navegación) =====
/**
 * @description Activa la sección indicada y actualiza el nav.
 * @param {string} sectionName - 'Dashboard' | 'Signals' | 'Alerts' | 'Config'
 */
function navigateTo(sectionName) {
  const sectionMap = {
    Dashboard: 'sectionDashboard',
    Signals:   'sectionSignals',
    Alerts:    'sectionAlerts',
    Config:    'sectionConfig',
  };

  // Ocultar todas las secciones
  Object.values(sectionMap).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });

  // Activar la sección seleccionada
  const target = document.getElementById(sectionMap[sectionName]);
  if (target) target.classList.add('active');

  // Actualizar nav buttons
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.section === sectionName);
  });

  // Acciones específicas al entrar en sección
  if (sectionName === 'Config')  UI.renderConfigSection();
  if (sectionName === 'Alerts')  UI.renderAlertsList();
  if (sectionName === 'Signals') UI.renderSignalHistory();
}

// ===== SETUP OVERLAY =====
/**
 * @description Comprueba si es la primera visita y muestra el overlay de setup.
 */
function checkFirstVisit() {
  const hasSetup = localStorage.getItem('gammatr_setup_done');
  if (!hasSetup) {
    document.getElementById('setupOverlay').classList.remove('hidden');
  }
}

/**
 * @description Guarda las claves del overlay de setup y arranca la app.
 */
function handleSetupSave() {
  const geminiKey   = document.getElementById('setupGeminiKey').value.trim();
  const supabaseUrl = document.getElementById('setupSupabaseUrl').value.trim();
  const supabaseKey = document.getElementById('setupSupabaseKey').value.trim();

  saveConfig({ geminiKey, supabaseUrl, supabaseKey });
  localStorage.setItem('gammatr_setup_done', '1');
  document.getElementById('setupOverlay').classList.add('hidden');
  startApp();
}

// ===== RELOJ EN TIEMPO REAL =====
/**
 * @description Actualiza el reloj del header cada segundo.
 */
function startClock() {
  const el = document.getElementById('headerTime');
  const tick = () => {
    const now = new Date();
    el.textContent = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

// ===== SWIPE ENTRE PARES =====
/**
 * @description Registra eventos de swipe en el contenedor del chart para cambiar de par.
 */
function setupChartSwipe() {
  const container = document.querySelector('.chart-container');
  if (!container) return;

  container.addEventListener('touchstart', e => {
    App.touchStartX = e.changedTouches[0].clientX;
  }, { passive: true });

  container.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - App.touchStartX;
    if (Math.abs(dx) < 50) return; // threshold mínimo de swipe

    const currentIdx = App.pairs.indexOf(App.selectedPair);
    if (dx < 0 && currentIdx < App.pairs.length - 1) {
      // swipe izquierda → siguiente par
      App.selectedPair = App.pairs[currentIdx + 1];
    } else if (dx > 0 && currentIdx > 0) {
      // swipe derecha → par anterior
      App.selectedPair = App.pairs[currentIdx - 1];
    }
    UI.updateChartForPair(App.selectedPair);
  }, { passive: true });
}

// ===== SETUP DE EVENTOS DE UI =====
/**
 * @description Registra todos los event listeners de la interfaz.
 */
function bindUIEvents() {
  // Bottom navigation
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigateTo(btn.dataset.section));
  });

  // Setup overlay
  document.getElementById('setupSaveBtn')?.addEventListener('click', handleSetupSave);
  document.getElementById('setupSkipBtn')?.addEventListener('click', () => {
    localStorage.setItem('gammatr_setup_done', '1');
    document.getElementById('setupOverlay').classList.add('hidden');
    startApp();
  });

  // Timeframe del dashboard
  document.getElementById('timeframeSelect')?.addEventListener('change', e => {
    App.selectedTimeframe = e.target.value;
    UI.updateChartForPair(App.selectedPair);
    Binance.resubscribeAll(App.selectedTimeframe);
  });

  // Botones de navegación del chart
  document.getElementById('prevPairBtn')?.addEventListener('click', () => {
    const idx = App.pairs.indexOf(App.selectedPair);
    if (idx > 0) {
      App.selectedPair = App.pairs[idx - 1];
      UI.updateChartForPair(App.selectedPair);
    }
  });
  document.getElementById('nextPairBtn')?.addEventListener('click', () => {
    const idx = App.pairs.indexOf(App.selectedPair);
    if (idx < App.pairs.length - 1) {
      App.selectedPair = App.pairs[idx + 1];
      UI.updateChartForPair(App.selectedPair);
    }
  });

  // Selección de fila en tabla de precios
  document.getElementById('pricesBody')?.addEventListener('click', e => {
    const row = e.target.closest('tr[data-pair]');
    if (row) {
      App.selectedPair = row.dataset.pair;
      // Quitar selected de todas
      document.querySelectorAll('#pricesBody tr').forEach(r => r.classList.remove('selected'));
      row.classList.add('selected');
      UI.updateChartForPair(App.selectedPair);
    }
  });

  // Panel de señales IA — botón analizar
  document.getElementById('analyzeBtn')?.addEventListener('click', handleAnalyzeClick);

  // Formulario de alertas
  document.getElementById('alertTypeSelect')?.addEventListener('change', handleAlertTypeChange);
  document.getElementById('addAlertBtn')?.addEventListener('click', handleAddAlert);

  // Config — guardar claves
  document.getElementById('saveKeysBtn')?.addEventListener('click', handleSaveKeys);

  // Config — mostrar/ocultar contraseñas
  document.querySelectorAll('.toggle-visibility').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.dataset.target);
      if (!input) return;
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  });

  // Config — añadir par
  document.getElementById('addPairBtn')?.addEventListener('click', handleAddPair);
  document.getElementById('addPairInput')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') handleAddPair();
  });

  // Config — tema
  document.getElementById('themeToggle')?.addEventListener('change', e => {
    const theme = e.target.checked ? 'light' : 'dark';
    saveConfig({ theme });
    applyTheme(theme);
  });

  // Swipe en chart
  setupChartSwipe();

  // Soporte de URL hash para shortcuts del manifest
  if (window.location.hash === '#alerts')  navigateTo('Alerts');
  if (window.location.hash === '#signals') navigateTo('Signals');
}

// ===== ACCIONES DE FORMULARIOS =====

/** @description Maneja el clic en "Analizar con IA" */
async function handleAnalyzeClick() {
  const pair      = document.getElementById('signalPairSelect').value;
  const timeframe = document.getElementById('signalTimeframeSelect').value;
  const btn       = document.getElementById('analyzeBtn');
  const btnText   = document.getElementById('analyzeBtnText');
  const btnLoader = document.getElementById('analyzeBtnLoader');

  if (!App.config.geminiKey || App.config.geminiKey === 'YOUR_GEMINI_KEY_HERE') {
    UI.showToast('Configura tu Gemini API Key en Configuración', 'warning');
    navigateTo('Config');
    return;
  }

  btn.disabled = true;
  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');

  try {
    // Asegurar que tenemos klines para este par/timeframe
    const cacheKey = `${pair}_${timeframe}`;
    if (!App.klineCache[cacheKey]) {
      await Binance.fetchKlines(pair, timeframe);
    }
    const klines = App.klineCache[cacheKey] || [];
    const inds   = App.indicators[pair] || {};

    const analysis = await Gemini.analyze(pair, timeframe, klines, inds);
    UI.renderGeminiResult(pair, analysis);

    // Guardar en Supabase + historial local
    const signal = {
      pair,
      signal_type: analysis.signal,
      score:       analysis.score,
      price:       App.priceData[pair]?.price || null,
      rsi:         inds.rsi?.value || null,
      macd:        inds.macd?.histogram || null,
      ema_cross:   inds.ema?.cross || null,
      gemini_analysis: analysis.text,
    };
    await SupabaseClient.saveSignal(signal);
    App.signalHistory.unshift({ ...signal, created_at: new Date().toISOString() });
    App.signals[pair] = { type: analysis.signal, score: analysis.score };
    UI.refreshPriceRow(pair);
    UI.renderSignalHistory();

  } catch (err) {
    console.error('[Gemini] Error:', err);
    UI.showToast(`Error al analizar: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
  }
}

/** @description Muestra/oculta el campo de threshold según el tipo de alerta */
function handleAlertTypeChange() {
  const type = document.getElementById('alertTypeSelect').value;
  const isSignal = type === 'SIGNAL';
  document.getElementById('thresholdGroup').classList.toggle('hidden', isSignal);
  document.getElementById('signalTargetGroup').classList.toggle('hidden', !isSignal);
}

/** @description Crea una nueva alerta */
async function handleAddAlert() {
  const pair         = document.getElementById('alertPairSelect').value;
  const alert_type   = document.getElementById('alertTypeSelect').value;
  const threshold    = parseFloat(document.getElementById('alertThreshold').value) || null;
  const signal_target= document.getElementById('alertSignalTarget').value;

  if (!pair) return UI.showToast('Selecciona un par', 'warning');
  if (alert_type !== 'SIGNAL' && threshold === null) {
    return UI.showToast('Introduce un valor para la alerta', 'warning');
  }

  const alert = {
    pair,
    alert_type,
    threshold: alert_type !== 'SIGNAL' ? threshold : null,
    signal_target: alert_type === 'SIGNAL' ? signal_target : null,
    active: true,
  };

  const saved = await SupabaseClient.saveAlert(alert);
  const localAlert = saved || { ...alert, id: Date.now().toString(), created_at: new Date().toISOString() };
  App.alerts.push(localAlert);

  UI.renderAlertsList();
  UI.showToast(`Alerta ${pair} creada`, 'success');

  // Limpiar campos
  document.getElementById('alertThreshold').value = '';
}

/** @description Guarda las claves desde el panel de config */
function handleSaveKeys() {
  const geminiKey   = document.getElementById('cfgGeminiKey').value.trim();
  const supabaseUrl = document.getElementById('cfgSupabaseUrl').value.trim();
  const supabaseKey = document.getElementById('cfgSupabaseKey').value.trim();

  saveConfig({ geminiKey, supabaseUrl, supabaseKey });

  // Reinicializar Supabase si se cambiaron las claves
  if (supabaseUrl && supabaseKey) {
    SupabaseClient.init(supabaseUrl, supabaseKey);
  }

  const msg = document.getElementById('saveKeysMsg');
  msg.textContent = '✓ Claves guardadas correctamente';
  msg.className = 'save-msg success';
  setTimeout(() => msg.classList.add('hidden'), 3000);
}

/** @description Añade un nuevo par a la lista */
async function handleAddPair() {
  const input = document.getElementById('addPairInput');
  let symbol = input.value.trim().toUpperCase();
  if (!symbol) return;
  if (!symbol.endsWith('USDT')) symbol += 'USDT';
  if (App.pairs.includes(symbol)) {
    return UI.showToast(`${symbol} ya está en la lista`, 'warning');
  }

  App.pairs.push(symbol);
  saveConfig({ pairs: App.pairs });
  input.value = '';

  UI.renderPairsChips();
  UI.renderPairSelects();
  UI.addPriceRow(symbol);
  Binance.subscribeSymbol(symbol, App.selectedTimeframe);
  UI.showToast(`${symbol} añadido`, 'success');
}

// ===== TEMA =====
/**
 * @description Aplica el tema claro u oscuro al body.
 * @param {string} theme - 'light' | 'dark'
 */
function applyTheme(theme) {
  document.body.classList.toggle('light-theme', theme === 'light');
  const toggle = document.getElementById('themeToggle');
  if (toggle) toggle.checked = theme === 'light';
}

// ===== ARRANQUE PRINCIPAL =====
/**
 * @description Inicia todos los módulos y arranca la conexión Binance.
 */
async function startApp() {
  // Mostrar la app, ocultar splash
  document.getElementById('app').classList.remove('hidden');

  // Inicializar Supabase si hay config
  if (App.config.supabaseUrl && App.config.supabaseKey) {
    SupabaseClient.init(App.config.supabaseUrl, App.config.supabaseKey);
    // Cargar alertas guardadas
    const dbAlerts = await SupabaseClient.getAlerts().catch(() => []);
    if (dbAlerts.length) App.alerts = dbAlerts;
    // Cargar historial de señales
    const history = await SupabaseClient.getSignalHistory(null, 50).catch(() => []);
    if (history.length) App.signalHistory = history;
  }

  // Pedir permisos de notificaciones
  Alerts.requestPermissions();

  // Renderizar UI inicial
  UI.init();
  UI.renderPriceTable();
  UI.renderPairSelects();
  UI.renderSignalHistory();
  UI.renderAlertsList();

  // Aplicar tema
  applyTheme(App.config.theme);

  // Conectar WebSocket Binance
  Binance.connect(App.pairs, App.selectedTimeframe);

  // Cargar klines para el par seleccionado
  Binance.fetchKlines(App.selectedPair, App.selectedTimeframe).then(() => {
    UI.updateChartForPair(App.selectedPair);
  });

  startClock();
  console.log('[GammaTR] App iniciada ✓');
}

// ===== PUNTO DE ENTRADA =====
document.addEventListener('DOMContentLoaded', () => {
  loadConfig();
  bindUIEvents();

  // Ocultar splash después de 1.5s
  setTimeout(() => {
    document.getElementById('splash').classList.add('hidden');
    // Ver si hay que mostrar setup o la app
    checkFirstVisit();
    const hasSetup = localStorage.getItem('gammatr_setup_done');
    if (hasSetup) startApp();
  }, 1500);
});
