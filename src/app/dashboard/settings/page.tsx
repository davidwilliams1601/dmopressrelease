'use client';
export const dynamic = 'force-dynamic';

import SettingsForm from '@/components/settings/settings-form';
import UserProfileCard from '@/components/settings/user-profile-card';
import ChangePasswordCard from '@/components/settings/change-password-card';
import MediaEnquiryLinkCard from '@/components/settings/media-enquiry-link-card';
import NewsroomLinkCard from '@/components/settings/newsroom-link-card';
import NotificationPrefsCard from '@/components/settings/notification-prefs-card';
import ContentTypesCard from '@/components/settings/content-types-card';
import BrandingCard from '@/components/settings/branding-card';
import { useUserData } from '@/hooks/use-user-data';
import { useOrganization } from '@/hooks/use-organization';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CreditCard } from 'lucide-react';

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
      <div>
        <Button asChild variant="outline">
          <Link href="/dashboard/settings/billing">
            <CreditCard className="h-4 w-4" />
            Plan &amp; Billing
          </Link>
        </Button>
      </div>
      <SettingsForm organization={organization} />
      <BrandingCard organization={organization} />
      <ContentTypesCard organization={organization} />
      <NewsroomLinkCard orgSlug={organization.slug} />
      <MediaEnquiryLinkCard orgSlug={organization.slug} />
      <UserProfileCard />
      <NotificationPrefsCard />
      <ChangePasswordCard />
    </div>
  );
}
