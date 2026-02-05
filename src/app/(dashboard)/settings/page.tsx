'use client';

import SettingsForm from '@/components/settings/settings-form';
import { useFirebase, useDoc, useMemoFirebase } from '@/firebase';
import { doc } from 'firebase/firestore';

export default function SettingsPage() {
  const { firestore, isUserLoading } = useFirebase();

  const orgId = 'visit-kent'; // Hardcoded for now

  // Fetch organization document
  const orgDoc = useDoc(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return doc(firestore, 'orgs', orgId);
    }, [firestore, orgId])
  );

  if (isUserLoading || orgDoc.isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-3xl font-headline font-bold">Settings</h1>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!orgDoc.data) {
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
      <SettingsForm organization={orgDoc.data} />
    </div>
  );
}
