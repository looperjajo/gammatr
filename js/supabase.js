/**
 * @file supabase.js
 * @description Cliente Supabase. Degradación graceful: si no hay config, todo es no-op.
 * Keys SIEMPRE de localStorage, nunca hardcodeadas.
 */
window.SupabaseClient = (() => {

  const SB_URL = () => localStorage.getItem('gammatr_supabase_url') || '';
  const SB_KEY = () => localStorage.getItem('gammatr_supabase_key') || '';

  let db = null;

  /**
   * @description Inicializa el cliente Supabase.
   * @param {string} url @param {string} key
   */
  function init(url, key) {
    if (!url || !key) { db = null; return; }
    try {
      db = window.supabase.createClient(url, key, { auth: { persistSession: false } });
      console.log('[Supabase] Inicializado ✓');
    } catch (e) {
      console.warn('[Supabase] Error al inicializar:', e.message);
      db = null;
    }
  }

  const ok = () => db !== null;

  // ===== SIGNALS =====

  /** @description Guarda una señal. @param {Object} signal @returns {Promise<Object|null>} */
  async function saveSignal(signal) {
    if (!ok()) return null;
    try {
      const { data, error } = await db.from('signals').insert([signal]).select().single();
      if (error) throw error;
      return data;
    } catch (e) { console.warn('[Supabase] saveSignal:', e.message); return null; }
  }

  /** @description Historial de señales. @param {string|null} pair @param {number} limit */
  async function getSignals(pair = null, limit = 100) {
    if (!ok()) return [];
    try {
      let q = db.from('signals').select('*').order('created_at', { ascending: false }).limit(limit);
      if (pair) q = q.eq('pair', pair);
      const { data, error } = await q;
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn('[Supabase] getSignals:', e.message); return []; }
  }

  // ===== ALERTS =====

  /** @description Guarda una alerta. */
  async function saveAlert(alert) {
    if (!ok()) return null;
    try {
      const { data, error } = await db.from('alerts').insert([alert]).select().single();
      if (error) throw error;
      return data;
    } catch (e) { console.warn('[Supabase] saveAlert:', e.message); return null; }
  }

  /** @description Obtiene todas las alertas. */
  async function getAlerts() {
    if (!ok()) return [];
    try {
      const { data, error } = await db.from('alerts').select('*').order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    } catch (e) { console.warn('[Supabase] getAlerts:', e.message); return []; }
  }

  /** @description Actualiza una alerta (ej: marcar como disparada). */
  async function updateAlert(id, updates) {
    if (!ok()) return;
    try {
      const { error } = await db.from('alerts').update(updates).eq('id', id);
      if (error) throw error;
    } catch (e) { console.warn('[Supabase] updateAlert:', e.message); }
  }

  /** @description Elimina una alerta. */
  async function deleteAlert(id) {
    if (!ok()) return;
    try {
      const { error } = await db.from('alerts').delete().eq('id', id);
      if (error) throw error;
    } catch (e) { console.warn('[Supabase] deleteAlert:', e.message); }
  }

  // Auto-init si ya hay claves guardadas
  const u = SB_URL(), k = SB_KEY();
  if (u && k) init(u, k);

  return { init, ok, saveSignal, getSignals, saveAlert, getAlerts, updateAlert, deleteAlert };
})();
