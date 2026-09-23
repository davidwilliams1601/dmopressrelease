'use client';

/**
 * "Where this release appeared" on the release page. The natural moment to log coverage is
 * when you are looking at the release that earned it, and logging from here pre-links the
 * release and the members whose stories went into it.
 */

import { useState } from 'react';
import Link from 'next/link';
import { collection, query, where } from 'firebase/firestore';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useCollection, useFirebase, useMemoFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { AddCoverageDialog } from '@/components/coverage/add-coverage-dialog';
import { CoverageTable } from '@/components/coverage/coverage-table';
import type { CoverageRecord, Release, User } from '@/lib/types';

export function ReleaseCoverageCard({ release, orgId, membersLabel = 'Partners' }: { release: Release; orgId: string; membersLabel?: string }) {
  const { firestore, user } = useFirebase();
  const { name, role } = useUserData();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<CoverageRecord | null>(null);

  const coverage = useCollection<CoverageRecord>(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'coverage'), where('releaseId', '==', release.id)),
      [firestore, orgId, release.id]
    )
  );
  const members = useCollection<User>(
    useMemoFirebase(
      () => query(collection(firestore, 'orgs', orgId, 'users'), where('role', '==', 'Partner')),
      [firestore, orgId]
    )
  );

  const records = (coverage.data || []) as CoverageRecord[];
  const memberList = ((members.data || []) as User[]).map((u) => ({ id: u.id, name: u.name || u.email || 'Member' }));
  const isTeam = role === 'Admin' || role === 'User';

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-xl">Coverage</CardTitle>
          <CardDescription>
            {records.length
              ? `${records.length} ${records.length === 1 ? 'placement' : 'placements'} from this release.`
              : 'Log where this release was picked up so it counts in your reports.'}{' '}
            <Link href="/dashboard/coverage" className="underline">All coverage</Link>
          </CardDescription>
        </div>
        {isTeam && (
          <Button
            size="sm"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            <Plus className="mr-2 h-4 w-4" /> Log coverage
          </Button>
        )}
      </CardHeader>
      {records.length > 0 && (
        <CardContent>
          <CoverageTable
            records={records}
            membersLabel={membersLabel}
            onEdit={
              isTeam
                ? (r) => {
                    setEditing(r);
                    setOpen(true);
                  }
                : undefined
            }
          />
        </CardContent>
      )}
      {isTeam && (
        <AddCoverageDialog
          open={open}
          onOpenChange={setOpen}
          orgId={orgId}
          userId={user?.uid || ''}
          userName={name || user?.email || ''}
          releases={[release]}
          members={memberList}
          existing={editing}
          existingRecords={records}
          defaultReleaseId={release.id}
          membersLabel={membersLabel}
        />
      )}
    </Card>
  );
}
