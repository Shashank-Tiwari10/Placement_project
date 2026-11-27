import { WhatsAppConsole } from '@/components/WhatsAppConsole';
import { listTeamMembers, listWhatsAppLogs } from '@/lib/repository';
import { isTwilioConfigured } from '@/lib/whatsapp';

export const dynamic = 'force-dynamic';

export default async function WhatsAppPage() {
  const [logs, members] = await Promise.all([
    listWhatsAppLogs(50),
    listTeamMembers(),
  ]);

  return (
    <WhatsAppConsole
      initialLogs={logs}
      members={members}
      twilioConfigured={isTwilioConfigured()}
      mode="local"
    />
  );
}
