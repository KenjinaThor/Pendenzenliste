import { useState } from 'react';
import { Sheet } from '../../components/Sheet';
import {
  useCreateInvite,
  useLists,
  usePendingInvites,
  useRemoveMember,
  useRevokeInvite,
  useSetMemberRole,
} from '../../lib/api';
import { ROLE_LABEL, type Role } from '../../lib/types';
import { usePermissions } from './usePermissions';

const field = 'h-11 rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900';

export function inviteLink(token: string) {
  return `${window.location.origin}${import.meta.env.BASE_URL}#/einladung/${token}`;
}

export function ShareSheet({ listId, onClose }: { listId: string; onClose: () => void }) {
  const { data: lists = [] } = useLists();
  const list = lists.find((l) => l.id === listId);
  const { membersOf, isOwner, userId } = usePermissions();
  const owner = isOwner(listId);
  const members = membersOf(listId);
  const { data: invites = [] } = usePendingInvites(listId, owner);
  const createInvite = useCreateInvite();
  const revoke = useRevokeInvite();
  const setRole = useSetMemberRole();
  const remove = useRemoveMember();

  const [role, setInviteRole] = useState<Role>('editor');
  const [email, setEmail] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onInvite() {
    setError(null);
    try {
      const token = await createInvite.mutateAsync({ listId, role, email });
      setLink(inviteLink(token));
      setEmail('');
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function copyLink() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Link kopieren:', link);
    }
  }

  async function share() {
    if (!link) return;
    try {
      await navigator.share({ title: `Einladung zu «${list?.name}»`, url: link });
    } catch {
      /* abgebrochen */
    }
  }

  async function leave() {
    if (!userId || !window.confirm(`Liste «${list?.name}» verlassen?`)) return;
    await remove.mutateAsync({ listId, userId });
    onClose();
    window.location.hash = '#/heute';
  }

  return (
    <Sheet title={`Teilen: ${list?.emoji ?? ''} ${list?.name ?? ''}`} onClose={onClose}>
      <div className="flex flex-col gap-5 pt-2">
        <section aria-label="Mitglieder">
          <h3 className="mb-2 text-sm font-semibold">Mitglieder</h3>
          <ul className="flex flex-col gap-2">
            {members.map((m) => (
              <li key={m.user_id} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500 text-sm font-bold text-white">
                  {(m.profiles?.name ?? '?').slice(0, 1).toUpperCase()}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">
                    {m.profiles?.name}
                    {m.user_id === userId ? ' (du)' : ''}
                  </span>
                  <span className="block truncate text-xs text-slate-500">{m.profiles?.email}</span>
                </span>
                {owner && m.role !== 'owner' ? (
                  <>
                    <select
                      aria-label={`Rolle von ${m.profiles?.name}`}
                      value={m.role}
                      className={field}
                      onChange={(e) =>
                        setRole.mutate({ listId, userId: m.user_id, role: e.target.value as Role })
                      }
                    >
                      <option value="editor">{ROLE_LABEL.editor}</option>
                      <option value="viewer">{ROLE_LABEL.viewer}</option>
                    </select>
                    <button
                      aria-label={`${m.profiles?.name} entfernen`}
                      className="h-9 w-9 text-slate-400"
                      onClick={() =>
                        window.confirm(`${m.profiles?.name} aus der Liste entfernen?`) &&
                        remove.mutate({ listId, userId: m.user_id })
                      }
                    >
                      ×
                    </button>
                  </>
                ) : (
                  <span className="text-sm text-slate-500">{ROLE_LABEL[m.role]}</span>
                )}
              </li>
            ))}
          </ul>
        </section>

        {owner ? (
          <section aria-label="Einladen" className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Person einladen</h3>
            <input
              type="email"
              aria-label="E-Mail-Adresse (optional)"
              placeholder="E-Mail-Adresse (optional)"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={field}
            />
            <label className="flex flex-col gap-1 text-sm font-medium">
              Rolle
              <select
                value={role}
                onChange={(e) => setInviteRole(e.target.value as Role)}
                className={field}
              >
                <option value="editor">Bearbeiter (ändern, kommentieren)</option>
                <option value="viewer">Leser (nur ansehen)</option>
              </select>
            </label>
            <button
              onClick={onInvite}
              disabled={createInvite.isPending}
              className="h-12 rounded-xl bg-brand-600 font-medium text-white disabled:opacity-60"
            >
              Einladungslink erstellen
            </button>
            <p className="text-xs text-slate-500">
              Mit E-Mail-Adresse: Die Person erhält automatisch Zugriff, sobald sie sich mit dieser
              Adresse anmeldet. Den Link kannst du ihr zusätzlich schicken. Er funktioniert nur
              einmal und ist 14 Tage gültig.
            </p>
            {link && (
              <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-950">
                <p className="mb-2 text-sm font-medium">Einladungslink</p>
                <input
                  readOnly
                  aria-label="Einladungslink"
                  value={link}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mb-2 h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
                />
                <div className="flex gap-2">
                  <button
                    onClick={copyLink}
                    className="h-10 flex-1 rounded-lg bg-slate-200 text-sm font-medium text-slate-900"
                  >
                    {copied ? 'Kopiert ✓' : 'Kopieren'}
                  </button>
                  {typeof navigator.share === 'function' && (
                    <button
                      onClick={share}
                      className="h-10 flex-1 rounded-lg bg-slate-200 text-sm font-medium text-slate-900"
                    >
                      Teilen …
                    </button>
                  )}
                </div>
              </div>
            )}
            {invites.length > 0 && (
              <div>
                <h3 className="mb-1 text-sm font-semibold">Offene Einladungen</h3>
                <ul className="flex flex-col gap-1">
                  {invites.map((i) => (
                    <li key={i.id} className="flex items-center gap-2 text-sm">
                      <span className="min-w-0 flex-1 truncate">
                        {i.email ?? 'Nur Link'} · {ROLE_LABEL[i.role]}
                      </span>
                      <button
                        className="text-red-700"
                        onClick={() => revoke.mutate({ id: i.id, listId })}
                      >
                        Zurückziehen
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        ) : (
          <button
            onClick={leave}
            className="h-12 rounded-xl border border-red-300 font-medium text-red-700"
          >
            Liste verlassen
          </button>
        )}
        {error && (
          <p role="alert" className="rounded-lg bg-red-100 p-3 text-sm text-red-800">
            {error}
          </p>
        )}
      </div>
    </Sheet>
  );
}
