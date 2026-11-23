import { test as base, expect, type Page, type APIRequestContext, type PlaywrightWorkerArgs } from '@playwright/test';
import { existsSync } from 'node:fs';

type Playwright = PlaywrightWorkerArgs['playwright'];

export type Rol = 'alumno' | 'supervisor' | 'admin';

const ENV: Record<Rol, [string, string]> = {
  alumno: ['E2E_ALUMNO_EMAIL', 'E2E_ALUMNO_PASSWORD'],
  supervisor: ['E2E_SUPERVISOR_EMAIL', 'E2E_SUPERVISOR_PASSWORD'],
  admin: ['E2E_ADMIN_EMAIL', 'E2E_ADMIN_PASSWORD'],
};

export function cuenta(rol: Rol): { email: string; password: string } | null {
  const [e, p] = ENV[rol];
  const email = process.env[e];
  const password = process.env[p];
  return email && password ? { email, password } : null;
}

export const authFile = (rol: Rol) => `e2e/.auth/${rol}.json`;

/** Usa la sesión guardada por auth.setup.ts o salta el archivo si el rol no tiene cuenta. */
export function comoRol(rol: Rol) {
  test.skip(!cuenta(rol), `Falta ${ENV[rol].join(' / ')} en .env.e2e`);
  test.use({ storageState: authFile(rol), rol });
}

/**
 * Login por la interfaz. El backend limita a 5 intentos por minuto por IP; si responde 429
 * se espera a que se libere el minuto y se reintenta una vez.
 */
export async function loginUI(page: Page, email: string, password: string) {
  for (let intento = 0; intento < 2; intento++) {
    await page.goto('/');
    await page.getByLabel('Correo').fill(email);
    await page.getByLabel('Contraseña', { exact: true }).fill(password);
    const [res] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/login/access-token')),
      page.getByRole('button', { name: /iniciar sesión|entrar/i }).click(),
    ]);
    if (res.status() !== 429) return res;
    await page.waitForTimeout(61_000);
  }
  throw new Error('Login bloqueado por el límite de intentos (429)');
}

/** Cliente de API autenticado con la sesión (cookies) de un rol. */
export async function apiComo(playwright: { request: { newContext: (o: object) => Promise<APIRequestContext> } }, rol: Rol, baseURL: string) {
  return playwright.request.newContext({ baseURL, storageState: authFile(rol) });
}

/** Sin scroll horizontal: nada de la página se sale del ancho de la pantalla. */
export async function expectSinScrollHorizontal(page: Page) {
  const { scrollW, vw, culpables } = await page.evaluate(() => {
    const vw = window.innerWidth;
    const culpables: string[] = [];
    if (document.documentElement.scrollWidth > vw) {
      for (const el of document.body.querySelectorAll<HTMLElement>('*')) {
        const r = el.getBoundingClientRect();
        if (r.width && r.right > vw + 1) culpables.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')} (${Math.round(r.right)}px)`);
        if (culpables.length >= 5) break;
      }
    }
    return { scrollW: document.documentElement.scrollWidth, vw, culpables };
  });
  expect(scrollW, `La página mide ${scrollW}px en una pantalla de ${vw}px: ${culpables.join(', ')}`).toBeLessThanOrEqual(vw);
}

/**
 * Objetivos táctiles. Falla si algún control mide menos de 24 px (mínimo WCAG 2.2 AA) y deja
 * como anotación los que quedan por debajo de los 44 px recomendados para el pulgar.
 */
export async function revisarObjetivosTactiles(page: Page) {
  const controles = await page.evaluate(() => {
    const out: { nombre: string; w: number; h: number; textoEnlace: boolean }[] = [];
    for (const el of document.querySelectorAll<HTMLElement>('a[href],button,select,[role=button],[role=tab],summary,input[type=checkbox],input[type=radio]')) {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      if (!r.width || !r.height || s.visibility === 'hidden' || r.bottom < 0 || r.top > document.documentElement.scrollHeight) continue;
      if (el.closest('p') && el.tagName === 'A') continue; // enlaces dentro de un párrafo
      if ((el as HTMLInputElement).type && el.closest('label')) continue; // casillas con su etiqueta
      const nombre = (el.getAttribute('aria-label') || el.innerText || el.className || el.tagName).toString().trim().replace(/\s+/g, ' ').slice(0, 40);
      // Enlace de texto (título de curso, "Ver todo"): WCAG 2.5.8 lo exime si tiene espacio alrededor.
      const textoEnlace = el.tagName === 'A' && r.width >= 44 && r.height >= 15 && !!el.innerText.trim();
      out.push({ nombre, w: Math.round(r.width), h: Math.round(r.height), textoEnlace });
    }
    return out;
  });
  const minimos = controles.filter((c) => Math.min(c.w, c.h) < 24 && !c.textoEnlace);
  const justos = controles.filter((c) => !minimos.includes(c) && Math.min(c.w, c.h) < 44);
  if (justos.length) {
    test.info().annotations.push({ type: 'tactil<44', description: justos.map((c) => `${c.nombre} ${c.w}x${c.h}`).join(' · ') });
  }
  expect(minimos.map((c) => `${c.nombre} ${c.w}x${c.h}`), 'Controles por debajo de 24 px').toEqual([]);
}

/** iOS Safari hace zoom al enfocar un campo con letra menor a 16 px. */
export async function camposConZoomIOS(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('input:not([type=checkbox]):not([type=radio]):not([type=hidden]):not([type=file]),select,textarea')]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .map((el) => ({ id: el.id || el.getAttribute('name') || el.getAttribute('placeholder') || el.tagName, px: parseFloat(getComputedStyle(el).fontSize) }))
      .filter((c) => c.px < 16)
      .map((c) => `${location.pathname} ${c.id}: ${c.px}px`),
  );
}

export async function expectCamposSinZoomIOS(page: Page) {
  expect(await camposConZoomIOS(page), 'Campos con letra < 16 px (iOS hace zoom al enfocarlos)').toEqual([]);
}

/**
 * Fixture automático: toda prueba falla si la página lanza una excepción no atrapada o si el
 * backend responde 5xx. Los errores de consola se adjuntan como anotación.
 */
// Ruido que no es de la app: la capa de errores de `next dev` y las peticiones que WebKit
// reporta como fallidas cuando la página navega antes de que terminen.
const RUIDO = [/__nextjs_/, /due to access control checks/];

/**
 * Deja vigente la sesión guardada de un rol: si el access token venció la renueva con el
 * refresh token, y si también ese ya no sirve (el backend lo rota y una prueba cortada a
 * medias pudo no guardar el nuevo) vuelve a iniciar sesión por la API.
 */
async function asegurarSesion(playwright: Playwright, baseURL: string, rol: Rol) {
  const file = authFile(rol);
  const api = await playwright.request.newContext({ baseURL, storageState: existsSync(file) ? file : undefined });
  try {
    if ((await api.get('/api/v1/users/me')).ok()) return;
    if ((await api.post('/api/v1/login/refresh-token')).ok()) return;
    const c = cuenta(rol)!;
    for (let intento = 0; intento < 2; intento++) {
      const res = await api.post('/api/v1/login/access-token', { form: { username: c.email, password: c.password } });
      if (res.ok()) return;
      if (res.status() !== 429) throw new Error(`No se pudo iniciar sesión como ${rol}: ${res.status()}`);
      await new Promise((r) => setTimeout(r, 61_000));
    }
    throw new Error(`Login de ${rol} bloqueado por el límite de intentos (429)`);
  } finally {
    await api.storageState({ path: file });
    await api.dispose();
  }
}

export const test = base.extend<{ vigilante: void; rol: Rol | undefined }>({
  rol: [undefined, { option: true }],
  storageState: async ({ rol, storageState, playwright, baseURL }, aplicar) => {
    if (rol) await asegurarSesion(playwright, baseURL!, rol);
    await aplicar(storageState);
  },
  vigilante: [
    async ({ page, context, rol }, use) => {
      const excepciones: string[] = [];
      const errores5xx: string[] = [];
      const consola: string[] = [];
      page.on('pageerror', (e) => {
        if (!RUIDO.some((r) => r.test(e.message))) excepciones.push(e.message);
      });
      page.on('response', (r) => {
        if (r.status() < 500) return;
        const ruta = new URL(r.url()).pathname;
        // Una portada que no carga se reporta, pero no tumba la prueba del flujo.
        if (ruta.startsWith('/media/')) test.info().annotations.push({ type: 'imagen-5xx', description: `${r.status()} ${ruta}` });
        else errores5xx.push(`${r.status()} ${r.request().method()} ${ruta}`);
      });
      page.on('console', (m) => {
        if (m.type() === 'error') consola.push(m.text().slice(0, 200));
      });
      await use();
      // El backend rota el refresh token: se guarda la sesión renovada para la siguiente prueba.
      if (rol) await context.storageState({ path: authFile(rol) }).catch(() => {});
      if (consola.length) test.info().annotations.push({ type: 'consola', description: [...new Set(consola)].join(' | ') });
      expect(excepciones, 'Excepciones de JavaScript en la página').toEqual([]);
      expect(errores5xx, 'Respuestas 5xx del servidor').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
