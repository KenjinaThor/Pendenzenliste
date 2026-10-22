// Texte für Mitteilungen – gemeinsam genutzt von der App (Mitteilungsliste) und den Push-Nachrichten.

export interface NotificationLike {
  kind: string;
  payload: { task_title?: string; actor_name?: string; excerpt?: string };
}

export function notificationText(n: NotificationLike): string {
  const who = n.payload.actor_name ?? 'Jemand';
  const title = n.payload.task_title ?? 'eine Pendenz';
  switch (n.kind) {
    case 'assigned':
      return `${who} hat dir «${title}» zugewiesen`;
    case 'mention':
      return `${who} hat dich in «${title}» erwähnt`;
    case 'test':
      return 'Test-Benachrichtigung: Es funktioniert! 🎉';
    default:
      return `Neue Mitteilung zu «${title}»`;
  }
}
