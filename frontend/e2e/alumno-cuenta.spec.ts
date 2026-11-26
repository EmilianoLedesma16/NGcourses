import { test, expect, comoRol, cuenta, loginUI, expectSinScrollHorizontal, expectCamposSinZoomIOS } from './support/fixtures';

comoRol('alumno');

test.describe('Alumno: progreso, certificados y perfil', () => {
  test('Mi progreso: los filtros cambian la lista', async ({ page }) => {
    await page.goto('/mis-cursos');
    for (const filtro of ['Completados', 'En curso', 'Todos']) {
      const boton = page.getByRole('button', { name: new RegExp(`^${filtro}`) });
      await boton.tap();
      await expect(boton).toHaveAttribute('aria-pressed', 'true');
    }
    await expectSinScrollHorizontal(page);
  });

  test('Certificados: el PDF se descarga desde el teléfono', async ({ page }) => {
    await page.goto('/certificados');
    const boton = page.getByRole('button', { name: /descargar pdf/i }).last();
    await expect(boton.or(page.getByText('Aún no tienes certificados.'))).toBeVisible();
    test.skip(!(await boton.count()), 'El alumno aún no tiene certificados');
    const [descarga] = await Promise.all([page.waitForEvent('download'), boton.tap()]);
    expect(descarga.suggestedFilename()).toMatch(/\.pdf$/i);
  });

  test('Perfil: editar el nombre y dejarlo como estaba', async ({ page }) => {
    await page.goto('/perfil');
    await page.getByRole('button', { name: 'Editar perfil' }).tap();
    const dialogo = page.getByRole('dialog', { name: 'Editar perfil' });
    await expect(dialogo, 'El modal debe anunciarse como diálogo').toBeVisible();
    await expectCamposSinZoomIOS(page);
    const nombre = dialogo.getByLabel('Nombre completo');
    const original = await nombre.inputValue();
    await nombre.fill(`${original} E2E`);
    await dialogo.getByRole('button', { name: 'Guardar' }).tap();
    await expect(page.locator('h1, h2').filter({ hasText: `${original} E2E` }).first()).toBeVisible();

    await page.getByRole('button', { name: 'Editar perfil' }).tap();
    await page.getByRole('dialog').getByLabel('Nombre completo').fill(original);
    await page.getByRole('dialog').getByRole('button', { name: 'Guardar' }).tap();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('Cerrar sesión regresa al login y protege las páginas', async ({ browser }, info) => {
    // Sesión nueva (no la compartida) y un solo dispositivo, por el límite de 5 logins por minuto.
    test.skip(info.project.name !== 'android-360', 'Basta con un dispositivo');
    const ctx = await browser.newContext({ ...info.project.use, storageState: undefined });
    const page = await ctx.newPage();
    const c = cuenta('alumno')!;
    await loginUI(page, c.email, c.password);
    await expect(page).toHaveURL(/\/cursos/);
    await page.locator('button[aria-haspopup="true"]').first().tap();
    await page.getByRole('button', { name: 'Cerrar sesión' }).tap();
    await expect(page).toHaveURL(/\/$|\/\?/);
    await page.goto('/mis-cursos');
    await expect(page).not.toHaveURL(/\/mis-cursos/);
    await ctx.close();
  });
});
