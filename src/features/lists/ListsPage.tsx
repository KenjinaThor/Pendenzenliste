import { PageHeader } from '../../components/PageHeader';
import { NavContent } from '../../app/NavContent';

/** Übersicht aller Ansichten und Listen (vor allem fürs iPhone). */
export function ListsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Listen" />
      <div className="px-4 pb-4">
        <NavContent />
      </div>
    </div>
  );
}
