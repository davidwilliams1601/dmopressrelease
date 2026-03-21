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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BarChart2, Loader2, CheckCircle2, ArrowLeft, Eye } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';

type SendQuarterlyReportDialogProps = {
  orgId: string;
  partnerCount: number;
};

function getMostRecentCompletedQuarter(): { year: number; quarter: number } {
  const now = new Date();
  const month = now.getMonth(); // 0–11
  const year = now.getFullYear();
  // Current quarter: months 0-2 → Q1, 3-5 → Q2, 6-8 → Q3, 9-11 → Q4
  const currentQ = Math.floor(month / 3) + 1;
  if (currentQ === 1) return { year: year - 1, quarter: 4 };
  return { year, quarter: currentQ - 1 };
}

const QUARTER_LABELS: Record<number, string> = { 1: 'Q1 (Jan–Mar)', 2: 'Q2 (Apr–Jun)', 3: 'Q3 (Jul–Sep)', 4: 'Q4 (Oct–Dec)' };

type Step = 'form' | 'preview' | 'sending' | 'result';

type PreviewData = {
  html: string;
  partnerCount: number;
  partnerName: string;
};

export function SendQuarterlyReportDialog({ orgId, partnerCount }: SendQuarterlyReportDialogProps) {
  const defaultQ = getMostRecentCompletedQuarter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('form');
  const [isLoading, setIsLoading] = useState(false);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [result, setResult] = useState<{ sentCount: number; partnerCount: number; quarter: string } | null>(null);
  const [year, setYear] = useState(String(defaultQ.year));
  const [quarter, setQuarter] = useState(String(defaultQ.quarter));
  const { toast } = useToast();

  const currentYear = new Date().getFullYear();
  const yearOptions = [currentYear - 1, currentYear];

  const handlePreview = async () => {
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const previewReport = httpsCallable<any, PreviewData>(
        functions,
        'previewQuarterlyPartnerReport'
      );
      const res = await previewReport({ orgId, year: parseInt(year, 10), quarter: parseInt(quarter, 10) });
      setPreview(res.data);
      setStep('preview');
    } catch (error: any) {
      toast({ title: 'Error loading preview', description: error.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSend = async () => {
    setStep('sending');
    setIsLoading(true);
    try {
      const functions = getFunctions();
      const sendReport = httpsCallable<any, { sentCount: number; partnerCount: number; quarter: string }>(
        functions,
        'sendQuarterlyPartnerReport'
      );
      const res = await sendReport({ orgId, year: parseInt(year, 10), quarter: parseInt(quarter, 10) });
      setResult(res.data);
      setStep('result');
    } catch (error: any) {
      toast({ title: 'Error sending report', description: error.message || 'Please try again.', variant: 'destructive' });
      setStep('preview');
    } finally {
      setIsLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setStep('form');
    setResult(null);
    setPreview(null);
    const q = getMostRecentCompletedQuarter();
    setYear(String(q.year));
    setQuarter(String(q.quarter));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <BarChart2 className="h-4 w-4" />
          Send Quarterly Report
        </Button>
      </DialogTrigger>
      <DialogContent className={step === 'preview' ? 'max-w-2xl' : 'max-w-sm'}>
        {step === 'result' && result ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                Reports sent
              </DialogTitle>
              <DialogDescription>
                {result.sentCount} of {result.partnerCount} partner{result.partnerCount !== 1 ? 's' : ''} received their {result.quarter} report.
                {result.sentCount < result.partnerCount && (
                  <span className="block mt-1 text-muted-foreground">
                    Partners with no submissions in that quarter were skipped.
                  </span>
                )}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={handleClose}>Done</Button>
            </DialogFooter>
          </>
        ) : step === 'preview' && preview ? (
          <>
            <DialogHeader>
              <DialogTitle>Preview Quarterly Report</DialogTitle>
              <DialogDescription>
                Preview for <strong>{preview.partnerName}</strong> — {preview.partnerCount} partner{preview.partnerCount !== 1 ? 's' : ''} will receive this report
              </DialogDescription>
            </DialogHeader>
            <div
              className="border rounded-md overflow-auto max-h-[60vh] bg-gray-50"
              dangerouslySetInnerHTML={{ __html: preview.html }}
            />
            <DialogFooter className="flex-row gap-2 sm:justify-between">
              <Button variant="outline" onClick={() => { setStep('form'); setPreview(null); }}>
                <ArrowLeft className="h-4 w-4" />
                Edit
              </Button>
              <Button onClick={handleSend} disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Sending...</>
                ) : (
                  `Send to all ${preview.partnerCount} partners`
                )}
              </Button>
            </DialogFooter>
          </>
        ) : step === 'sending' ? (
          <>
            <DialogHeader>
              <DialogTitle>Sending Reports</DialogTitle>
              <DialogDescription>
                Sending quarterly reports to all partners...
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send Quarterly Partner Report</DialogTitle>
              <DialogDescription>
                Each partner with submissions in the selected quarter will receive a personalised email with their stats and the releases their content appeared in.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="grid gap-2">
                  <Label>Quarter</Label>
                  <Select value={quarter} onValueChange={setQuarter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[1, 2, 3, 4].map((q) => (
                        <SelectItem key={q} value={String(q)}>{QUARTER_LABELS[q]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label>Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {yearOptions.map((y) => (
                        <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                {partnerCount} partner{partnerCount !== 1 ? 's' : ''} in this organisation. Partners with no submissions in that quarter will be skipped.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleClose}>Cancel</Button>
              <Button onClick={handlePreview} disabled={isLoading}>
                {isLoading ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Loading preview...</>
                ) : (
                  <><Eye className="h-4 w-4" /> Preview Report</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
