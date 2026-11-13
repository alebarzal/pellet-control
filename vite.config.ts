import { execSync } from 'node:child_process';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/**
 * Proxy de desarrollo: permite probar la lectura de precios desde el navegador del PC
 * (en la app Android la petición se hace con HTTP nativo y no hace falta).
 */
function devPriceProxy(): Plugin {
  return {
    name: 'dev-price-proxy',
    configureServer(server) {
      // SwitchBot no admite peticiones desde el navegador (CORS): en desarrollo se reenvían con sus cabeceras de firma.
      server.middlewares.use('/api/switchbot', async (req, res) => {
        const h = req.headers;
        try {
          const r = await fetch(`https://api.switch-bot.com${req.url ?? ''}`, {
            headers: {
              Authorization: String(h.authorization ?? ''),
              sign: String(h.sign ?? ''),
              nonce: String(h.nonce ?? ''),
              t: String(h.t ?? ''),
              'Content-Type': 'application/json; charset=utf8',
            },
            signal: AbortSignal.timeout(15000),
          });
          res.statusCode = r.status;
          res.setHeader('content-type', 'application/json');
          res.end(await r.text());
        } catch {
          res.statusCode = 502;
          res.end('{}');
        }
      });
      server.middlewares.use('/api/proxy', async (req, res) => {
        res.setHeader('x-proxy', '1');
        const target = new URL(req.url ?? '', 'http://x').searchParams.get('url');
        if (!target || !/^https?:\/\//.test(target)) {
          res.statusCode = 400;
          res.end('url no válida');
          return;
        }
        try {
          const r = await fetch(target, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36',
              'Accept-Language': 'es-ES,es;q=0.9',
              Accept: 'text/html,application/xhtml+xml',
            },
            redirect: 'follow',
            signal: AbortSignal.timeout(20000),
          });
          res.statusCode = r.status;
          res.setHeader('content-type', 'text/html; charset=utf-8');
          res.end(await r.text());
        } catch {
          res.statusCode = 502;
          res.end('sin respuesta');
        }
      });
    },
  };
}

/** Commit del que sale esta compilación: la app lo compara con el último APK publicado en GitHub. */
function buildSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return '';
  }
}

export default defineConfig({
  plugins: [react(), tailwindcss(), devPriceProxy()],
  define: {
    __BUILD_SHA__: JSON.stringify(buildSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  base: './',
  build: {
    chunkSizeWarningLimit: 1200,
  },
});
