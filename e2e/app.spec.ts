import { expect, test } from '@playwright/test';
import { mockSupabase } from './mockSupabase';

let db: Awaited<ReturnType<typeof mockSupabase>>;

test.beforeEach(async ({ page }) => {
  db = await mockSupabase(page);
  await page.goto('/Pendenzenliste/');
  await expect(page).toHaveURL(/#\/heute$/); // Startweiterleitung abwarten
});

test('erste Liste wird angelegt, Schnelleingabe erscheint unter «Heute»', async ({ page }) => {
  await expect(page.getByText('Nichts fällig heute')).toBeVisible();
  await page.getByLabel('Pendenz schnell erfassen').fill('Steuererklärung');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: /^Heute/ })).toBeVisible();
  await expect(page.getByText('Steuererklärung')).toBeVisible();
});

test('Pendenz mit Unteraufgabe für morgen erscheint unter «Demnächst»', async ({ page }) => {
  await page.getByRole('button', { name: 'Neue Pendenz' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Titel').fill('Ferien planen');
  await dialog.getByRole('button', { name: 'Morgen' }).click();
  await dialog.getByLabel('Neue Unteraufgabe').fill('Pass erneuern');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden(); // Speichern abwarten
  await page.goto('/Pendenzenliste/#/demnaechst');
  await expect(page.getByText('Ferien planen')).toBeVisible();
  await expect(page.getByText('☑ 0/1')).toBeVisible();
});

test('Abhaken mit Rückgängig, Suche und Papierkorb', async ({ page }) => {
  await page.getByLabel('Pendenz schnell erfassen').fill('Zahnarzt anrufen');
  await page.keyboard.press('Enter');
  const row = page.getByText('Zahnarzt anrufen', { exact: true });
  await expect(row).toBeVisible();

  await page.getByRole('checkbox', { name: /Zahnarzt anrufen/ }).click();
  await expect(page.getByText('«Zahnarzt anrufen» erledigt')).toBeVisible();
  await expect(row).toBeHidden();
  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect(row).toBeVisible();

  await page.goto('/Pendenzenliste/#/suche');
  await page.getByLabel('Suchen').fill('zahn');
  await expect(page.getByText('Zahnarzt anrufen', { exact: true })).toBeVisible();

  await page.getByText('Zahnarzt anrufen', { exact: true }).click();
  await page.getByRole('button', { name: 'In den Papierkorb' }).click();
  await page.goto('/Pendenzenliste/#/papierkorb');
  await expect(page.getByText('Zahnarzt anrufen', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Wiederherstellen' }).click();
  await expect(page.getByText('Der Papierkorb ist leer.')).toBeVisible();
});

test('neue Liste anlegen', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.getByRole('button', { name: /Neue Liste/ }).click();
  await page.getByLabel('Name der Liste').fill('Ferien');
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.getByRole('heading', { name: /Ferien/ })).toBeVisible();
});

test('eigene Dauer erfassen und wieder anzeigen', async ({ page }) => {
  await page.getByRole('button', { name: 'Neue Pendenz' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Titel').fill('Sitzung');
  await dialog.getByRole('button', { name: 'Morgen' }).click();
  await dialog.getByLabel('Uhrzeit (optional)').fill('09:30');
  await dialog.getByLabel('Dauer', { exact: true }).selectOption('custom');
  await dialog.getByLabel('Dauer in Stunden').fill('1');
  await dialog.getByLabel('Dauer in Minuten').fill('20');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden(); // Speichern abwarten

  await page.goto('/Pendenzenliste/#/demnaechst');
  await page.getByText('Sitzung').click();
  const edit = page.getByRole('dialog');
  await expect(edit.getByLabel('Dauer', { exact: true })).toHaveValue('custom');
  await expect(edit.getByLabel('Dauer in Stunden')).toHaveValue('1');
  await expect(edit.getByLabel('Dauer in Minuten')).toHaveValue('20');
});

test('Kalender verbinden: Link erzeugen, Listen wählen, neu erzeugen', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.getByRole('link', { name: 'Kalender verbinden' }).click();
  await page.getByRole('button', { name: 'Kalender-Link erzeugen' }).click();

  const link = page.getByLabel('Kalender-Link');
  const first = await link.inputValue();
  expect(first).toMatch(
    /^https:\/\/mock\.supabase\.co\/functions\/v1\/calendar\/[0-9a-f]{64}\.ics$/,
  );
  await expect(page.getByRole('link', { name: 'In Apple Kalender abonnieren' })).toHaveAttribute(
    'href',
    first.replace('https://', 'webcal://'),
  );

  await page.getByRole('checkbox', { name: /Persönlich/ }).click();
  await expect(page.getByRole('checkbox', { name: /Persönlich/ })).not.toBeChecked();

  page.once('dialog', (d) => d.accept());
  await page.getByRole('button', { name: /Link neu erzeugen/ }).click();
  await expect(link).not.toHaveValue(first);
});

test('Zum Kalender hinzufügen lädt eine .ics-Datei', async ({ page }) => {
  await page.getByRole('button', { name: 'Neue Pendenz' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Titel').fill('Zahnarzt');
  await dialog.getByRole('button', { name: 'Morgen' }).click();
  await dialog.getByLabel('Uhrzeit (optional)').fill('14:30');
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden(); // Speichern abwarten

  await page.goto('/Pendenzenliste/#/demnaechst');
  await page.getByText('Zahnarzt').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /Zum Kalender hinzufügen/ }).click(),
  ]);
  expect(download.suggestedFilename()).toBe('Zahnarzt.ics');
  const path = await download.path();
  const text = (await import('node:fs')).readFileSync(path!, 'utf8');
  expect(text).toContain('SUMMARY:Zahnarzt');
  expect(text).toContain('BEGIN:VALARM');
});

test('Rück-Link aus dem Kalender öffnet die Pendenz', async ({ page }) => {
  await page.getByLabel('Pendenz schnell erfassen').fill('Rückruf');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Rückruf')).toBeVisible();
  expect(db.lists).toHaveLength(1); // die Standardliste wird nur einmal angelegt
  const id = db.tasks[0].id;
  // Kaltstart wie beim Antippen eines Links im Kalender (neue Adresse = vollständiges Neuladen)
  await page.goto(`/Pendenzenliste/?from=calendar#/pendenz/${id}`);
  await expect(page.getByRole('dialog').getByLabel('Titel')).toHaveValue('Rückruf');
});

const ben = {
  list_id: 'id-1',
  user_id: 'user-2',
  role: 'editor',
  profiles: { id: 'user-2', name: 'Ben', avatar_url: null, email: 'ben@x.ch' },
};

test('Liste teilen: Mitglieder sehen und Einladungslink erstellen', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  db.extraMembers.push(ben);
  await page.reload();
  await page.getByRole('link', { name: /Persönlich/ }).click();
  await page.getByRole('button', { name: 'Teilen und Mitglieder' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Anna (du)')).toBeVisible();
  await expect(dialog.getByText('Ben', { exact: true })).toBeVisible();

  await dialog.getByLabel('E-Mail-Adresse (optional)').fill('cleo@x.ch');
  await dialog.getByRole('button', { name: 'Einladungslink erstellen' }).click();
  await expect(dialog.getByLabel('Einladungslink')).toHaveValue(/#\/einladung\/[0-9a-f]{48}$/);
  await expect(dialog.getByText(/cleo@x.ch · Bearbeiter/)).toBeVisible();
  expect(db.rpcCalls.find((c) => c.name === 'create_invite')?.args).toMatchObject({
    p_role: 'editor',
    p_email: 'cleo@x.ch',
  });
});

test('Einladungslink annehmen öffnet die Liste', async ({ page }) => {
  await page.getByLabel('Pendenz schnell erfassen').fill('x'); // sorgt dafür, dass die Liste geladen ist
  await page.goto('/Pendenzenliste/?from=invite#/einladung/' + 'ab'.repeat(24));
  await expect(page).toHaveURL(/#\/liste\/id-1$/);
  expect(db.rpcCalls.some((c) => c.name === 'accept_invite')).toBe(true);
});

test('Zuweisung, Kommentar mit @Erwähnung und Verlauf', async ({ page }) => {
  db.extraMembers.push(ben);
  await page.reload();
  await page.getByLabel('Pendenz schnell erfassen').fill('Fenster putzen');
  await page.keyboard.press('Enter');
  await page.getByText('Fenster putzen').click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Zugewiesen an').selectOption({ label: 'Ben' });
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText('👤 Ben')).toBeVisible();
  expect(db.tasks[0].assignee_id).toBe('user-2');

  await page.getByText('Fenster putzen').click();
  await dialog.getByLabel('Kommentar schreiben').fill('Danke @Be');
  await dialog.getByRole('option', { name: '@Ben' }).click();
  await expect(dialog.getByLabel('Kommentar schreiben')).toHaveValue('Danke @Ben ');
  await dialog.getByRole('button', { name: 'Senden' }).click();
  await expect(dialog.getByText('@Ben', { exact: true })).toBeVisible(); // hervorgehobene Erwähnung
  expect(db.comments[0].mentions).toEqual(['user-2']);
});

test('Leser sehen Pendenzen, können sie aber nicht ändern', async ({ page }) => {
  db.myRole = 'viewer';
  db.tasks.push({
    id: 'task-v',
    list_id: 'id-1',
    title: 'Nur lesen',
    notes_md: '',
    due_at: null,
    due_all_day: false,
    duration_min: null,
    priority: 'medium',
    status: 'open',
    assignee_id: null,
    rrule: null,
    completed_at: null,
    deleted_at: null,
    position: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    subtasks: [],
  });
  db.lists.push({
    id: 'id-1',
    owner_id: 'user-9',
    name: 'Geteilt',
    color: '#6366f1',
    emoji: '📋',
    position: 0,
    archived_at: null,
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.reload();
  await page.getByRole('link', { name: /Geteilt/ }).click();
  await expect(page.getByText('Du hast in dieser Liste nur Leserechte.')).toBeVisible();
  await expect(page.getByRole('checkbox', { name: /Nur lesen/ })).toBeDisabled();
  await page.getByText('Nur lesen', { exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByText('Du hast in dieser Liste nur Leserechte.')).toBeVisible();
  await expect(dialog.getByLabel('Titel')).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Speichern' })).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'In den Papierkorb' })).toHaveCount(0);
});

test('Mitteilungen werden angezeigt', async ({ page }) => {
  db.notifications.push({
    id: 'n1',
    kind: 'mention',
    task_id: 'id-2',
    read_at: null,
    created_at: new Date().toISOString(),
    payload: { task_title: 'Steuern', actor_name: 'Ben', excerpt: 'Schaust du das an?' },
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.reload();
  await page.getByRole('link', { name: /Mitteilungen/ }).click();
  await expect(page.getByText('Ben hat dich in «Steuern» erwähnt')).toBeVisible();
  await expect(page.getByText('Schaust du das an?')).toBeVisible();
});
