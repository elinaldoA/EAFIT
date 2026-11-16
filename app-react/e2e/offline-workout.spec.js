// Treino sem rede, no navegador real (Chromium, Pixel 7), contra o build de
// produção com service worker. Só o Supabase é simulado (e2e/support).
import { test, expect } from './support/fixtures.js';

const EXERCISE = 'Supino Reto';

// Linha da série `n` do exercício (carga, reps e o ✓).
const setRow = (page, n) => {
  const row = page.locator('.live .set-row').filter({ hasText: `Série ${n}` });
  return {
    carga: row.getByPlaceholder('kg'),
    reps: row.getByPlaceholder('reps'),
    check: row.getByRole('button', { name: '✓' }),
  };
};

async function fillSet(page, n, carga, reps) {
  const row = setRow(page, n);
  await row.carga.fill(String(carga));
  await row.carga.blur();
  await row.reps.fill(String(reps));
  await row.reps.blur();
  await row.check.click();
}

// O app só funciona offline depois que o service worker assumiu o controle da página.
async function waitForServiceWorker(page) {
  await expect.poll(() => page.evaluate(async () => {
    const reg = await navigator.serviceWorker.getRegistration();
    return !!(reg?.active && navigator.serviceWorker.controller);
  }), { timeout: 30_000 }).toBe(true);
}

async function openWorkout(page) {
  await page.goto('/app/');
  // O botão do card do dia (o card "Treino de hoje" tem outro com o mesmo nome e a mesma ação).
  const start = page.locator('.day-card').getByRole('button', { name: '⚡ Começar treino' });
  await expect(start).toBeVisible();
  await waitForServiceWorker(page);
  await start.click();
  await expect(page.locator('.live')).toBeVisible();
}

// As gravações de uma série (carga, reps, ✓) vencem o prazo em instantes diferentes e
// viram uma só pendência. Esperar a série inteira evita agir com a fila pela metade.
const queuedSetIsComplete = page => page.evaluate(() => JSON.parse(localStorage.getItem('pendingSyncQueue') || '[]')
  .some(op => op.type === 'set_state' && op.payload.patch?.completed === true && op.payload.patch?.carga != null && op.payload.patch?.reps != null));

const banner = page => page.locator('.live__net');
const queue = page => page.evaluate(() => JSON.parse(localStorage.getItem('pendingSyncQueue') || '[]'));

test.describe('treino sem rede (navegador real)', () => {
  test('treina online, perde a rede, reabre o app sem rede, a rede volta e nada se perde', async ({ page, context, fake }) => {
    await openWorkout(page);

    // 1. Com rede: a série 1 chega ao servidor e a faixa não aparece.
    await fillSet(page, 1, 100, 8);
    await expect.poll(() => fake.setOf(EXERCISE, 1)).toMatchObject({ carga: 100, reps: 8, completed: true });
    await expect(banner(page)).toHaveCount(0);

    // 2. Cai a rede: a série 2 fica só no aparelho; a faixa avisa e o recorde sai na hora.
    fake.reachable = false;
    await context.setOffline(true);
    await expect(banner(page)).toContainText('Sem conexão');
    await fillSet(page, 2, 110, 8);
    await expect(banner(page)).toContainText(/\d+ altera(ção|ções) pendentes?/);
    await expect(page.getByText(/Novo recorde/)).toBeVisible();
    expect(fake.setOf(EXERCISE, 2)).toMatchObject({ carga: 100 }); // o app copiou a série 1 para a 2; os 110 kg só estão no aparelho
    expect(fake.setOf(EXERCISE, 2).completed).not.toBe(true);
    expect((await queue(page)).length).toBeGreaterThan(0);

    // 3. Reabre o app (F5) ainda sem rede: o service worker serve a tela, e o treino volta como estava.
    // Em poucos segundos: sem isso o app ficava ~15 s em "Carregando dados salvos…" (repetições
    // automáticas das consultas do supabase-js), com a pessoa na academia sem sinal.
    await page.reload();
    await expect(page.getByRole('button', { name: '⚡ Modo treino' })).toBeVisible({ timeout: 4000 });
    await page.getByRole('button', { name: '⚡ Modo treino' }).click();
    await expect(setRow(page, 2).carga).toHaveValue('110');
    await expect(setRow(page, 2).check).toHaveAttribute('aria-pressed', 'true');
    await expect(banner(page)).toContainText('Sem conexão');
    expect(fake.setOf(EXERCISE, 2)).toMatchObject({ carga: 100 });

    // 4. A rede volta: a fila sobe sozinha e a faixa some.
    fake.reachable = true;
    await context.setOffline(false);
    await expect.poll(() => fake.setOf(EXERCISE, 2)).toMatchObject({ carga: 110, reps: 8, completed: true });
    await expect(banner(page)).toHaveCount(0);
    expect(await queue(page)).toEqual([]);

    // 5. Reabre com rede: os valores seguem os do treino.
    await page.reload();
    await page.getByRole('button', { name: '⚡ Modo treino' }).click();
    await expect(setRow(page, 1).carga).toHaveValue('100');
    await expect(setRow(page, 2).carga).toHaveValue('110');
    await expect(banner(page)).toHaveCount(0);
  });

  test('sinal fraco: o servidor não responde, o prazo do app manda a gravação para a fila e "Tentar agora" envia', async ({ page, fake }) => {
    test.setTimeout(90_000);
    await openWorkout(page);
    await fillSet(page, 1, 100, 8);
    await expect.poll(() => fake.setOf(EXERCISE, 1)).toMatchObject({ completed: true });

    // O navegador continua "online", mas nenhuma resposta chega.
    fake.hang = true;
    await fillSet(page, 2, 120, 8);
    // Passados os 10 s de prazo, a gravação vira pendência (sem prazo ela ficaria pendurada e a faixa nunca apareceria).
    await expect(banner(page)).toContainText(/\d+ altera(ção|ções) pendentes?/, { timeout: 25_000 });
    await expect.poll(() => queuedSetIsComplete(page), { timeout: 15_000 }).toBe(true);
    await expect(banner(page)).not.toContainText('Sem conexão');
    expect(fake.setOf(EXERCISE, 2).completed).not.toBe(true);

    fake.hang = false;
    await banner(page).getByRole('button', { name: 'Tentar agora' }).click();
    await expect.poll(() => fake.setOf(EXERCISE, 2)).toMatchObject({ carga: 120, reps: 8, completed: true });
    await expect(banner(page)).toHaveCount(0);
    expect(await queue(page)).toEqual([]);
  });

  test('reabrir o app com a fila ainda subindo (escrita lenta) não devolve as cargas antigas', async ({ page, context, fake }) => {
    await openWorkout(page);
    await fillSet(page, 1, 100, 8);
    await expect.poll(() => fake.setOf(EXERCISE, 1)).toMatchObject({ carga: 100, completed: true });

    // Sem rede: troca a carga da série 1 e faz a série 2.
    fake.reachable = false;
    await context.setOffline(true);
    await expect(banner(page)).toContainText('Sem conexão');
    await setRow(page, 1).carga.fill('80');
    await setRow(page, 1).carga.blur();
    await fillSet(page, 2, 90, 8);
    await expect(banner(page)).toContainText(/\d+ altera(ção|ções) pendentes?/);

    // A rede volta com o servidor lento (as escritas levam 3 s para valer) e o app é reaberto no
    // meio do envio: a leitura da abertura chega antes de a fila terminar de subir e o servidor
    // ainda tem as cargas antigas. O app não pode trocar o que está no aparelho por elas.
    fake.writeLatencyMs = 3000;
    fake.reachable = true;
    await context.setOffline(false);
    await page.reload();
    await page.getByRole('button', { name: '⚡ Modo treino' }).click();

    await expect.poll(() => fake.setOf(EXERCISE, 1)?.carga, { timeout: 20_000 }).toBe(80);
    await expect.poll(() => fake.setOf(EXERCISE, 2)).toMatchObject({ carga: 90, completed: true });
    await expect(banner(page)).toHaveCount(0, { timeout: 20_000 });
    await expect(setRow(page, 1).carga).toHaveValue('80');
    await expect(setRow(page, 2).carga).toHaveValue('90');
    expect(await queue(page)).toEqual([]);
  });

  test('o navegador apaga o localStorage com a fila cheia: a fila volta do IndexedDB e sobe quando a rede volta', async ({ page, context, fake }) => {
    await openWorkout(page);
    await fillSet(page, 1, 100, 8);
    await expect.poll(() => fake.setOf(EXERCISE, 1)).toMatchObject({ completed: true });

    fake.reachable = false;
    await context.setOffline(true);
    await expect(banner(page)).toContainText('Sem conexão');
    await fillSet(page, 2, 130, 8);
    await expect.poll(() => queuedSetIsComplete(page)).toBe(true);
    await page.waitForTimeout(500); // o espelho é gravado em segundo plano

    // Limpeza de armazenamento do navegador: some só a fila (o que o iOS faz de pior).
    await page.evaluate(() => localStorage.removeItem('pendingSyncQueue'));
    await page.reload();
    await expect(page.getByRole('button', { name: '⚡ Modo treino' })).toBeVisible({ timeout: 4000 });
    await expect.poll(() => queuedSetIsComplete(page)).toBe(true);

    fake.reachable = true;
    await context.setOffline(false);
    await expect.poll(() => fake.setOf(EXERCISE, 2)).toMatchObject({ carga: 130, reps: 8, completed: true });
    expect(await queue(page)).toEqual([]);
  });

  test('finalizar o treino envia na hora o que estava pendente, sem esperar o intervalo nem um evento de rede', async ({ page, fake }) => {
    test.setTimeout(90_000);
    await openWorkout(page);
    await fillSet(page, 1, 100, 8);
    await expect.poll(() => fake.setOf(EXERCISE, 1)).toMatchObject({ completed: true });

    // Sinal fraco: a série 2 vai para a fila depois do prazo de 10 s.
    fake.hang = true;
    await fillSet(page, 2, 120, 8);
    await expect(banner(page)).toContainText(/\d+ altera(ção|ções) pendentes?/, { timeout: 25_000 });
    await expect.poll(() => queuedSetIsComplete(page), { timeout: 15_000 }).toBe(true);

    // O servidor volta a responder, mas nenhum evento de rede avisa o app (o navegador nunca saiu do "online").
    // A repetição automática só tentaria de novo em 15 s: finalizar tem que enviar antes disso.
    fake.hang = false;
    // Falta a série 3: o app pergunta antes de finalizar.
    let asked = '';
    page.once('dialog', dialog => { asked = dialog.message(); dialog.accept(); });
    const before = Date.now();
    await page.getByRole('button', { name: '🏁 Finalizar treino' }).click();
    expect(asked).toBe('Ainda falta 1 série. Finalizar o treino mesmo assim?');

    await expect.poll(() => fake.setOf(EXERCISE, 2), { timeout: 8_000 }).toMatchObject({ carga: 120, reps: 8, completed: true });
    await expect.poll(() => fake.workouts[0]).toMatchObject({ completed: true });
    expect(fake.workouts[0].duration_seconds).not.toBeNull();
    expect(Date.now() - before).toBeLessThan(10_000);
    expect(await queue(page)).toEqual([]);
  });
});
