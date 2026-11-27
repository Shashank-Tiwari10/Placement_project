import { PipelineManager } from '@/components/PipelineManager';
import { getMeasureSnapshot, listPipelineOpportunities } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const [pipeline, snapshot] = await Promise.all([
    listPipelineOpportunities({ limit: 200 }),
    getMeasureSnapshot(null),
  ]);

  return (
    <PipelineManager
      initialItems={pipeline.items}
      initialCash={snapshot.cash}
      initialFunnel={snapshot.funnel}
      mode={pipeline.mode}
    />
  );
}
