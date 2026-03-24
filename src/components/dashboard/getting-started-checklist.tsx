'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CheckCircle2, Circle, ArrowRight, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useFirebase, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, limit, query, where } from 'firebase/firestore';
import type { Organization, Release } from '@/lib/types';
import { useVerticalConfig } from '@/hooks/use-vertical-config';

type Props = {
  orgId: string;
  releases: Release[];
};

type Step = {
  label: string;
  description: string;
  done: boolean;
  href: string;
};

export default function GettingStartedChecklist({ orgId, releases }: Props) {
  const { firestore } = useFirebase();
  const { config } = useVerticalConfig(orgId);

  const orgDoc = useDoc<Organization>(
    useMemoFirebase(() => doc(firestore, 'orgs', orgId), [firestore, orgId])
  );

  const outletListsQuery = useCollection(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'outletLists'), limit(1)),
      [firestore, orgId]
    )
  );

  const usersQuery = useCollection(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'users'), limit(2)),
      [firestore, orgId]
    )
  );

  const webContentQuery = useCollection(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'webContent'), limit(1)),
      [firestore, orgId]
    )
  );

  const tagsQuery = useCollection(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'tags'), limit(1)),
      [firestore, orgId]
    )
  );

  const partnersQuery = useCollection(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'users'), where('role', '==', 'Partner'), limit(1)),
      [firestore, orgId]
    )
  );

  const submissionsQuery = useCollection(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'submissions'), limit(1)),
      [firestore, orgId]
    )
  );

  const org = orgDoc.data;

  const steps: Step[] = [
    // --- Essentials ---
    {
      label: 'Complete your organisation profile',
      description: 'Add your press contact details and boilerplate text.',
      done: !!(org?.pressContact?.email && org?.boilerplate),
      href: '/dashboard/settings',
    },
    {
      label: 'Upload your logo and brand colours',
      description: 'Customise how your organisation appears on public pages and emails.',
      done: !!(org?.branding?.logoUrl || org?.branding?.primaryColor),
      href: '/dashboard/settings',
    },
    {
      label: 'Build your first outlet list',
      description: 'Add the journalists and publications you want to reach.',
      href: '/dashboard/outlets',
      done: (outletListsQuery.data?.length ?? 0) > 0,
    },
    // --- Content ---
    {
      label: `Create your first ${config.nav.releases.toLowerCase().replace(/s$/, '')}`,
      description: 'Draft content using the AI-assisted editor.',
      href: '/dashboard/releases/new',
      done: releases.length > 0,
    },
    {
      label: `Send your first ${config.nav.releases.toLowerCase().replace(/s$/, '')}`,
      description: 'Distribute to your outlet list and track engagement.',
      href: '/dashboard/releases',
      done: releases.some((r) => r.status === 'Sent'),
    },
    // --- Organisation ---
    {
      label: 'Set up tags for categorisation',
      description: `Organise ${config.nav.submissions.toLowerCase()} with tags to make content easier to find.`,
      href: '/dashboard/settings/tags',
      done: (tagsQuery.data?.length ?? 0) > 0,
    },
    {
      label: 'Invite a team member',
      description: 'Bring colleagues in to collaborate.',
      href: '/dashboard/settings/team',
      done: (usersQuery.data?.length ?? 0) > 1,
    },
    // --- Partners ---
    {
      label: `Invite your first ${config.nav.partnersSettings.toLowerCase().replace(/s$/, '')}`,
      description: `Send an invite link so ${config.nav.partnersSettings.toLowerCase()} can submit content through the portal.`,
      href: '/dashboard/settings/partners',
      done: (partnersQuery.data?.length ?? 0) > 0,
    },
    {
      label: `Receive your first ${config.nav.submissions.toLowerCase().replace(/s$/, '')}`,
      description: `Once a ${config.nav.partnersSettings.toLowerCase().replace(/s$/, '')} submits content, it will appear here for review.`,
      href: '/dashboard/submissions',
      done: (submissionsQuery.data?.length ?? 0) > 0,
    },
    // --- Advanced ---
    {
      label: 'Generate web content from submissions',
      description: 'Turn partner content into web-ready articles with AI.',
      href: '/dashboard/submissions',
      done: (webContentQuery.data?.length ?? 0) > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(`checklist-dismissed-${orgId}`) === 'true';
  });

  if (completedCount === steps.length || dismissed) return null;

  function handleDismiss() {
    localStorage.setItem(`checklist-dismissed-${orgId}`, 'true');
    setDismissed(true);
  }

  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-headline">Getting Started</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">
              {completedCount}/{steps.length} complete
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={handleDismiss}
              title="Dismiss checklist"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-500"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <CardDescription>
          Follow these steps to get your organisation up and running.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-1">
          {steps.map((step) => (
            <div key={step.label}>
              {step.done ? (
                <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 opacity-50">
                  <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                  <span className="text-sm line-through text-muted-foreground">
                    {step.label}
                  </span>
                </div>
              ) : (
                <Link
                  href={step.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted transition-colors group"
                >
                  <Circle className="h-5 w-5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{step.label}</p>
                    <p className="text-xs text-muted-foreground">{step.description}</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
