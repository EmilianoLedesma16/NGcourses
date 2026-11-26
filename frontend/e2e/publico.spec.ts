import { test, expect, expectSinScrollHorizontal, revisarObjetivosTactiles, camposConZoomIOS } from './support/fixtures';

test.describe('Páginas públicas en el teléfono', () => {
  for (const ruta of ['/', '/forgot-password', '/activar#token=invalido', '/reset-password#token=invalido', '/privacidad', '/terminos']) {
    test(`${ruta} se ve completa y sin desbordes`, async ({ page }) => {
      await page.goto(ruta);
      await expect(page.locator('h1, h2').first()).toBeVisible();
      await expectSinScrollHorizontal(page);
      await revisarObjetivosTactiles(page);
    });
  }

  test('los campos de acceso no provocan zoom en iPhone', async ({ page }) => {
    const chicos: string[] = [];
    for (const ruta of ['/', '/forgot-password', '/activar#token=x', '/reset-password#token=x']) {
      await page.goto(ruta);
      await expect(page.locator('input').first()).toBeVisible();
      chicos.push(...(await camposConZoomIOS(page)));
    }
    expect(chicos, 'Campos con letra < 16 px (iOS hace zoom al enfocarlos)').toEqual([]);
  });

  test('login con contraseña equivocada muestra el error y no entra', async ({ page }, info) => {
    // Un solo dispositivo: cada intento cuenta contra el límite de 5 logins por minuto.
    test.skip(info.project.name !== 'android-360', 'Basta con un dispositivo');
    await page.goto('/');
    await page.getByLabel('Correo').fill('nadie.e2e@example.com');
    await page.getByLabel('Contraseña', { exact: true }).fill('NoEsLaContraseña1!');
    await page.getByRole('button', { name: 'Iniciar sesión' }).click();
    await expect(page.getByText('Correo o contraseña incorrectos')).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
  });

  test('mostrar contraseña cambia el campo a texto', async ({ page }) => {
    await page.goto('/');
    const campo = page.getByLabel('Contraseña', { exact: true });
    await campo.fill('Secreta123!');
    await page.getByRole('button', { name: 'Mostrar contraseña' }).tap();
    await expect(campo).toHaveAttribute('type', 'text');
  });

  test('enlace de activación inválido explica qué hacer', async ({ page }) => {
    await page.goto('/activar');
    await expect(page.getByText(/enlace no es válido/i)).toBeVisible();
  });

  test('olvidé mi contraseña responde sin revelar si el correo existe', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel(/correo/i).fill('nadie.e2e@example.com');
    await page.getByRole('button', { name: /enviar|recuperar|restablecer/i }).tap();
    await expect(page.getByText(/si .*correo|revisa tu correo|te enviaremos|recibirás/i).first()).toBeVisible();
  });
});
