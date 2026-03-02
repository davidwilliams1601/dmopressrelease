'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { CheckCircle2, Circle, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { useFirebase, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, limit, query } from 'firebase/firestore';
import type { Organization, Release } from '@/lib/types';

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

  const org = orgDoc.data;

  const steps: Step[] = [
    {
      label: 'Complete your organisation profile',
      description: 'Add your press contact details and boilerplate text in Settings.',
      done: !!(org?.pressContact?.email && org?.boilerplate),
      href: '/dashboard/settings',
    },
    {
      label: 'Build your first outlet list',
      description: 'Add the journalists and publications you want to reach.',
      href: '/dashboard/outlets',
      done: (outletListsQuery.data?.length ?? 0) > 0,
    },
    {
      label: 'Invite a team member',
      description: 'Bring colleagues in to collaborate on press releases.',
      href: '/dashboard/settings/team',
      done: (usersQuery.data?.length ?? 0) > 1,
    },
    {
      label: 'Create your first press release',
      description: 'Draft a release using the AI-assisted editor.',
      href: '/dashboard/releases/new',
      done: releases.length > 0,
    },
    {
      label: 'Send your first press release',
      description: 'Distribute a release to your outlet list.',
      href: '/dashboard/releases',
      done: releases.some((r) => r.status === 'Sent'),
    },
    {
      label: 'Generate your first web content',
      description: 'Turn partner submissions into web-ready content with AI.',
      href: '/dashboard/submissions',
      done: (webContentQuery.data?.length ?? 0) > 0,
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;

  if (completedCount === steps.length) return null;

  const progressPercent = Math.round((completedCount / steps.length) * 100);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="font-headline">Getting Started</CardTitle>
          <span className="text-sm text-muted-foreground">
            {completedCount}/{steps.length} complete
          </span>
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
