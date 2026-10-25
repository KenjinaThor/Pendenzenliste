import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { mockSupabase } from './mockSupabase';

/** Prüft die Seite mit axe-core (WCAG 2 A/AA) und meldet Verstösse lesbar. */
async function audit(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.nodes.length}× ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  if (process.env.A11Y_REPORT && summary.length)
    console.log(`A11Y ${label}\n  ${summary.join('\n  ')}`);
  expect(summary, `${label}\n${summary.join('\n')}`).toEqual([]);
}

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`Barrierefreiheit (${scheme})`, () => {
    test.use({ colorScheme: scheme });

    test.beforeEach(async ({ page }) => {
      const db = await mockSupabase(page);
      const now = new Date().toISOString();
      db.profile.theme = scheme;
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      db.tasks.push(
        {
          id: 'a1',
          list_id: 'id-1',
          title: 'Steuererklärung',
          notes_md: 'Belege sammeln',
          due_at: new Date(today.getTime() + 14 * 3600e3).toISOString(),
          due_all_day: false,
          priority: 'high',
          status: 'open',
          rrule: 'FREQ=WEEKLY',
          repeat_mode: 'fixed',
          repeat_after_days: null,
          focus_date: null,
          duration_min: 30,
          assignee_id: null,
          completed_at: null,
          deleted_at: null,
          position: 0,
          created_at: now,
          updated_at: now,
          subtasks: [{ id: 's1', task_id: 'a1', title: 'Formular', done: false, position: 0 }],
        },
        {
          id: 'a2',
          list_id: 'id-1',
          title: 'Überfällige Pendenz',
          due_at: new Date(today.getTime() - 3 * 86400e3).toISOString(),
          due_all_day: true,
          priority: 'low',
          status: 'in_progress',
          rrule: null,
          repeat_mode: 'fixed',
          repeat_after_days: null,
          focus_date: null,
          duration_min: null,
          assignee_id: null,
          notes_md: '',
          completed_at: null,
          deleted_at: null,
          position: 0,
          created_at: now,
          updated_at: now,
          subtasks: [],
        },
      );
      db.lists.push({
        id: 'id-1',
        owner_id: 'user-1',
        name: 'Persönlich',
        color: '#6366f1',
        emoji: '🏠',
        position: 0,
        archived_at: null,
      });
      await page.setViewportSize({ width: 1200, height: 800 });
    });

    for (const [name, hash] of [
      ['Heute', '#/heute'],
      ['Alle', '#/alle'],
      ['Liste', '#/liste/id-1'],
      ['Kalender', '#/kalenderansicht'],
      ['Statistik', '#/statistik'],
      ['Einstellungen', '#/einstellungen'],
      ['Kalender verbinden', '#/kalender'],
      ['Vorlagen', '#/vorlagen'],
      ['Import und Export', '#/daten'],
      ['Mitteilungen', '#/mitteilungen'],
      ['Daily-Shuffle', '#/shuffle'],
      ['Papierkorb', '#/papierkorb'],
    ] as const) {
      test(name, async ({ page }) => {
        await page.goto(`/Pendenzenliste/${hash}`);
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(400);
        await audit(page, name);
      });
    }

    test('Pendenz-Editor', async ({ page }) => {
      await page.goto('/Pendenzenliste/#/heute');
      await page.getByText('Steuererklärung', { exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.waitForTimeout(300);
      await audit(page, 'Editor');
    });

    test('Kanban und geteilte Liste', async ({ page }) => {
      await page.goto('/Pendenzenliste/#/liste/id-1');
      await page.getByRole('button', { name: /Kanban/ }).click();
      await page.waitForTimeout(300);
      await audit(page, 'Kanban');
      await page
        .getByRole('button', { name: /Liste$/ })
        .click()
        .catch(() => undefined);
      await page.getByRole('button', { name: 'Teilen und Mitglieder' }).click();
      await page.waitForTimeout(300);
      await audit(page, 'Teilen');
    });
  });
}

test('Anmeldeseite', async ({ page }) => {
  await page.addInitScript(() => localStorage.removeItem('sb-mock-auth-token'));
  await page.route('https://mock.supabase.co/**', (r) =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }),
  );
  await page.goto('/Pendenzenliste/');
  await expect(page.getByRole('button', { name: /Mit Google anmelden/ })).toBeVisible();
  await audit(page, 'Login');
});
