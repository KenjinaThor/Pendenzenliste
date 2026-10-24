import { describe, expect, it } from 'vitest';
import { CHANGELOG, unseenEntries } from './changelog';

describe('Changelog', () => {
  it('ist gültig: eindeutige, absteigende ids und gefüllte Einträge', () => {
    const ids = CHANGELOG.map((e) => e.id);
    expect(ids.every((id) => /^\d{4}-\d{2}-\d{2}(-\d+)?$/.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort().reverse()).toEqual(ids);
    for (const e of CHANGELOG) {
      expect(e.title.trim()).not.toBe('');
      expect(e.items.length).toBeGreaterThan(0);
    }
  });
  it('zeigt nur Neues seit dem letzten Besuch', () => {
    const all = CHANGELOG.map((e) => e.id);
    expect(unseenEntries(null).map((e) => e.id)).toEqual(all);
    expect(unseenEntries(all[0])).toEqual([]);
    expect(unseenEntries('2000-01-01').map((e) => e.id)).toEqual(all);
    expect(unseenEntries(all[1]).map((e) => e.id)).toEqual([all[0]]);
  });
});
