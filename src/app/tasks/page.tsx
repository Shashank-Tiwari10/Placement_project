import { TasksManager } from '@/components/TasksManager';
import {
  listPipelineOpportunities,
  listReferenceOptions,
  listTasks,
} from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function TasksPage() {
  const [tasksData, refs, pipe] = await Promise.all([
    listTasks({ limit: 200 }),
    listReferenceOptions(),
    listPipelineOpportunities({ limit: 200 }),
  ]);

  return (
    <TasksManager
      initialTasks={tasksData.items}
      brands={refs.brands}
      campaigns={refs.campaigns}
      opportunities={pipe.items}
      mode={tasksData.mode}
    />
  );
}
