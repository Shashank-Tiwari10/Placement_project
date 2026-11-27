import { CampaignsManager } from '@/components/CampaignsManager';
import { listCampaignsWithMeta } from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function CampaignsPage() {
  const data = await listCampaignsWithMeta();
  return <CampaignsManager initialItems={data.items} mode={data.mode} />;
}
