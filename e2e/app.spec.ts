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

test('Erinnerungen bei einer Pendenz hinzufügen und entfernen', async ({ page }) => {
  await page.getByRole('button', { name: 'Neue Pendenz' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Titel').fill('Zahnarzttermin');
  const reminders = dialog.getByRole('region', { name: 'Erinnerungen' });
  await dialog.getByRole('button', { name: 'Kein Datum' }).click();
  await expect(reminders.getByLabel('Erinnerung hinzufügen')).toBeDisabled(); // ohne Datum nicht möglich
  await dialog.getByRole('button', { name: 'Morgen' }).click();
  await dialog.getByLabel('Uhrzeit (optional)').fill('14:30');
  await reminders.getByLabel('Erinnerung hinzufügen').selectOption({ label: '15 Min. vorher' });
  await reminders.getByLabel('Erinnerung hinzufügen').selectOption({ label: '1 Tag vorher' });
  await expect(reminders.getByText('🔔 15 Min. vorher')).toBeVisible();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();
  expect(db.reminders.map((r) => r.offset_min).sort((a, b) => Number(a) - Number(b))).toEqual([
    15, 1440,
  ]);

  await page.goto('/Pendenzenliste/#/demnaechst');
  await page.getByText('Zahnarzttermin').click();
  const edit = page.getByRole('dialog').getByRole('region', { name: 'Erinnerungen' });
  await expect(edit.getByText('🔔 1 Tag vorher')).toBeVisible();
  await edit.getByRole('button', { name: /1 Tag vorher entfernen/ }).click();
  await expect(edit.getByText('🔔 1 Tag vorher')).toBeHidden();
  expect(db.reminders).toHaveLength(1);
});

test.describe('Push-Einstellungen', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      // Push-Dienst des Browsers durch einen Ersatz austauschen (keine Verbindung zu Google/Apple nötig)
      let sub: unknown = null;
      const endpoint = 'https://push.example/endpoint-1';
      Object.defineProperty(PushManager.prototype, 'getSubscription', { value: async () => sub });
      Object.defineProperty(PushManager.prototype, 'subscribe', {
        value: async () => {
          sub = {
            endpoint,
            toJSON: () => ({ endpoint, keys: { p256dh: 'P', auth: 'A' } }),
            unsubscribe: async () => ((sub = null), true),
          };
          return sub;
        },
      });
      Notification.requestPermission = async () => 'granted';
    });
    await page.reload();
    await page.goto('/Pendenzenliste/#/einstellungen');
  });

  test('aktivieren, testen und ausschalten', async ({ page }) => {
    await page.getByRole('button', { name: 'Benachrichtigungen aktivieren' }).click();
    await expect(page.getByText('✓ Auf diesem Gerät aktiv')).toBeVisible();
    expect(db.pushSubscriptions[0]).toMatchObject({
      endpoint: 'https://push.example/endpoint-1',
      p256dh: 'P',
      auth: 'A',
    });

    await page.getByRole('button', { name: 'Test-Benachrichtigung senden' }).click();
    await expect(page.getByText(/Test gesendet/)).toBeVisible();
    expect(db.rpcCalls.some((c) => c.name === 'send_test_notification')).toBe(true);

    await page.getByRole('button', { name: 'Auf diesem Gerät ausschalten' }).click();
    await expect(page.getByRole('button', { name: 'Benachrichtigungen aktivieren' })).toBeVisible();
    expect(db.pushSubscriptions).toHaveLength(0);
  });

  test('Tageszusammenfassung und Zeitzone speichern', async ({ page }) => {
    const digest = page.getByRole('checkbox', { name: /Jeden Tag eine Übersicht/ });
    await digest.click();
    await expect(digest).toBeChecked();
    await expect(page.getByLabel('Uhrzeit', { exact: true })).toHaveValue('07:30');
    expect(db.profile.daily_digest_time).toBe('07:30');
    await page.getByLabel('Uhrzeit', { exact: true }).fill('06:45');
    await expect.poll(() => db.profile.daily_digest_time).toBe('06:45');
    await page.getByLabel('Zeitzone').selectOption('Europe/London');
    await expect.poll(() => db.profile.timezone).toBe('Europe/London');
  });
});

test.describe('Schnelleingabe in natürlicher Sprache', () => {
  test('erkennt Datum, Uhrzeit, Priorität und Tag und zeigt die Vorschau', async ({ page }) => {
    const input = page.getByLabel('Pendenz schnell erfassen');
    await input.fill('Steuererklärung einreichen morgen 14 Uhr !hoch +wichtig');
    const preview = page.getByRole('list', { name: 'Erkannt' });
    await expect(preview.getByText('Morgen')).toBeVisible();
    await expect(preview.getByText('14:00 Uhr')).toBeVisible();
    await expect(preview.getByText('Priorität hoch')).toBeVisible();
    await expect(preview.getByText('#wichtig')).toBeVisible();
    await page.keyboard.press('Enter');

    await expect.poll(() => db.tasks.length).toBe(1);
    expect(db.tasks[0]).toMatchObject({
      title: 'Steuererklärung einreichen',
      priority: 'high',
      due_all_day: false,
    });
    expect(new Date(db.tasks[0].due_at as string).getHours()).toBe(14);
    await expect.poll(() => db.tags.map((t) => t.name)).toEqual(['wichtig']); // Tags folgen nach der Pendenz

    await page.goto('/Pendenzenliste/#/demnaechst');
    await expect(page.getByText('Steuererklärung einreichen')).toBeVisible();
    await expect(page.getByText('#wichtig')).toBeVisible();
  });

  test('Liste und Wiederholung', async ({ page }) => {
    await page.getByLabel('Pendenz schnell erfassen').fill('Pillen nehmen jeden Tag #persönlich');
    await expect(
      page.getByRole('list', { name: 'Erkannt' }).getByText('🔁 Jeden Tag'),
    ).toBeVisible();
    await expect(
      page.getByRole('list', { name: 'Erkannt' }).getByText('🏠 Persönlich'),
    ).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByText('Pillen nehmen', { exact: true })).toBeVisible();
    expect(db.tasks[0]).toMatchObject({ rrule: 'FREQ=DAILY', list_id: 'id-1' });
  });
});

test('wiederkehrende Pendenz erledigen: nächste entsteht, Rückgängig stellt alles her', async ({
  page,
}) => {
  await page.getByLabel('Pendenz schnell erfassen').fill('Pillen nehmen jeden Tag');
  await page.keyboard.press('Enter');
  await expect(page.getByText('🔁 Jeden Tag')).toBeVisible();

  await page.getByRole('checkbox', { name: /Pillen nehmen/ }).click();
  await expect(page.getByText(/erledigt · nächste: Morgen/)).toBeVisible();
  await expect.poll(() => db.tasks.length).toBe(2);
  expect(db.tasks.map((t) => t.status).sort()).toEqual(['done', 'open']);
  const open = db.tasks.find((t) => t.status === 'open')!;
  expect(open.rrule).toBe('FREQ=DAILY');
  expect(new Date(open.due_at as string).getDate()).toBe(
    new Date(Date.now() + 86_400_000).getDate(),
  );

  await page.getByRole('button', { name: 'Rückgängig' }).click();
  await expect.poll(() => db.tasks.length).toBe(1);
  expect(db.tasks[0]).toMatchObject({ status: 'open', rrule: 'FREQ=DAILY' });
  await expect(page.getByText('🔁 Jeden Tag')).toBeVisible();
});

test('Wiederholung und Tags im Editor setzen', async ({ page }) => {
  await page.getByRole('button', { name: 'Neue Pendenz' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Titel').fill('Putzen');
  await dialog.getByRole('button', { name: 'Morgen' }).click();
  await dialog.getByLabel('Wiederholung', { exact: true }).selectOption('WEEKLY');
  await dialog.getByLabel('Wiederholungsabstand').fill('2');
  await dialog.getByRole('button', { name: 'Mo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Mi', exact: true }).click();
  await expect(dialog.getByText('🔁 Alle 2 Wochen: Montag und Mittwoch')).toBeVisible();
  await dialog.getByLabel('Tag hinzufügen').fill('Haushalt');
  await dialog.getByLabel('Tag hinzufügen').press('Enter');
  await expect(dialog.getByText('#Haushalt')).toBeVisible();
  await dialog.getByRole('button', { name: 'Speichern' }).click();
  await expect(dialog).toBeHidden();

  expect(db.tasks[0]).toMatchObject({
    rrule: 'FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE',
    repeat_mode: 'fixed',
  });
  expect(db.tags.map((t) => t.name)).toEqual(['Haushalt']);
  expect(db.taskTags).toHaveLength(1);

  await page.goto('/Pendenzenliste/#/demnaechst');
  await page.getByText('Putzen').click();
  await expect(page.getByRole('dialog').getByLabel('Wiederholung', { exact: true })).toHaveValue(
    'WEEKLY',
  );
  await expect(page.getByRole('dialog').getByText('#Haushalt')).toBeVisible();
});

test('Tastenkürzel', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.getByLabel('Pendenz schnell erfassen').fill('Erste');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Erste', { exact: true })).toBeVisible();
  await page.getByLabel('Pendenz schnell erfassen').fill('Zweite');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Zweite', { exact: true })).toBeVisible();
  await page.locator('body').click({ position: { x: 600, y: 700 } });

  await page.keyboard.press('?');
  await expect(page.getByRole('dialog', { name: 'Tastenkürzel' })).toBeVisible();
  await page.keyboard.press('Escape');

  await page.keyboard.press('n');
  await expect(page.getByRole('dialog', { name: 'Neue Pendenz' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.keyboard.press('j');
  await expect(page.locator('[data-task-id].ring-2')).toHaveCount(1);
  await page.keyboard.press('e');
  await expect.poll(() => db.tasks.filter((t) => t.status === 'done').length).toBe(1);
  expect(db.tasks.find((t) => t.status === 'done')?.title).toBe('Erste');

  await page.keyboard.press('/');
  await expect(page).toHaveURL(/#\/suche$/);
  await expect(page.getByLabel('Suchen')).toBeFocused();
});

test.describe('Wischgesten', () => {
  const swipe = (page: import('@playwright/test').Page, title: string, from: number, to: number) =>
    page.evaluate(
      ([t, a, b]) => {
        const row = [...document.querySelectorAll('[data-task-id]')].find((el) =>
          el.textContent?.includes(t as string),
        )!;
        const target = row.querySelector('[role="checkbox"]')!.parentElement as HTMLElement;
        const fire = (type: string, x: number) =>
          target.dispatchEvent(
            new PointerEvent(type, {
              pointerType: 'touch',
              pointerId: 7,
              clientX: x,
              clientY: 300,
              bubbles: true,
              isPrimary: true,
            }),
          );
        fire('pointerdown', a as number);
        for (let i = 1; i <= 6; i++)
          fire('pointermove', (a as number) + (((b as number) - (a as number)) * i) / 6);
        fire('pointerup', b as number);
      },
      [title, from, to] as const,
    );

  test('nach rechts wischen erledigt die Pendenz', async ({ page }) => {
    await page.getByLabel('Pendenz schnell erfassen').fill('Wäsche');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Wäsche', { exact: true })).toBeVisible();
    await swipe(page, 'Wäsche', 100, 260);
    await expect(page.getByText('«Wäsche» erledigt')).toBeVisible();
    await expect.poll(() => db.tasks[0].status).toBe('done');
  });

  test('nach links wischen zeigt «Morgen» und «Löschen»', async ({ page }) => {
    await page.getByLabel('Pendenz schnell erfassen').fill('Rechnung');
    await page.keyboard.press('Enter');
    await expect(page.getByText('Rechnung', { exact: true })).toBeVisible();
    await swipe(page, 'Rechnung', 300, 120);
    await page.getByRole('button', { name: 'Morgen', exact: true }).click();
    await expect(page.getByText('«Rechnung» auf morgen verschoben')).toBeVisible();
    await expect
      .poll(() => new Date(db.tasks[0].due_at as string).getDate())
      .toBe(new Date(Date.now() + 86_400_000).getDate());
    await expect(page.getByText('Rechnung', { exact: true })).toBeHidden(); // nicht mehr unter «Heute»

    await page.getByRole('button', { name: 'Rückgängig' }).click();
    await expect(page.getByText('Rechnung', { exact: true })).toBeVisible();
  });
});

// ---------------------------------------------------------------- Phase 8b
const seed = (over: Record<string, unknown>) => {
  const now = new Date().toISOString();
  db.tasks.push({
    id: `seed-${db.tasks.length + 1}`,
    list_id: 'id-1',
    title: 'Seed',
    notes_md: '',
    due_at: null,
    due_all_day: false,
    duration_min: null,
    priority: 'medium',
    status: 'open',
    assignee_id: null,
    rrule: null,
    repeat_mode: 'fixed',
    repeat_after_days: null,
    focus_date: null,
    completed_at: null,
    deleted_at: null,
    position: 0,
    created_at: now,
    updated_at: now,
    subtasks: [],
    ...over,
  });
};

test.describe('Filter und Intelligente Listen', () => {
  test('filtern, speichern und wieder öffnen', async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.getByLabel('Pendenz schnell erfassen').fill('Zahnarzt');
    await page.keyboard.press('Enter');
    await expect.poll(() => db.tasks.length).toBe(1);
    seed({ title: 'Wichtige Rechnung', priority: 'high' });
    seed({ title: 'Blumen giessen', priority: 'low' });
    await page.goto('/Pendenzenliste/#/alle');
    await page.reload();
    await expect(page.getByText('Blumen giessen')).toBeVisible();

    await page.getByRole('button', { name: /Filter & Sortierung/ }).click();
    await page
      .getByRole('group', { name: 'Priorität' })
      .getByRole('button', { name: 'Hoch' })
      .click();
    await expect(page.getByText('Wichtige Rechnung')).toBeVisible();
    await expect(page.getByText('Blumen giessen')).toBeHidden();
    await expect(page.getByText('Zahnarzt', { exact: true })).toBeHidden();

    await page.getByLabel('Name der Intelligenten Liste').fill('Wichtig');
    await page.getByRole('button', { name: 'Speichern', exact: true }).click();
    await expect(page).toHaveURL(/#\/filter\//);
    await expect(page.getByRole('heading', { name: /Wichtig/ })).toBeVisible();
    await expect(page.getByText('Wichtige Rechnung')).toBeVisible();
    await expect(page.getByText('Blumen giessen')).toBeHidden();
    expect(db.savedFilters[0]).toMatchObject({ name: 'Wichtig', filter: { priorities: ['high'] } });
    await expect(page.getByRole('link', { name: /Wichtig/ })).toBeVisible(); // Seitenleiste
  });

  test('Sortierung nach Titel', async ({ page }) => {
    seed({ title: 'Zebra' });
    seed({ title: 'Apfel' });
    seed({ title: 'Mango' });
    await page.goto('/Pendenzenliste/#/alle');
    await page.reload();
    await page.getByRole('button', { name: /Filter & Sortierung/ }).click();
    await page.getByLabel('Sortieren nach').selectOption('title');
    await expect(page.locator('[data-task-id] .truncate').first()).toHaveText('Apfel');
  });
});

test.describe('Kanban', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.getByLabel('Pendenz schnell erfassen').fill('Start');
    await page.keyboard.press('Enter');
    await expect.poll(() => db.tasks.length).toBe(1);
    db.tasks.length = 0;
    seed({ id: 'k1', title: 'Entwurf schreiben' });
    seed({ id: 'k2', title: 'Prüfen', status: 'in_progress' });
    await page.reload();
    await page.getByRole('link', { name: /Persönlich/ }).click();
    await page.getByRole('button', { name: /Kanban/ }).click();
  });

  test('Spalten und Verschieben mit den Pfeilen', async ({ page }) => {
    await expect(
      page.getByRole('region', { name: 'Offen (1)' }).getByText('Entwurf schreiben'),
    ).toBeVisible();
    await expect(
      page.getByRole('region', { name: 'In Arbeit (1)' }).getByText('Prüfen'),
    ).toBeVisible();
    await page.getByRole('button', { name: /Entwurf schreiben nach «In Arbeit»/ }).click();
    await expect.poll(() => db.tasks.find((t) => t.id === 'k1')?.status).toBe('in_progress');
    await expect(page.getByRole('region', { name: 'In Arbeit (2)' })).toBeVisible();
    await page.getByRole('button', { name: /Prüfen nach «Wartend»/ }).click();
    await expect.poll(() => db.tasks.find((t) => t.id === 'k2')?.status).toBe('waiting');
  });

  test('Ziehen in eine andere Spalte', async ({ page }) => {
    await page.getByText('Entwurf schreiben').dragTo(page.getByRole('region', { name: /Wartend/ }));
    await expect.poll(() => db.tasks.find((t) => t.id === 'k1')?.status).toBe('waiting');
  });

  test('in die Spalte «Erledigt» verschieben erledigt die Pendenz', async ({ page }) => {
    await page
      .getByText('Prüfen', { exact: true })
      .dragTo(page.getByRole('region', { name: /Erledigt/ }));
    await expect.poll(() => db.tasks.find((t) => t.id === 'k2')?.status).toBe('done');
    await expect(page.getByText('«Prüfen» erledigt')).toBeVisible();
  });
});

test.describe('Kalenderansicht', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.getByLabel('Pendenz schnell erfassen').fill('Start');
    await page.keyboard.press('Enter');
    await expect.poll(() => db.tasks.length).toBe(1);
    db.tasks.length = 0;
    const today = new Date();
    seed({
      id: 'c1',
      title: 'Zahnarzt',
      due_at: new Date(today.getFullYear(), today.getMonth(), 15, 14, 30).toISOString(),
    });
    seed({
      id: 'c2',
      title: 'Wäsche',
      due_all_day: true,
      due_at: new Date(today.getFullYear(), today.getMonth(), 16).toISOString(),
    });
    await page.reload();
    await page.getByRole('link', { name: 'Kalender', exact: true }).click();
  });

  test('zeigt Pendenzen im Monat und wechselt zur Woche', async ({ page }) => {
    const cell = (day: number) =>
      page.getByRole('gridcell', { name: new RegExp(`^${day}\\. `) }).first();
    await expect(cell(15).getByText('Zahnarzt')).toBeVisible();
    await expect(cell(15).getByText('14:30')).toBeVisible();
    await expect(cell(16).getByText('Wäsche')).toBeVisible();
    await page.getByRole('button', { name: 'Woche' }).click();
    await expect(page.getByRole('gridcell')).toHaveCount(7);
  });

  test('Feiertage des Kantons werden angezeigt', async ({ page }) => {
    for (
      let i = 0;
      i < 12 && !(await page.getByRole('heading', { name: /^Dezember/ }).isVisible());
      i++
    ) {
      await page.getByRole('button', { name: 'Weiter' }).click();
    }
    await expect(page.getByRole('gridcell', { name: /^25\. Dezember, Weihnachten/ })).toBeVisible();
    await expect(page.getByRole('gridcell', { name: /^26\. Dezember, Stephanstag/ })).toBeVisible(); // SG
    await page.getByLabel('Kanton für Feiertage').selectOption('CH');
    await expect.poll(() => db.profile.canton).toBe('CH');
    await expect(page.getByRole('gridcell', { name: /^26\. Dezember, Stephanstag/ })).toHaveCount(
      0,
    );
    await page.getByLabel('Feiertage anzeigen').uncheck();
    await expect(page.getByRole('gridcell', { name: /Weihnachten/ })).toHaveCount(0);
  });

  test('Pendenz auf einen anderen Tag ziehen behält die Uhrzeit', async ({ page }) => {
    const cell = (day: number) =>
      page.getByRole('gridcell', { name: new RegExp(`^${day}\\. `) }).first();
    await cell(15).getByText('Zahnarzt').dragTo(cell(20));
    await expect
      .poll(() => new Date(db.tasks.find((t) => t.id === 'c1')!.due_at as string).getDate())
      .toBe(20);
    const moved = new Date(db.tasks.find((t) => t.id === 'c1')!.due_at as string);
    expect([moved.getHours(), moved.getMinutes()]).toEqual([14, 30]);
  });

  test('Tag auswählen und Pendenz für diesen Tag anlegen', async ({ page }) => {
    await page
      .getByRole('gridcell', { name: /^18\. / })
      .first()
      .click();
    await page.getByRole('button', { name: '＋ Pendenz' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByLabel('Fälligkeitsdatum')).toHaveValue(
      new RegExp(`-${String(new Date().getMonth() + 1).padStart(2, '0')}-18$`),
    );
  });
});

test.describe('Tagesfokus «Meine 3 für heute»', () => {
  test('höchstens drei Pendenzen, Abschnitt oben in «Heute»', async ({ page }) => {
    for (const t of ['Eins', 'Zwei', 'Drei', 'Vier']) {
      await page.getByLabel('Pendenz schnell erfassen').fill(t);
      await page.keyboard.press('Enter');
      await expect(page.getByText(t, { exact: true })).toBeVisible();
    }
    for (const t of ['Eins', 'Zwei', 'Drei']) {
      await page.getByRole('button', { name: `${t} in den Tagesfokus setzen` }).click();
    }
    await expect(page.getByRole('region', { name: /Meine 3 für heute \(3\/3\)/ })).toBeVisible();
    await page.getByRole('button', { name: 'Vier in den Tagesfokus setzen' }).click();
    await expect(page.getByText(/Tagesfokus ist voll/)).toBeVisible();
    expect(db.tasks.filter((t) => t.focus_date).length).toBe(3);

    await page.getByRole('button', { name: 'Zwei aus dem Tagesfokus entfernen' }).click();
    await expect(page.getByRole('region', { name: /Meine 3 für heute \(2\/3\)/ })).toBeVisible();
  });
});

test('Statistik zeigt Serie und erledigte Pendenzen', async ({ page }) => {
  await page.getByLabel('Pendenz schnell erfassen').fill('Start');
  await page.keyboard.press('Enter');
  await expect.poll(() => db.tasks.length).toBe(1);
  db.tasks.length = 0;
  const day = (offset: number) => new Date(Date.now() - offset * 86_400_000).toISOString();
  seed({ status: 'done', completed_at: day(0) });
  seed({ status: 'done', completed_at: day(1) });
  seed({ status: 'done', completed_at: day(2) });
  seed({ title: 'Offen & überfällig', due_all_day: true, due_at: day(3) });
  seed({
    title: 'Offen',
    due_all_day: true,
    due_at: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  });
  await page.setViewportSize({ width: 1200, height: 800 });
  await page.reload();
  await page.getByRole('link', { name: 'Statistik' }).click();
  await expect(page.getByText('3 Tage', { exact: true }).first()).toBeVisible(); // Serie
  await expect(page.getByText('50 %')).toBeVisible(); // 1 von 2 offenen Pendenzen mit Datum überfällig
  await expect(page.getByRole('img', { name: /Erledigte Pendenzen pro Woche/ })).toBeVisible();
});

test.describe('Profil und Darstellung', () => {
  test('Dunkelmodus umschalten und Namen ändern', async ({ page }) => {
    await page.goto('/Pendenzenliste/#/einstellungen');
    await page.getByRole('button', { name: 'Dunkel' }).click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    expect(db.profile.theme).toBe('dark');
    await page.getByRole('button', { name: 'Hell', exact: true }).click();
    await expect(page.locator('html')).not.toHaveClass(/dark/);

    const name = page.getByLabel('Name', { exact: true });
    await name.fill('Anna Muster');
    await name.blur();
    await expect.poll(() => db.profile.name).toBe('Anna Muster');
  });
});
