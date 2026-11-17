import { useQuery } from '../lib/api';
import type { ActivityItem } from '../types';
import { PageHeader } from '../components/Layout';
import { ActivityFeed } from '../components/ActivityFeed';
import { ErrorNote, Spinner } from '../components/ui';

export function ActivityPage() {
  const { data, error } = useQuery<{ activity: ActivityItem[] }>('/activity?limit=100');
  return (
    <>
      <PageHeader title="Recent activity" subtitle="Everything that changed in your groups and with your friends." />
      {error ? <ErrorNote>{error}</ErrorNote> : !data ? <Spinner /> : <div className="card">{<ActivityFeed items={data.activity} />}</div>}
    </>
  );
}
