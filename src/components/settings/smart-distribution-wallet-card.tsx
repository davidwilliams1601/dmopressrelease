'use client';

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { useFirestore, useDoc, useCollection, useMemoFirebase } from '@/firebase';
import { collection, doc, query, orderBy, limit } from 'firebase/firestore';
import type { CreditWalletSummary, CreditTransaction } from '@/lib/types';
import { toDate } from '@/lib/utils';
import { format } from 'date-fns';
import { AlertTriangle, Coins } from 'lucide-react';

type SmartDistributionWalletCardProps = {
  orgId: string;
};

const TYPE_LABELS: Record<CreditTransaction['type'], string> = {
  purchase: 'Purchase',
  included_allowance: 'Included allowance',
  grant: 'Grant',
  usage: 'Send',
  refund: 'Refund',
  adjustment: 'Adjustment',
  expiry: 'Expiry',
  reversal: 'Reversal',
  migration: 'Migration',
};

/**
 * Org-facing Smart Distribution credit wallet + transaction history. Read-only \u2014
 * balance and ledger are both maintained exclusively by Cloud Functions
 * (see functions/src/credits.ts); this component only reads
 * orgs/{orgId}/creditWallet/summary and the 20 most recent
 * orgs/{orgId}/creditTransactions rows. Both reads are already permitted for any
 * team member by the existing firestore.rules (no rule changes needed for this UI).
 */
export function SmartDistributionWalletCard({ orgId }: SmartDistributionWalletCardProps) {
  const firestore = useFirestore();

  const walletQuery = useDoc<CreditWalletSummary>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return doc(firestore, 'orgs', orgId, 'creditWallet', 'summary');
    }, [firestore, orgId])
  );
  const wallet = walletQuery.data;

  const transactionsQuery = useCollection<CreditTransaction>(
    useMemoFirebase(() => {
      if (!orgId) return null;
      return query(
        collection(firestore, 'orgs', orgId, 'creditTransactions'),
        orderBy('createdAt', 'desc'),
        limit(20)
      );
    }, [firestore, orgId])
  );
  const transactions = transactionsQuery.data || [];

  if (walletQuery.isLoading) {
    return <Skeleton className="h-64 w-full rounded-xl" />;
  }

  // QA fix (M9): a failed walletQuery read (e.g. a transient/network error, which
  // use-doc.tsx handles locally rather than crashing the page) previously fell through
  // to `wallet?.balance ?? 0`, showing "0 credits" — indistinguishable from a genuinely
  // empty/zero wallet — which could wrongly make an org believe Smart Distribution sends
  // are unavailable to them. Surface the failure instead of guessing a balance.
  if (walletQuery.error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="font-headline flex items-center gap-2">
            <Coins className="h-5 w-5 text-primary" />
            Smart Distribution credits
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Couldn&apos;t load your credit balance</AlertTitle>
            <AlertDescription>
              {walletQuery.error.message || 'Something went wrong loading your wallet.'} Try
              refreshing the page — this isn&apos;t necessarily a zero balance.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const balance = wallet?.balance ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-headline flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              Smart Distribution credits
            </CardTitle>
            <CardDescription>
              One credit is used only when a message is accepted for delivery to a Press Pilot
              network contact.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="text-base font-semibold px-3 py-1">
            {balance} credit{balance !== 1 ? 's' : ''}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {wallet?.smartDistributionSuspended && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Smart Distribution suspended</AlertTitle>
            <AlertDescription>
              Your Smart Distribution access has been suspended. Contact us if you believe this is
              a mistake.
            </AlertDescription>
          </Alert>
        )}

        {transactionsQuery.error ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Couldn&apos;t load your recent credit activity. Try refreshing the page.
            </AlertDescription>
          </Alert>
        ) : transactions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No credit activity yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground border-b">
                  <th className="py-2 pr-4 font-medium">Date</th>
                  <th className="py-2 pr-4 font-medium">Type</th>
                  <th className="py-2 pr-4 font-medium">Note</th>
                  <th className="py-2 pr-4 font-medium text-right">Change</th>
                  <th className="py-2 font-medium text-right">Balance after</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx) => (
                  <tr key={tx.id} className="border-b last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap text-muted-foreground">
                      {tx.createdAt ? format(toDate(tx.createdAt), 'dd MMM yyyy, HH:mm') : '—'}
                    </td>
                    <td className="py-2 pr-4">{TYPE_LABELS[tx.type] ?? tx.type}</td>
                    <td className="py-2 pr-4 text-muted-foreground">
                      {tx.reasonNote || tx.reasonCode || '—'}
                    </td>
                    <td
                      className={`py-2 pr-4 text-right font-medium ${
                        tx.quantity > 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {tx.quantity > 0 ? '+' : ''}
                      {tx.quantity}
                    </td>
                    <td className="py-2 text-right">{tx.balanceAfter}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
