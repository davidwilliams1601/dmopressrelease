'use client';
export const dynamic = 'force-dynamic';

import SettingsForm from '@/components/settings/settings-form';
import { useUserData } from '@/hooks/use-user-data';
import { useOrganization } from '@/hooks/use-organization';

export default function SettingsPage() {
  const { orgId, isLoading: isUserDataLoading } = useUserData();
  const { organization, isLoading: isOrgLoading } = useOrganization(orgId);

  if (isUserDataLoading || isOrgLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Settings</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!organization) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Settings</h1>
          <p className="text-muted-foreground text-red-500">
            Organization not found. Please ensure you have created an organization in Firestore.
          </p>
        </div>
      </div>
    );
  }

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
