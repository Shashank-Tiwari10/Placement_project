import { EventsManager } from '@/components/EventsManager';
import {
  listEventMilestones,
  listEventPackages,
  listPipelineOpportunities,
} from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function EventsPage() {
  const [pkgs, miles, pipe] = await Promise.all([
    listEventPackages(),
    listEventMilestones(),
    listPipelineOpportunities({ limit: 200 }),
  ]);

  return (
    <EventsManager
      initialPackages={pkgs.packages}
      initialMilestones={miles.milestones}
      opportunities={pipe.items}
      mode={pkgs.mode}
    />
  );
}
