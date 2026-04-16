-- ============================================================
-- GammaTR — Schema SQL para Supabase
-- Ejecutar en el SQL Editor de tu proyecto Supabase
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== TABLA: signals =====
-- Historial de señales técnicas + análisis Gemini AI

CREATE TABLE IF NOT EXISTS signals (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pair            TEXT        NOT NULL,
  timeframe       TEXT,
  signal          TEXT        CHECK (signal IN ('BUY','SELL','WAIT')),
  score           INTEGER     CHECK (score BETWEEN 0 AND 100),
  price           NUMERIC,
  indicators      JSONB,         -- { rsi, macd, ema, bb, closes, price }
  gemini_analysis JSONB,         -- respuesta completa parseada de Gemini
  created_at      TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_signals_pair       ON signals (pair);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_signal     ON signals (signal);

-- ===== TABLA: alerts =====
-- Alertas configuradas por el usuario (10 tipos)

CREATE TABLE IF NOT EXISTS alerts (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  pair          TEXT        NOT NULL,
  alert_type    TEXT        CHECK (alert_type IN (
                              'PRICE_REACH',
                              'PRICE_BREAKOUT',
                              'PRICE_SUPPORT',
                              'CHANGE_PCT_UP',
                              'CHANGE_PCT_DOWN',
                              'CHANGE_24H_UP',
                              'RSI_BELOW',
                              'RSI_ABOVE',
                              'MACD_BULLISH_CROSS',
                              'MACD_BEARISH_CROSS'
                            )),
  threshold     NUMERIC,
  active        BOOLEAN     DEFAULT true,
  triggered_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts (active);
CREATE INDEX IF NOT EXISTS idx_alerts_pair   ON alerts (pair);

-- ===== TABLA: watchlist =====
-- Pares del usuario (sincronización multi-dispositivo)

CREATE TABLE IF NOT EXISTS watchlist (
  id         uuid  DEFAULT gen_random_uuid() PRIMARY KEY,
  pair       TEXT  NOT NULL UNIQUE,
  position   INT   DEFAULT 0,
  added_at   TIMESTAMPTZ DEFAULT now()
);

-- ===== RLS =====

ALTER TABLE signals   ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts    ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_all_signals"   ON signals   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_alerts"    ON alerts    FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "anon_all_watchlist" ON watchlist FOR ALL TO anon USING (true) WITH CHECK (true);

-- ===== VISTA: signal_stats =====

CREATE OR REPLACE VIEW signal_stats AS
SELECT
  pair,
  COUNT(*)                                         AS total,
  COUNT(*) FILTER (WHERE signal = 'BUY')           AS buy_count,
  COUNT(*) FILTER (WHERE signal = 'SELL')          AS sell_count,
  COUNT(*) FILTER (WHERE signal = 'WAIT')          AS wait_count,
  ROUND(AVG(score), 1)                             AS avg_score,
  MAX(created_at)                                  AS last_signal_at
FROM signals
GROUP BY pair
ORDER BY last_signal_at DESC;

-- ===== LIMPIEZA AUTOMÁTICA =====

CREATE OR REPLACE FUNCTION cleanup_old_signals()
RETURNS void AS $$
BEGIN
  DELETE FROM signals WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;
