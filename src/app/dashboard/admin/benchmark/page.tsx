'use client';
export const dynamic = 'force-dynamic';

/**
 * Coverage benchmark — the publishable version of what a brief measures.
 *
 * A brief is one organisation's mirror and can only be shown to them. The same measurements
 * across the whole ingested pool answer a question every destination marketer has and nobody
 * can answer with a number: once a story starts here, how long before a second outlet has it?
 *
 * This screen exists to produce sentences that can be posted as they are. So it shows the
 * statements first and the working underneath, and it prints what was withheld as prominently
 * as what was measured — the only reason to believe our numbers is that we say when we do not
 * have enough of them.
 *
 * No organisation is named or countable in anything here, by construction: the engine reads the
 * public item pool and never touches /mediaProspects. See coverage-benchmark-engine.ts.
 */

import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { useUserData } from '@/hooks/use-user-data';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';
import { BarChart3, Copy, Loader2 } from 'lucide-react';

type BenchmarkTopicRow = {
  label: string;
  themeCount: number;
  medianHours: number | null;
  suppressed: boolean;
};

type Benchmark = {
  id?: string;
  windowDays: number;
  dataSpanDays: number | null;
  itemsAnalysed: number;
  outletCount: number;
  themesAnalysed: number;
  responseWindow: {
    sampleSize: number;
    medianHours: number;
    fastestHours: number;
    slowestHours: number;
    p25Hours: number;
    p75Hours: number;
    withinOneDayPct: number;
  } | null;
  singleOutlet: { themeCount: number; singleOutletCount: number; sharePct: number } | null;
  byTopic: BenchmarkTopicRow[];
  withheld: string[];
  statements: string[];
};

export default function CoverageBenchmarkPage() {
  const { isSuperAdmin, isLoading: isUserDataLoading } = useUserData();
  const { toast } = useToast();
  const [windowDays, setWindowDays] = useState('30');
  const [geography, setGeography] = useState('');
  const [regionLabel, setRegionLabel] = useState('');
  const [benchmark, setBenchmark] = useState<Benchmark | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  async function run() {
    setIsRunning(true);
    try {
      const call = httpsCallable(getFunctions(), 'generateCoverageBenchmark');
      const res = await call({
        windowDays: Number(windowDays) || 30,
        geography: geography.trim(),
        regionLabel: regionLabel.trim(),
      });
      setBenchmark(res.data as Benchmark);
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Could not run benchmark', description: err?.message });
    } finally {
      setIsRunning(false);
    }
  }

  function copy(text: string) {
    void navigator.clipboard.writeText(text);
    toast({ title: 'Copied' });
  }

  if (!isUserDataLoading && !isSuperAdmin) {
    return <p className="text-sm text-muted-foreground">Super-admin access required.</p>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Coverage benchmark</h1>
        <p className="text-sm text-muted-foreground">
          Aggregate statistics from the ingested pool, written to be published. No organisation is
          named, counted or identifiable — this measures how a region&apos;s media moves, not who
          was in it.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Run</CardTitle>
          <CardDescription>
            Leave the geography blank to measure the whole pool. Filtering matters when the pool
            covers two unrelated media markets: an average across both describes neither.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <Label htmlFor="window">Window (days)</Label>
              <Input
                id="window"
                value={windowDays}
                onChange={(e) => setWindowDays(e.target.value)}
                inputMode="numeric"
              />
            </div>
            <div>
              <Label htmlFor="geography">Geography tag</Label>
              <Input
                id="geography"
                value={geography}
                onChange={(e) => setGeography(e.target.value)}
                placeholder="Regional"
              />
            </div>
            <div>
              <Label htmlFor="region">How to name it when published</Label>
              <Input
                id="region"
                value={regionLabel}
                onChange={(e) => setRegionLabel(e.target.value)}
                placeholder="the West of England"
              />
            </div>
          </div>
          <Button onClick={run} disabled={isRunning}>
            {isRunning ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <BarChart3 className="mr-2 h-4 w-4" />
            )}
            Run benchmark
          </Button>
        </CardContent>
      </Card>

      {benchmark && (
        <>
          {/* The output that matters: lines that can be posted as they are. */}
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <CardTitle className="text-base">Publishable</CardTitle>
                  <CardDescription>
                    Each line carries its own sample size and window. Nothing here claims
                    causation, predicts anything or mentions the product.
                  </CardDescription>
                </div>
                {benchmark.statements.length > 0 && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(benchmark.statements.join('\n\n'))}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy all
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {benchmark.statements.length === 0 ? (
                <p className="text-sm">
                  Nothing in this window clears the bar for publishing. That is a valid outcome —
                  a soft number posted now is worth less than a firm one posted in a fortnight.
                </p>
              ) : (
                benchmark.statements.map((s) => (
                  <div key={s} className="flex items-start gap-2 rounded-lg border p-3">
                    <p className="flex-1 text-sm leading-relaxed">{s}</p>
                    <Button variant="ghost" size="sm" onClick={() => copy(s)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* The working. */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">The working</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                {[
                  { label: 'Items analysed', value: benchmark.itemsAnalysed },
                  { label: 'Outlets', value: benchmark.outletCount },
                  { label: 'Themes measured', value: benchmark.themesAnalysed },
                  { label: 'Days covered', value: benchmark.dataSpanDays ?? 0 },
                ].map((stat) => (
                  <div key={stat.label} className="rounded-lg border p-3">
                    <div className="text-2xl font-bold">{stat.value}</div>
                    <div className="text-xs text-muted-foreground">{stat.label}</div>
                  </div>
                ))}
              </div>

              {benchmark.responseWindow && (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">Second-outlet window</p>
                  <p className="text-muted-foreground">
                    median {benchmark.responseWindow.medianHours}h · middle half{' '}
                    {benchmark.responseWindow.p25Hours}h–{benchmark.responseWindow.p75Hours}h ·
                    fastest {benchmark.responseWindow.fastestHours}h · slowest{' '}
                    {benchmark.responseWindow.slowestHours}h · n=
                    {benchmark.responseWindow.sampleSize}
                  </p>
                </div>
              )}

              {benchmark.byTopic.length > 0 && (
                <div>
                  <Separator className="mb-3" />
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    By topic
                  </p>
                  <div className="space-y-1.5">
                    {benchmark.byTopic.map((row) => (
                      <div key={row.label} className="flex items-center justify-between text-sm">
                        <span>{row.label}</span>
                        <span className="text-muted-foreground">
                          {row.themeCount} {row.themeCount === 1 ? 'theme' : 'themes'} ·{' '}
                          {row.suppressed ? (
                            <Badge variant="outline">sample too small</Badge>
                          ) : (
                            `median ${row.medianHours}h`
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Printed as prominently as the findings. */}
          {benchmark.withheld.length > 0 && (
            <Card className="border-amber-500/40">
              <CardHeader>
                <CardTitle className="text-base">Withheld</CardTitle>
                <CardDescription>
                  Figures that exist but are not publishable yet. The reason these are shown is
                  the same reason the published ones are believable.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
                  {benchmark.withheld.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
