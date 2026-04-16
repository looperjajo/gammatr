# γ GammaTR — Crypto Trading PWA con IA

> Trading de criptomonedas en tiempo real con señales de IA. PWA instalable desde GitHub Pages.

![GammaTR Dashboard](icons/screenshot-mobile.png)

---

## ¿Qué es GammaTR?

GammaTR es una **Progressive Web App (PWA)** de trading de criptomonedas que combina:

- 📊 **Datos en tiempo real** via WebSocket de Binance
- 🤖 **Análisis IA** con Google Gemini — análisis de mercado en lenguaje natural
- 📈 **Indicadores técnicos** calculados en el cliente: RSI, MACD, EMA, Bollinger Bands
- 🔔 **Alertas configurables** de precio, RSI y señales
- 💾 **Historial persistente** con Supabase (opcional)
- 📱 **Instalable en móvil** — funciona como app nativa desde la pantalla de inicio

---

## Setup en 5 minutos

### 1. Obtener Gemini API Key (gratis)

1. Ve a [Google AI Studio](https://aistudio.google.com/app/apikey)
2. Crea una nueva API key
3. Cópiala — la introducirás en la app al abrirla por primera vez

### 2. Crear proyecto Supabase (opcional, para historial)

1. Ve a [supabase.com](https://supabase.com) y crea un proyecto gratuito
2. Ve a **SQL Editor** y ejecuta el contenido de `sql/schema.sql`
3. Ve a **Settings > API** y copia:
   - **Project URL** (ej: `https://xxxx.supabase.co`)
   - **anon public** key

### 3. Desplegar en GitHub Pages

```bash
# Opción A: Usar el script automático (Windows)
setup-repo.bat

# Opción B: Manual
git init
git checkout -b gh-pages
git remote add origin https://github.com/looperjajo/gammatr.git
git add .
git commit -m "feat: initial setup"
git push -u origin gh-pages
```

4. Ve a tu repo en GitHub → Settings → Pages → Source: `gh-pages`

Tu app estará en: `https://looperjajo.github.io/gammatr/`

### 4. Primera apertura

Al abrir la app por primera vez, aparecerá un overlay de configuración donde introduces:
- Gemini API Key
- Supabase URL y Key (opcionales)

Las claves se guardan **solo en localStorage** de tu dispositivo. Nunca en el servidor.

---

## Auto-save durante desarrollo

```bat
watch.bat
```

Este script:
1. Inicia un servidor local en `http://localhost:8080` con live-reload
2. Observa cambios en archivos `.html`, `.css`, `.js`, `.json`
3. Hace `git add . && git commit && git push` automáticamente con timestamp

**Requisitos:**
```bash
npm install -g live-server chokidar-cli
```

El nombre del repo se lee de `config.txt` — cambia ese archivo para reutilizar el watcher en otros proyectos.

---

## Criptos monitoreadas

| Par | Nombre |
|-----|--------|
| BTCUSDT | Bitcoin |
| ETHUSDT | Ethereum |
| SOLUSDT | Solana |
| BNBUSDT | BNB |
| DOGEUSDT | Dogecoin |
| ADAUSDT | Cardano |
| XRPUSDT | XRP |
| TRXUSDT | TRON |
| LINKUSDT | Chainlink |
| WIFUSDT | dogwifhat |

Puedes añadir/quitar pares desde el panel de **Configuración**.

---

## Indicadores técnicos

| Indicador | Parámetros | Señal |
|-----------|------------|-------|
| **RSI** | 14 períodos | < 30 = sobrevendido (BUY), > 70 = sobrecomprado (SELL) |
| **MACD** | 12/26/9 | Cruce de señal = cambio de tendencia |
| **EMA** | 9 y 21 períodos | EMA9 > EMA21 = alcista, EMA9 < EMA21 = bajista |
| **Bollinger Bands** | 20 períodos, 2σ | Precio en banda inferior = rebote probable |

---

## Análisis IA con Gemini

Pulsa "✦ Analizar con IA" en el panel de Señales para:
- Enviar las últimas 50 velas OHLCV + indicadores calculados a Gemini 1.5 Flash
- Recibir: análisis de mercado, razonamiento, nivel de riesgo, precio objetivo sugerido, stop loss
- El análisis se guarda en Supabase con timestamp

---

## Estructura de archivos

```
gammatr/
├── index.html              # HTML principal — toda la UI
├── manifest.json           # Manifest PWA
├── sw.js                   # Service Worker (cache offline)
├── config.txt              # Nombre del repo (para watch.bat)
├── css/
│   └── style.css           # Dark theme completo, mobile-first
├── js/
│   ├── app.js              # Estado global e inicialización
│   ├── binance.js          # WebSocket + REST Binance API
│   ├── indicators.js       # RSI, MACD, EMA, Bollinger (funciones puras)
│   ├── signals.js          # Generación de señales (sistema de scoring)
│   ├── gemini.js           # Llamadas a Gemini AI
│   ├── supabase.js         # Cliente Supabase (modo graceful degradation)
│   ├── alerts.js           # Sistema de alertas + notificaciones
│   └── ui.js               # Render DOM + Chart.js
├── icons/
│   ├── icon.svg            # Icono vectorial (γ)
│   ├── icon-192.png        # Icono PWA 192x192
│   └── icon-512.png        # Icono PWA 512x512
├── sql/
│   └── schema.sql          # Schema SQL para Supabase
├── .env.example            # Ejemplo de variables de entorno
├── .gitignore
├── watch.bat               # Auto-save watcher (Windows)
└── setup-repo.bat          # Setup inicial del repo (Windows)
```

---

## Tecnologías

- **Frontend:** HTML5 + CSS3 + JavaScript Vanilla (sin frameworks)
- **Datos en tiempo real:** [Binance WebSocket API](https://binance-docs.github.io/apidocs/websocket_api/en/)
- **IA:** [Google Gemini 1.5 Flash](https://ai.google.dev/)
- **Base de datos:** [Supabase](https://supabase.com/) (PostgreSQL)
- **Charts:** [Chart.js](https://www.chartjs.org/) + [chartjs-chart-financial](https://chartjs-chart-financial.js.org/)
- **Hosting:** [GitHub Pages](https://pages.github.com/)

---

## ⚠️ Disclaimer de Riesgo

**GammaTR es una herramienta educativa y de investigación.**

- Las señales generadas **NO constituyen asesoramiento financiero**.
- El trading de criptomonedas conlleva **riesgos significativos**, incluyendo la pérdida total del capital invertido.
- Los indicadores técnicos y el análisis IA son herramientas probabilísticas, no predicciones certeras.
- **Opera siempre bajo tu propia responsabilidad** y con capital que puedas permitirte perder.
- Consulta con un asesor financiero certificado antes de tomar decisiones de inversión.

---

## Licencia

MIT — libre para uso personal y educativo.

---

*Made with γ by looperjajo*
