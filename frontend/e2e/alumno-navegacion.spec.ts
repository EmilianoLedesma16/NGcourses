import { test, expect, comoRol, expectSinScrollHorizontal, revisarObjetivosTactiles, expectCamposSinZoomIOS } from './support/fixtures';

comoRol('alumno');

test.describe('Alumno: navegación en el teléfono', () => {
  test('la barra de pestañas está abajo, a la vista y lleva a cada sección', async ({ page }) => {
    await page.goto('/cursos');
    const barra = page.getByRole('navigation', { name: 'Principal' });
    await expect(barra).toBeVisible();

    const caja = await barra.boundingBox();
    const alto = page.viewportSize()!.height;
    expect(caja!.y + caja!.height, 'La barra debe tocar el borde inferior').toBeGreaterThan(alto - 4);

    for (const [nombre, url] of [['Mi progreso', /\/mis-cursos/], ['Certificados', /\/certificados/], ['Dashboard', /\/cursos/]] as const) {
      const pestaña = barra.getByRole('link', { name: nombre });
      const b = await pestaña.boundingBox();
      expect(Math.min(b!.width, b!.height), `Pestaña ${nombre} ≥ 44 px`).toBeGreaterThanOrEqual(44);
      await pestaña.tap();
      await expect(page).toHaveURL(url);
      await expect(pestaña).toHaveAttribute('aria-current', 'page');
    }
  });

  test('el contenido del final no queda tapado por la barra de pestañas', async ({ page }) => {
    await page.goto('/cursos');
    await expect(page.getByText(/Continuar|Inscribirme/).first()).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await page.waitForTimeout(300);
    const barra = await page.getByRole('navigation', { name: 'Principal' }).boundingBox();
    const ultimo = page.locator('main a[href], main button').last();
    const b = await ultimo.boundingBox();
    expect(b!.y + b!.height, 'El último control queda por encima de la barra').toBeLessThanOrEqual(barra!.y + 1);
  });

  test('menú de usuario: tiene nombre accesible, abre perfil y tema', async ({ page }) => {
    await page.goto('/cursos');
    const boton = page.locator('button[aria-haspopup="true"]').first();
    const nombre = await boton.evaluate((el) => el.getAttribute('aria-label') || (el as HTMLElement).innerText.trim() || el.querySelector('img')?.alt || '');
    expect(nombre, 'El botón del avatar necesita un nombre para lectores de pantalla').not.toBe('');
    await boton.tap();
    await expect(page.getByRole('link', { name: 'Mi perfil' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible();
    await page.getByRole('link', { name: 'Mi perfil' }).tap();
    await expect(page).toHaveURL(/\/perfil/);
  });

  test('buscar y filtrar el catálogo', async ({ page }) => {
    await page.goto('/cursos');
    const tarjetas = page.locator('main article, main [class*="card" i]').filter({ has: page.locator('h2, h3') });
    await expect(tarjetas.first()).toBeVisible();
    const total = await tarjetas.count();
    await page.getByPlaceholder(/buscar/i).fill('zzzz-no-existe');
    await expect(page.getByText('Ningún curso coincide con tu búsqueda.')).toBeVisible();
    await page.getByPlaceholder(/buscar/i).fill('');
    await expect(tarjetas).toHaveCount(total);
  });

  test('el buscador del catálogo no provoca zoom en iPhone', async ({ page }) => {
    await page.goto('/cursos');
    await expect(page.getByPlaceholder(/buscar/i)).toBeVisible();
    await expectCamposSinZoomIOS(page);
  });

  for (const ruta of ['/cursos', '/mis-cursos', '/certificados', '/perfil']) {
    test(`${ruta}: sin desbordes ni controles diminutos (claro y oscuro)`, async ({ page }) => {
      for (const tema of ['light', 'dark']) {
        await page.addInitScript((t) => localStorage.setItem('ng-theme', t), tema);
        await page.goto(ruta);
        await expect(page.locator('h1').first()).toBeVisible();
        await expect(page.locator('html')).toHaveAttribute('data-theme', tema);
        await expectSinScrollHorizontal(page);
        await revisarObjetivosTactiles(page);
      }
    });
  }
});
