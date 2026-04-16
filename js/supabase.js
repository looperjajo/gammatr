/**
 * @file supabase.js
 * @description Cliente Supabase para persistencia de señales, alertas e historial.
 * Opera en modo "graceful degradation": si Supabase no está configurado,
 * las operaciones se ignoran silenciosamente y la app sigue funcionando en modo local.
 * Expone window.SupabaseClient.
 */
window.SupabaseClient = (() => {

  // IMPORTANTE: Las claves se leen SIEMPRE de localStorage, nunca hardcodeadas
  const SUPABASE_URL = () =>
    localStorage.getItem('gammatr_supabase_url') || 'YOUR_SUPABASE_URL_HERE';
  const SUPABASE_KEY = () =>
    localStorage.getItem('gammatr_supabase_key') || 'YOUR_SUPABASE_ANON_KEY_HERE';

  let client = null; // Instancia del cliente Supabase

  /**
   * @description Inicializa el cliente Supabase con URL y clave.
   * @param {string} url - URL del proyecto Supabase
   * @param {string} key - Clave anon del proyecto
   */
  function init(url, key) {
    if (!url || !key || url === 'YOUR_SUPABASE_URL_HERE') {
      console.log('[Supabase] No configurado — modo local activo');
      client = null;
      return;
    }

    try {
      // Supabase JS v2 vía CDN expone createClient en window.supabase
      client = window.supabase.createClient(url, key, {
        auth: { persistSession: false },
        realtime: { enabled: false }, // No usamos realtime de Supabase (usamos Binance WS)
      });
      console.log('[Supabase] Cliente inicializado ✓');
    } catch (err) {
      console.warn('[Supabase] Error al inicializar:', err.message);
      client = null;
    }
  }

  /**
   * @description Comprueba si el cliente está disponible.
   * @returns {boolean}
   */
  function isAvailable() {
    return client !== null;
  }

  // ===== SEÑALES =====

  /**
   * @description Guarda una señal en la tabla `signals`.
   * @param {Object} signal - { pair, signal_type, score, price, rsi, macd, ema_cross, gemini_analysis }
   * @returns {Promise<Object|null>} - El registro guardado o null si falla/no está configurado
   */
  async function saveSignal(signal) {
    if (!isAvailable()) return null;
    try {
      const { data, error } = await client
        .from('signals')
        .insert([signal])
        .select()
        .single();

      if (error) throw error;
      console.log('[Supabase] Señal guardada:', data.id);
      return data;
    } catch (err) {
      console.warn('[Supabase] Error guardando señal:', err.message);
      return null;
    }
  }

  /**
   * @description Obtiene el historial de señales.
   * @param {string|null} pair - Filtrar por par (null = todos)
   * @param {number} limit - Máximo de registros a obtener
   * @returns {Promise<Array>}
   */
  async function getSignalHistory(pair = null, limit = 100) {
    if (!isAvailable()) return [];
    try {
      let query = client
        .from('signals')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (pair) query = query.eq('pair', pair);

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('[Supabase] Error obteniendo historial:', err.message);
      return [];
    }
  }

  /**
   * @description Obtiene estadísticas de señales por par.
   * @param {string} pair
   * @returns {Promise<{ BUY: number, SELL: number, WAIT: number }>}
   */
  async function getSignalStats(pair) {
    if (!isAvailable()) return { BUY: 0, SELL: 0, WAIT: 0 };
    try {
      const { data, error } = await client
        .from('signals')
        .select('signal_type')
        .eq('pair', pair);

      if (error) throw error;
      const stats = { BUY: 0, SELL: 0, WAIT: 0 };
      (data || []).forEach(s => {
        if (stats[s.signal_type] !== undefined) stats[s.signal_type]++;
      });
      return stats;
    } catch (err) {
      return { BUY: 0, SELL: 0, WAIT: 0 };
    }
  }

  // ===== ALERTAS =====

  /**
   * @description Guarda una nueva alerta.
   * @param {Object} alert - { pair, alert_type, threshold, signal_target, active }
   * @returns {Promise<Object|null>}
   */
  async function saveAlert(alert) {
    if (!isAvailable()) return null;
    try {
      const { data, error } = await client
        .from('alerts')
        .insert([alert])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (err) {
      console.warn('[Supabase] Error guardando alerta:', err.message);
      return null;
    }
  }

  /**
   * @description Obtiene todas las alertas activas.
   * @returns {Promise<Array>}
   */
  async function getAlerts() {
    if (!isAvailable()) return [];
    try {
      const { data, error } = await client
        .from('alerts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (err) {
      console.warn('[Supabase] Error obteniendo alertas:', err.message);
      return [];
    }
  }

  /**
   * @description Actualiza una alerta (ej: marcarla como disparada).
   * @param {string} id - UUID de la alerta
   * @param {Object} updates - Campos a actualizar
   * @returns {Promise<void>}
   */
  async function updateAlert(id, updates) {
    if (!isAvailable()) return;
    try {
      const { error } = await client
        .from('alerts')
        .update(updates)
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.warn('[Supabase] Error actualizando alerta:', err.message);
    }
  }

  /**
   * @description Elimina una alerta por ID.
   * @param {string} id
   * @returns {Promise<void>}
   */
  async function deleteAlert(id) {
    if (!isAvailable()) return;
    try {
      const { error } = await client
        .from('alerts')
        .delete()
        .eq('id', id);

      if (error) throw error;
    } catch (err) {
      console.warn('[Supabase] Error eliminando alerta:', err.message);
    }
  }

  // ===== INICIALIZACIÓN AUTOMÁTICA =====
  // Intentar inicializar al cargar si ya hay claves guardadas
  const storedUrl = localStorage.getItem('gammatr_supabase_url');
  const storedKey = localStorage.getItem('gammatr_supabase_key');
  if (storedUrl && storedKey) {
    init(storedUrl, storedKey);
  }

  // API pública
  return {
    init,
    isAvailable,
    saveSignal,
    getSignalHistory,
    getSignalStats,
    saveAlert,
    getAlerts,
    updateAlert,
    deleteAlert,
  };

})();
