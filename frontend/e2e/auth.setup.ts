import { test as setup, expect } from '@playwright/test';
import { authFile, cuenta, loginUI, type Rol } from './support/fixtures';

// Inicia sesión una vez por rol (desde un teléfono) y guarda la sesión para el resto de las
// pruebas. Así no se choca con el límite de 5 logins por minuto del backend.
const destinos: Record<Rol, RegExp> = {
  alumno: /\/cursos/,
  supervisor: /\/supervisor/,
  admin: /\/admin/,
};

// Si el backend responde 429, loginUI espera un minuto y reintenta: hace falta más tiempo.
setup.setTimeout(150_000);

for (const rol of Object.keys(destinos) as Rol[]) {
  setup(`sesión de ${rol}`, async ({ page }) => {
    const c = cuenta(rol);
    setup.skip(!c, `Sin cuenta de ${rol} en .env.e2e`);
    const res = await loginUI(page, c!.email, c!.password);
    expect(res.status(), `Login de ${rol}`).toBe(200);
    await expect(page).toHaveURL(destinos[rol], { timeout: 20_000 });
    await page.context().storageState({ path: authFile(rol) });
  });
}
