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
import type { Release } from '@/lib/types';

type Props = {
  topReleases: Array<Release & { openRate: number; clickRate: number }>;
  releasesLabel: string;
};

export default function ReportTopReleases({ topReleases, releasesLabel }: Props) {
  if (topReleases.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-headline font-semibold">Top Performing {releasesLabel}</h2>
      <Card>
        <CardContent className="pt-6">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Headline</TableHead>
                <TableHead>Audience</TableHead>
                <TableHead className="text-right">Sends</TableHead>
                <TableHead className="text-right">Opens</TableHead>
                <TableHead className="text-right">Open Rate</TableHead>
                <TableHead className="text-right">Clicks</TableHead>
                <TableHead className="text-right">Click Rate</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topReleases.map((release) => (
                <TableRow key={release.id}>
                  <TableCell className="font-medium max-w-[250px] truncate">
                    {release.headline}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline">{release.audience}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {(release.sends || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {(release.opens || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {release.openRate}%
                  </TableCell>
                  <TableCell className="text-right">
                    {(release.clicks || 0).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    {release.clickRate}%
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
