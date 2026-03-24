'use client';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { computeRate } from '@/lib/report-utils';

type Props = {
  totalPartners: number;
  newPartnersInPeriod: number;
  submissionsReceived: number;
  submissionsUsed: number;
  partnerEmailsSent: number;
  partnerEmailOpens: number;
  partnerEmailClicks: number;
  topContributors: Array<{ name: string; submissions: number; used: number }>;
  partnersLabel: string;
  submissionsLabel: string;
};

export default function ReportPartnerEngagement({
  totalPartners,
  newPartnersInPeriod,
  submissionsReceived,
  submissionsUsed,
  partnerEmailsSent,
  partnerEmailOpens,
  partnerEmailClicks,
  topContributors,
  partnersLabel,
  submissionsLabel,
}: Props) {
  const conversionRate = computeRate(submissionsUsed, submissionsReceived);

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-headline font-semibold">{partnersLabel} Engagement</h2>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 print:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">Total {partnersLabel}</p>
            <p className="text-2xl font-bold">{totalPartners}</p>
            {newPartnersInPeriod > 0 && (
              <p className="text-xs text-green-600 dark:text-green-400">
                +{newPartnersInPeriod} new this period
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{submissionsLabel} Received</p>
            <p className="text-2xl font-bold">{submissionsReceived}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{submissionsLabel} Used</p>
            <p className="text-2xl font-bold">{submissionsUsed}</p>
            <p className="text-xs text-muted-foreground">{conversionRate}% conversion</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <p className="text-sm text-muted-foreground">{partnersLabel} Emails Sent</p>
            <p className="text-2xl font-bold">{partnerEmailsSent}</p>
            {partnerEmailsSent > 0 && (
              <p className="text-xs text-muted-foreground">
                {partnerEmailOpens} opens, {partnerEmailClicks} clicks
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {topContributors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-headline text-base">Top Contributors</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{partnersLabel.slice(0, -1)}</TableHead>
                  <TableHead className="text-right">{submissionsLabel}</TableHead>
                  <TableHead className="text-right">Used in {submissionsLabel === 'Stories' ? 'Releases' : 'Releases'}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {topContributors.map((c) => (
                  <TableRow key={c.name}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell className="text-right">{c.submissions}</TableCell>
                    <TableCell className="text-right">
                      {c.used}
                      {c.used > 0 && (
                        <Badge variant="secondary" className="ml-2">
                          {computeRate(c.used, c.submissions)}%
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
