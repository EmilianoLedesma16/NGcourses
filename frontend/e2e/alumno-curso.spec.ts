import type { APIRequestContext, Page } from '@playwright/test';
import { test, expect, comoRol, cuenta, authFile, expectSinScrollHorizontal, revisarObjetivosTactiles } from './support/fixtures';

comoRol('alumno');

/** Del Dashboard al aula como lo haría el alumno: proceso inscrito → curso → primera lección. */
async function entrarAlAula(page: Page) {
  await page.goto('/cursos');
  await page.getByText('Continuar', { exact: true }).first().tap();
  await expect(page).toHaveURL(/\/curso\/[0-9a-f-]+/);
  const pestañas = page.getByRole('tab');
  await expect(page.getByRole('button', { name: /^(Lecci[oó]n|Cuestionario)/i }).first()).toBeVisible();
  if (await pestañas.count()) {
    await pestañas.last().tap();
    await expect(page).toHaveURL(/\?curso=/);
  }
  // Lecciones del temario (cargan después de la ficha).
  const leccion = page.getByRole('button', { name: /^(Lecci[oó]n|Cuestionario)/i }).first();
  await expect(leccion).toBeVisible();
  await leccion.tap();
  await expect(page).toHaveURL(/\/curso\/[0-9a-f-]+\/videos/);
  await expect(page.getByRole('navigation', { name: 'Contenido del curso' })).toBeVisible();
  return page.url().match(/\/curso\/([0-9a-f-]+)\/videos/)![1];
}

test.describe('Alumno: del proceso al aula', () => {
  test('la página del proceso permite elegir curso y abrir una lección', async ({ page }) => {
    await page.goto('/cursos');
    await page.getByText('Continuar', { exact: true }).first().tap();
    await expect(page.locator('h1').first()).toBeVisible();
    const pestañas = page.getByRole('tab');
    await expect(pestañas.first()).toBeVisible();
    await expect(page.getByRole('button', { name: /^(Lecci[oó]n|Cuestionario)/i }).first()).toBeVisible();
    await expectSinScrollHorizontal(page);
    await revisarObjetivosTactiles(page);
    test.skip((await pestañas.count()) < 2, 'El curso inscrito no pertenece a un proceso con varios cursos');
    await pestañas.nth(0).tap();
    await expect(pestañas.nth(0)).toHaveAttribute('aria-selected', 'true');
    await expect(page).toHaveURL(/\?curso=/);
    // Abrir una lección del temario desde la ficha lleva directo a esa lección en el aula.
    const leccion = page.getByRole('button', { name: /^(Lecci[oó]n|Cuestionario)/i }).first();
    const titulo = (await leccion.getAttribute('aria-label'))!.split('. ')[0];
    await leccion.tap();
    await expect(page).toHaveURL(/\/videos/);
    await expect(page.getByRole('navigation', { name: 'Contenido del curso' }).locator('[aria-current="step"]')).toContainText(titulo);
  });

  test('aula: video a todo lo ancho, temario y navegación entre lecciones', async ({ page }) => {
    await entrarAlAula(page);
    await expectSinScrollHorizontal(page);
    await revisarObjetivosTactiles(page);

    const temario = page.getByRole('navigation', { name: 'Contenido del curso' });
    const leccionVideo = temario.getByRole('button', { name: /video/i }).first();
    await leccionVideo.tap();
    const iframe = page.locator('iframe[src*="mediadelivery"]');
    await expect(iframe).toBeVisible();
    const ancho = (await iframe.boundingBox())!.width;
    expect(ancho, 'El video ocupa casi todo el ancho').toBeGreaterThan(page.viewportSize()!.width * 0.85);

    const actual = temario.locator('[aria-current="step"]');
    const antes = await actual.innerText();
    const mover = page.getByRole('navigation', { name: 'Moverse entre lecciones' });
    await mover.getByRole('button', { name: /siguiente/i }).tap();
    await expect(temario.locator('[aria-current="step"]')).not.toHaveText(antes);
    await mover.getByRole('button', { name: /anterior/i }).tap();
    await expect.poll(() => temario.locator('[aria-current="step"]').innerText()).toBe(antes);
  });

  test('aula: abrir y cerrar módulos del temario', async ({ page }) => {
    await entrarAlAula(page);
    const modulos = page.getByRole('navigation', { name: 'Contenido del curso' }).locator('button[aria-expanded]');
    const cerrado = modulos.and(page.locator('[aria-expanded="false"]')).first();
    test.skip(!(await cerrado.count()), 'Todos los módulos están abiertos');
    await cerrado.tap();
    await expect(modulos.and(page.locator('[aria-expanded="false"]'))).not.toHaveCount(await modulos.count());
  });

  test('comentarios: publicar y borrar desde el teléfono', async ({ page }) => {
    await entrarAlAula(page);
    const texto = `Comentario de prueba E2E ${Date.now()}`;
    const caja = page.getByPlaceholder('Agrega un comentario…');
    await caja.scrollIntoViewIfNeeded();
    await caja.tap();
    await caja.fill(texto);
    await page.getByRole('button', { name: 'Comentar' }).tap();
    const comentario = page.locator('li').filter({ hasText: texto });
    await expect(comentario).toBeVisible();
    await expectSinScrollHorizontal(page);
    page.once('dialog', (d) => d.accept());
    await comentario.getByRole('button', { name: 'Eliminar' }).tap();
    await expect(comentario).toHaveCount(0);
  });
});

test.describe('Alumno: cuestionario', () => {
  test.skip(!cuenta('admin'), 'Se necesita la cuenta de admin para conocer las respuestas y reiniciar intentos');

  let admin: APIRequestContext;
  let alumnoId = '';
  let cursoId = '';
  let quiz: { id: string; titulo: string; preguntas: { enunciado: string; opciones: { texto: string; esCorrecta: boolean }[] }[] } | null = null;

  const reiniciar = () =>
    admin.post(`/api/v1/quiz/lecciones/${quiz!.id}/reiniciar-intentos`, { data: { usuario_id: alumnoId } });

  test.beforeAll(async ({ playwright, browser, baseURL }) => {
    const ctx = await browser.newContext({ storageState: authFile('alumno') });
    const page = await ctx.newPage();
    cursoId = await entrarAlAula(page);
    alumnoId = (await (await page.request.get('/api/v1/users/me')).json()).id;
    await ctx.storageState({ path: authFile('alumno') });
    await ctx.close();

    admin = await playwright.request.newContext({ baseURL, storageState: authFile('admin') });
    const curso = await (await admin.get(`/api/v1/cursos/${cursoId}`)).json();
    for (const m of curso.modulos) {
      for (const l of m.lecciones) {
        if (l.tipo !== 'quiz' || quiz) continue;
        const data = typeof l.contenido === 'string' ? JSON.parse(l.contenido) : (l.quiz ?? l.contenido);
        if (data?.preguntas?.length) quiz = { id: l.id, titulo: l.titulo, preguntas: data.preguntas };
      }
    }
    if (quiz) expect((await reiniciar()).ok(), 'Reiniciar intentos antes de la prueba').toBeTruthy();
  });

  test.afterAll(async () => {
    if (quiz) await reiniciar();
    await admin?.storageState({ path: authFile('admin') });
    await admin?.dispose();
  });

  test('fallar, reintentar y aprobar con avance a la siguiente lección', async ({ page }) => {
    test.skip(!quiz, 'El curso no tiene cuestionarios');
    await page.goto(`/curso/${cursoId}/videos`);
    await page.getByRole('navigation', { name: 'Contenido del curso' }).getByRole('button', { name: quiz!.titulo }).tap();
    const enviar = page.getByRole('button', { name: 'Enviar respuestas' });
    await expect(enviar).toBeVisible();
    await expect(enviar).toBeDisabled();

    const responder = async (correctas: boolean) => {
      for (const p of quiz!.preguntas) {
        const op = p.opciones.find((o) => o.esCorrecta === correctas) ?? p.opciones[0];
        // Se toca la opción completa (el radio real está oculto tras el círculo dibujado).
        const opcion = page.locator('label').filter({ has: page.getByRole('radio') }).filter({ hasText: op.texto.trim() }).first();
        await opcion.tap();
        await expect(opcion.getByRole('radio')).toBeChecked();
      }
    };

    await responder(false);
    await expect(enviar).toBeEnabled();
    await enviar.tap();
    await expect(page.getByText('No aprobado')).toBeVisible();
    await expect(page.getByText(/intento 1 de 3|te quedan 2/i).first()).toBeVisible();
    await expectSinScrollHorizontal(page);
    await revisarObjetivosTactiles(page);

    await page.getByRole('button', { name: 'Intentar de nuevo' }).tap();
    await responder(true);
    await page.getByRole('button', { name: 'Enviar respuestas' }).tap();
    await expect(page.getByText('Aprobado', { exact: true })).toBeVisible();

    // Tarjeta "a continuación" con cuenta atrás; se puede cancelar.
    const siguiente = page.getByRole('status').filter({ hasText: /ver ahora|a continuaci/i });
    await expect(siguiente).toBeVisible();
    await siguiente.getByRole('button', { name: 'Cancelar' }).tap();
    await expect(siguiente).toHaveCount(0);
    await expect(
      page.getByRole('navigation', { name: 'Contenido del curso' }).getByRole('button', { name: quiz!.titulo }).getByLabel('Completada'),
    ).toBeVisible();
  });
});
