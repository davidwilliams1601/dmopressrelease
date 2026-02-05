import SettingsForm from '@/components/settings/settings-form';
import { getOrganization } from '@/lib/data';
import type { Metadata } from 'next';

export const metadata: Metadata = {
    title: 'Settings | PressPilot',
};

export default function SettingsPage() {
  const organization = getOrganization();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-3xl font-headline font-bold">Settings</h1>
        <p className="text-muted-foreground">
          Manage your organization details and preferences.
        </p>
      </div>
      <SettingsForm organization={organization} />
    </div>
  );
}
