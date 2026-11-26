import { defineConfig, devices } from '@playwright/test';
import { existsSync } from 'node:fs';

// Credenciales y URL de las pruebas: frontend/.env.e2e (gitignored). Plantilla en .env.e2e.example.
if (existsSync('.env.e2e')) process.loadEnvFile('.env.e2e');

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3000';

/** Android de gama media: el ancho más común y más angosto que soportamos. */
const android360 = {
  viewport: { width: 360, height: 780 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  defaultBrowserType: 'chromium' as const,
};

export default defineConfig({
  testDir: './e2e',
  // Las pruebas comparten la misma cuenta de alumno y algunas cambian datos (cuestionario,
  // comentarios, nombre) y los restauran al terminar: van en serie.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 120_000, // `next dev` con poca memoria es lento; el cuestionario hace muchos pasos.
  // `next dev` compila cada ruta la primera vez: hay pantallas que tardan más de 10 s en salir.
  expect: { timeout: 20_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'setup', testMatch: /auth\.setup\.ts/, use: { ...android360 } },
    { name: 'android-360', use: { ...android360 }, dependencies: ['setup'] },
    { name: 'iphone-390', use: { ...devices['iPhone 14'] }, dependencies: ['setup'] },
    { name: 'iphone-430', use: { ...devices['iPhone 14 Pro Max'] }, dependencies: ['setup'] },
  ],
});
