'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Coins, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import type { CreditTransaction, CreditWalletSummary } from '@/lib/types';
import { format } from 'date-fns';

type CreditActionsDialogProps = {
  orgId: string;
  orgName: string;
  onUpdated: () => void;
};

type Action = 'grant' | 'purchase' | 'refund' | 'adjustment' | 'reversal';

/**
 * Per-org Smart Distribution credit actions. Every mutating action calls its own
 * superadmin-gated callable (grantCredits / purchaseCredits / issueRefund /
 * adjustCredits / reverseTransaction) rather than writing Firestore directly, since
 * creditTransactions and creditWallet are `allow write: if false` for every client.
 * Pattern copied from EditOrgLimitsDialog.
 */
export function CreditActionsDialog({ orgId, orgName, onUpdated }: CreditActionsDialogProps) {
  const [open, setOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);
  const [wallet, setWallet] = useState<CreditWalletSummary | null>(null);
  const [transactions, setTransactions] = useState<CreditTransaction[]>([]);
  const { toast } = useToast();

  const [action, setAction] = useState<Action>('grant');
  const [quantity, setQuantity] = useState('');
  const [reasonNote, setReasonNote] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [suspended, setSuspended] = useState(false);
  const [suspendNote, setSuspendNote] = useState('');
  const [isSuspending, setIsSuspending] = useState(false);

  const loadSummary = async () => {
    setIsSummaryLoading(true);
    try {
      const functions = getFunctions();
      const getSummary = httpsCallable<{ orgId: string }, { wallet: CreditWalletSummary; transactions: CreditTransaction[] }>(
        functions,
        'getOrgCreditSummary'
      );
      const result = await getSummary({ orgId });
      setWallet(result.data.wallet);
      setTransactions(result.data.transactions);
      setSuspended(!!result.data.wallet?.smartDistributionSuspended);
    } catch (err: any) {
      console.error('Failed to load credit summary:', err);
      toast({ title: 'Failed to load balance', description: err.message, variant: 'destructive' });
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (v) loadSummary();
    else {
      setQuantity('');
      setReasonNote('');
      setExpiresAt('');
      setCampaignId('');
      setTransactionId('');
      setSuspendNote('');
    }
  };

  const runAction = async () => {
    const parsedQuantity = parseFloat(quantity);
    if (action !== 'reversal' && (isNaN(parsedQuantity) || (action === 'adjustment' ? parsedQuantity === 0 : parsedQuantity <= 0))) {
      toast({ title: 'Invalid quantity', description: action === 'adjustment' ? 'Enter a non-zero number.' : 'Enter a positive number.', variant: 'destructive' });
      return;
    }
    if (!reasonNote.trim()) {
      toast({ title: 'Reason required', description: 'Every credit action needs a reason note for the ledger.', variant: 'destructive' });
      return;
    }
    if (action === 'refund' && !campaignId.trim()) {
      toast({ title: 'Campaign ID required', description: 'Refunds must reference the campaign being refunded.', variant: 'destructive' });
      return;
    }
    if (action === 'reversal' && !transactionId.trim()) {
      toast({ title: 'Transaction ID required', description: 'Select which transaction to reverse.', variant: 'destructive' });
      return;
    }

    setIsLoading(true);
    try {
      const functions = getFunctions();
      const idempotencyKey = crypto.randomUUID();
      const callableName =
        action === 'grant' ? 'grantCredits'
        : action === 'purchase' ? 'purchaseCredits'
        : action === 'refund' ? 'issueRefund'
        : action === 'adjustment' ? 'adjustCredits'
        : 'reverseTransaction';

      const payload: Record<string, unknown> = { orgId, reasonNote: reasonNote.trim(), idempotencyKey };
      if (action === 'grant') {
        payload.quantity = parsedQuantity;
        if (expiresAt) payload.expiresAt = new Date(expiresAt).toISOString();
      } else if (action === 'purchase') {
        payload.quantity = parsedQuantity;
      } else if (action === 'refund') {
        payload.quantity = parsedQuantity;
        payload.campaignId = campaignId.trim();
      } else if (action === 'adjustment') {
        payload.quantity = parsedQuantity;
      } else if (action === 'reversal') {
        payload.transactionId = transactionId.trim();
      }

      const call = httpsCallable(functions, callableName);
      await call(payload);

      toast({ title: 'Credit action recorded', description: `${orgName}'s ledger has been updated.` });
      setQuantity('');
      setReasonNote('');
      setExpiresAt('');
      setCampaignId('');
      setTransactionId('');
      await loadSummary();
      onUpdated();
    } catch (err: any) {
      console.error('Credit action failed:', err);
      toast({ title: 'Action failed', description: err.message || 'The credit action could not be completed.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSuspendToggle = async (next: boolean) => {
    setIsSuspending(true);
    try {
      const functions = getFunctions();
      const call = httpsCallable(functions, 'suspendSmartDistribution');
      await call({ orgId, suspended: next, reasonNote: suspendNote.trim() || undefined });
      setSuspended(next);
      toast({ title: next ? 'Smart Distribution suspended' : 'Smart Distribution re-enabled', description: orgName });
      onUpdated();
    } catch (err: any) {
      console.error('Failed to toggle suspension:', err);
      toast({ title: 'Action failed', description: err.message, variant: 'destructive' });
    } finally {
      setIsSuspending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          <Coins className="h-4 w-4" />
          Credits
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Smart Distribution credits — {orgName}</DialogTitle>
          <DialogDescription>
            Every action below appends an immutable ledger entry — balances are never edited directly.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <p className="text-sm text-muted-foreground">Current balance</p>
            <p className="text-2xl font-semibold">
              {isSummaryLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : wallet?.balance ?? 0}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {suspended && <Badge variant="destructive">Suspended</Badge>}
            <div className="flex items-center gap-2">
              <Label htmlFor="suspend-toggle" className="text-sm">Suspend Smart Distribution</Label>
              <Switch id="suspend-toggle" checked={suspended} disabled={isSuspending} onCheckedChange={handleSuspendToggle} />
            </div>
          </div>
        </div>

        <Tabs value={action} onValueChange={(v) => setAction(v as Action)}>
          <TabsList className="grid grid-cols-5">
            <TabsTrigger value="grant">Grant</TabsTrigger>
            <TabsTrigger value="purchase">Purchase</TabsTrigger>
            <TabsTrigger value="refund">Refund</TabsTrigger>
            <TabsTrigger value="adjustment">Adjust</TabsTrigger>
            <TabsTrigger value="reversal">Reverse</TabsTrigger>
          </TabsList>

          <TabsContent value={action} className="space-y-3 pt-3">
            {action !== 'reversal' && (
              <div className="grid gap-2">
                <Label htmlFor="quantity">{action === 'adjustment' ? 'Quantity (+/-)' : 'Quantity'}</Label>
                <Input id="quantity" type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={action === 'adjustment' ? 'e.g. -5' : 'e.g. 50'} />
              </div>
            )}
            {action === 'grant' && (
              <div className="grid gap-2">
                <Label htmlFor="expiresAt">Expiry date (optional)</Label>
                <Input id="expiresAt" type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </div>
            )}
            {action === 'refund' && (
              <div className="grid gap-2">
                <Label htmlFor="campaignId">Campaign ID</Label>
                <Input id="campaignId" value={campaignId} onChange={(e) => setCampaignId(e.target.value)} placeholder="Campaign this refund relates to" />
              </div>
            )}
            {action === 'reversal' && (
              <div className="grid gap-2">
                <Label htmlFor="transactionId">Transaction ID to reverse</Label>
                <Input id="transactionId" value={transactionId} onChange={(e) => setTransactionId(e.target.value)} placeholder="Copy the ID from the ledger below" />
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="reasonNote">Reason (visible to the organisation)</Label>
              <Textarea id="reasonNote" value={reasonNote} onChange={(e) => setReasonNote(e.target.value)} placeholder="Why is this change happening?" />
            </div>
            <Button onClick={runAction} disabled={isLoading} className="w-full">
              {isLoading ? <><Loader2 className="h-4 w-4 animate-spin" /> Recording…</> : `Record ${action}`}
            </Button>
          </TabsContent>
        </Tabs>

        <div className="space-y-2">
          <p className="text-sm font-medium">Recent ledger entries</p>
          <div className="rounded-md border max-h-56 overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.length === 0 && !isSummaryLoading && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground">No ledger entries yet.</TableCell></TableRow>
                )}
                {transactions.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="text-xs whitespace-nowrap">
                      {t.createdAt?.toDate ? format(t.createdAt.toDate(), 'd MMM yyyy HH:mm') : '—'}
                    </TableCell>
                    <TableCell><Badge variant="outline">{t.type}</Badge></TableCell>
                    <TableCell className={`text-right ${t.quantity < 0 ? 'text-destructive' : 'text-green-600'}`}>{t.quantity > 0 ? `+${t.quantity}` : t.quantity}</TableCell>
                    <TableCell className="text-right">{t.balanceAfter}</TableCell>
                    <TableCell className="text-xs max-w-[160px] truncate">{t.reasonNote || t.reasonCode}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[100px] truncate">{t.id}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
