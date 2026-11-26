import { test, expect, comoRol, expectSinScrollHorizontal, revisarObjetivosTactiles } from './support/fixtures';

// Supervisor y admin: revisión básica en el teléfono (cargan, no se desbordan, el menú funciona).

const PANELES = {
  supervisor: ['/supervisor', '/supervisor/cursos', '/supervisor/invitaciones', '/supervisor/mi-organizacion', '/supervisor/solicitudes', '/supervisor/usuarios'],
  admin: ['/admin', '/admin/usuarios', '/admin/organizaciones', '/admin/alumnos', '/admin/cursos', '/admin/solicitudes', '/admin/solicitudes-empresas', '/admin/configuracion', '/admin/perfil'],
} as const;

for (const [rol, rutas] of Object.entries(PANELES) as [keyof typeof PANELES, readonly string[]][]) {
  test.describe(`Panel de ${rol} en el teléfono`, () => {
    comoRol(rol);

    for (const ruta of rutas) {
      test(`${ruta} carga sin desbordes`, async ({ page }) => {
        await page.goto(ruta);
        await expect(page).toHaveURL(new RegExp(ruta.replace(/\//g, '\\/')));
        await expect(page.locator('h1').first()).toBeVisible();
        await expectSinScrollHorizontal(page);
        await revisarObjetivosTactiles(page);
      });
    }

    test('el menú lateral abre, navega y se cierra', async ({ page }) => {
      await page.goto(rutas[0]);
      const abrir = page.getByRole('button', { name: 'Abrir menú' });
      await expect(abrir).toBeVisible();
      await abrir.tap();
      const destino = rutas[1];
      const enlace = page.locator(`aside a[href="${destino}"]`).first();
      await expect(enlace).toBeInViewport();
      await enlace.tap();
      await expect(page).toHaveURL(new RegExp(destino.replace(/\//g, '\\/')));
      await expect(enlace).not.toBeInViewport();
    });

    test('con el menú cerrado sus enlaces no reciben el foco del teclado', async ({ page }) => {
      await page.goto(rutas[0]);
      const enfocables = await page.locator('aside').first().evaluate((aside) => {
        const r = aside.getBoundingClientRect();
        if (r.right > 0) return 0; // menú a la vista
        return aside.closest('[inert]') || aside.hasAttribute('inert') || getComputedStyle(aside).visibility === 'hidden'
          ? 0
          : aside.querySelectorAll('a[href],button').length;
      });
      expect(enfocables, 'Los enlaces del menú oculto siguen en el orden de tabulación').toBe(0);
    });
  });
}
