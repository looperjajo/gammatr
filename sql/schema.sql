-- ============================================================
-- GammaTR — Schema SQL para Supabase
-- Ejecutar en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Habilitar extensión uuid si no está activa
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ===== TABLA: signals =====
-- Historial de señales generadas (tanto por indicadores técnicos como por Gemini AI)
CREATE TABLE IF NOT EXISTS signals (
  id               uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pair             TEXT NOT NULL,
  signal_type      TEXT CHECK (signal_type IN ('BUY','SELL','WAIT')),
  score            INTEGER CHECK (score BETWEEN 0 AND 100),
  price            NUMERIC,
  rsi              NUMERIC,
  macd             NUMERIC,
  ema_cross        TEXT,
  gemini_analysis  TEXT,          -- Análisis completo de Gemini (puede ser largo)
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_signals_pair       ON signals (pair);
CREATE INDEX IF NOT EXISTS idx_signals_created_at ON signals (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_signals_type       ON signals (signal_type);

-- ===== TABLA: alerts =====
-- Alertas configuradas por el usuario
CREATE TABLE IF NOT EXISTS alerts (
  id             uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pair           TEXT NOT NULL,
  alert_type     TEXT CHECK (alert_type IN ('PRICE_ABOVE','PRICE_BELOW','RSI_ABOVE','RSI_BELOW','SIGNAL')),
  threshold      NUMERIC,             -- Precio o valor RSI umbral
  signal_target  TEXT,                -- 'BUY', 'SELL' (para tipo SIGNAL)
  active         BOOLEAN DEFAULT true,
  triggered_at   TIMESTAMPTZ,         -- Cuándo se disparó (null si no se ha disparado)
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Índice para consultas de alertas activas
CREATE INDEX IF NOT EXISTS idx_alerts_active ON alerts (active);
CREATE INDEX IF NOT EXISTS idx_alerts_pair   ON alerts (pair);

-- ===== RLS (Row Level Security) =====
-- Activar RLS para seguridad básica con anon key
ALTER TABLE signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts  ENABLE ROW LEVEL SECURITY;

-- Política: permitir todo a usuarios anónimos (clave anon)
-- En producción, considera autenticación de usuario para datos privados
CREATE POLICY "allow_anon_all_signals" ON signals
  FOR ALL TO anon USING (true) WITH CHECK (true);

CREATE POLICY "allow_anon_all_alerts" ON alerts
  FOR ALL TO anon USING (true) WITH CHECK (true);

-- ===== VISTA: signal_stats =====
-- Estadísticas agregadas por par para el panel de historial
CREATE OR REPLACE VIEW signal_stats AS
SELECT
  pair,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE signal_type = 'BUY')  AS buy_count,
  COUNT(*) FILTER (WHERE signal_type = 'SELL') AS sell_count,
  COUNT(*) FILTER (WHERE signal_type = 'WAIT') AS wait_count,
  ROUND(AVG(score), 1)                          AS avg_score,
  MAX(created_at)                               AS last_signal_at
FROM signals
GROUP BY pair
ORDER BY last_signal_at DESC;

-- ===== LIMPIEZA AUTOMÁTICA (opcional) =====
-- Función para eliminar señales antiguas (más de 30 días)
-- Ejecutar manualmente o con pg_cron si se configura
CREATE OR REPLACE FUNCTION cleanup_old_signals()
RETURNS void AS $$
BEGIN
  DELETE FROM signals WHERE created_at < NOW() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql;

-- ===== DATOS DE EJEMPLO (comentar en producción) =====
/*
INSERT INTO signals (pair, signal_type, score, price, rsi, macd, ema_cross)
VALUES
  ('BTCUSDT', 'BUY',  78, 85000.50, 28.3, 0.00012, 'bullish'),
  ('ETHUSDT', 'WAIT', 50, 3200.00,  52.1, -0.00005, 'neutral'),
  ('SOLUSDT', 'SELL', 72, 145.80,   73.5, -0.00020, 'bearish');
*/
