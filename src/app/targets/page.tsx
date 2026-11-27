import { TargetsManager } from '@/components/TargetsManager';
import { getSessionPrincipal } from '@/lib/auth';
import {
  listEventPackages,
  listTargetCompanies,
  listTeamMembers,
} from '@/lib/repository';

export const dynamic = 'force-dynamic';

export default async function TargetsPage() {
  const principal = await getSessionPrincipal();
  const [targetsRes, pkgsRes, members] = await Promise.all([
    listTargetCompanies({
      assigned_to_member_id: principal.role === 'coordinator' ? principal.member_id : null,
    }),
    listEventPackages(),
    listTeamMembers(),
  ]);

  return (
    <TargetsManager
      initialItems={targetsRes.items}
      packages={pkgsRes.packages}
      members={members}
      role={principal.role}
      mode={targetsRes.mode}
    />
  );
}
