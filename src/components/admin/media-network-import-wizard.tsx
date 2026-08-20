'use client';

import { useState, useRef } from 'react';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { getFunctions, httpsCallable } from 'firebase/functions';
import {
  NETWORK_IMPORT_TARGET_FIELDS,
  type NetworkImportTargetField,
  suggestNetworkFieldForHeader,
  splitListCell,
  parseAudienceScope,
  NETWORK_SOURCE_TYPE_OPTIONS,
  type MediaNetworkSourceType,
  normaliseOutletTypeLabel,
} from '@/lib/media-taxonomy';

type Step = 'upload' | 'source' | 'map' | 'validate';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same permissive CSV parser used by the customer import wizard (Phase 1). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        row.push(field.trim());
        field = '';
      } else if (ch === '\n' || (ch === '\r' && next === '\n')) {
        if (ch === '\r') i++;
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
      } else if (ch === '\r') {
        row.push(field.trim());
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += ch;
      }
    }
  }

  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some((f) => f !== '')) rows.push(row);
  }

  return rows;
}

/**
 * Superadmin-only import wizard for Press Pilot's own media network. Same wizard
 * mechanics as the customer contact importer (Phase 1), plus a mandatory Source &
 * Rights step before anything is written — see docs/smart-distribution/
 * import-wizard-and-credits.md §2. Every imported row lands at networkStatus:
 * 'review'; nothing is written to mediaNetworkContacts by this dialog directly —
 * the actual write happens server-side in importMediaNetworkBatch, since that
 * collection is `allow write: if false` for every client per firestore.rules.
 */
export function MediaNetworkImportWizard({ onImported }: { onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, NetworkImportTargetField['key']>>({});
  const [sourceType, setSourceType] = useState<MediaNetworkSourceType | ''>('');
  const [sourceReference, setSourceReference] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const resetState = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setSourceType('');
    setSourceReference('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) resetState();
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      const rows = parseCsv(text);
      if (rows.length < 2) {
        toast({ title: 'No contacts found', description: 'The file needs a header row plus at least one contact row.', variant: 'destructive' });
        return;
      }
      const [headerRow, ...rest] = rows;
      const cleanRows = rest.filter((r) => r.some((c) => c.trim() !== ''));
      setHeaders(headerRow);
      setDataRows(cleanRows);

      const suggested: Record<number, NetworkImportTargetField['key']> = {};
      headerRow.forEach((h, i) => { suggested[i] = suggestNetworkFieldForHeader(h); });
      setMapping(suggested);
      setStep('source');
    };
    reader.readAsText(file);
  };

  const mappedTargetKeys = new Set(Object.values(mapping));
  const missingRequired = NETWORK_IMPORT_TARGET_FIELDS.filter((f) => f.required && !mappedTargetKeys.has(f.key));
  const rightsIncomplete =
    !sourceType || ((sourceType === 'licensed' || sourceType === 'partner_provided') && !sourceReference.trim());

  const buildRows = () =>
    dataRows.map((row) => {
      const values: Record<string, string> = {};
      headers.forEach((_, i) => {
        const target = mapping[i];
        if (!target || target === 'ignore') return;
        const cell = (row[i] || '').trim();
        if (!cell) return;
        values[target] = values[target] ? `${values[target]}, ${cell}` : cell;
      });
      return values;
    });

  const previewRows = step === 'validate' ? buildRows() : [];
  const previewValid = previewRows.filter((v) => v.name && v.email && EMAIL_RE.test(v.email) && v.outletName);
  const previewInvalid = previewRows.length - previewValid.length;

  const handleImport = async () => {
    setIsImporting(true);
    try {
      const rows = buildRows().map((values) => ({
        name: values.name,
        email: values.email,
        role: values.role,
        profileUrl: values.profileUrl,
        outletName: values.outletName,
        // QA fix (Medium): normalise the raw CSV label (e.g. "Trade publication") to
        // the controlled kebab-case value ("trade") that MediaNetworkContact.outlet.type
        // actually stores — previously written raw, which silently broke every
        // downstream equality match against this field (see media-taxonomy.ts).
        outletType: values.outletType ? normaliseOutletTypeLabel(values.outletType) : values.outletType,
        location: values.location,
        audienceScope: values.audienceScope ? parseAudienceScope(values.audienceScope) : undefined,
        editorialFocus: values.editorialFocus ? splitListCell(values.editorialFocus) : [],
        geographies: values.geographies ? splitListCell(values.geographies) : [],
        topics: values.topics ? splitListCell(values.topics) : [],
        recentCoverageTitle: values.recentCoverageTitle,
        recentCoverageUrl: values.recentCoverageUrl,
        recentCoverageDate: values.recentCoverageDate,
      }));

      const functions = getFunctions();
      const importBatch = httpsCallable<
        { fileName: string; sourceType: string; sourceReference?: string; rows: typeof rows },
        { batchId: string; totalRows: number; readyCount: number; duplicateCount: number; invalidCount: number }
      >(functions, 'importMediaNetworkBatch');

      const result = await importBatch({
        fileName,
        sourceType,
        sourceReference: sourceReference.trim() || undefined,
        rows,
      });

      toast({
        title: `Batch imported — held for review`,
        description: `${result.data.readyCount} ready · ${result.data.duplicateCount} duplicate · ${result.data.invalidCount} invalid. Nothing is recommendable until you review and publish this batch.`,
      });

      onImported();
      handleOpenChange(false);
    } catch (err: any) {
      console.error('Media network import error:', err);
      toast({ title: 'Import failed', description: err.message || 'There was a problem importing this batch.', variant: 'destructive' });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <Upload className="h-4 w-4" />
          Import network contacts
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import media network contacts</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload a CSV of Press Pilot media-network contacts.'}
            {step === 'source' && 'Record where these contacts came from before mapping columns — required for every batch.'}
            {step === 'map' && 'Review how each column maps to a network-contact field.'}
            {step === 'validate' && "Nothing is published until you review and publish this batch — every row lands as 'review' first."}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div
            className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
            {fileName ? <p className="text-sm font-medium">{fileName}</p> : <p className="text-sm text-muted-foreground">Click to select a CSV file</p>}
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
          </div>
        )}

        {step === 'source' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Source of these contacts *</Label>
              <Select value={sourceType} onValueChange={(v) => setSourceType(v as MediaNetworkSourceType)}>
                <SelectTrigger className="w-full max-w-sm">
                  <SelectValue placeholder="Select a source…" />
                </SelectTrigger>
                <SelectContent>
                  {NETWORK_SOURCE_TYPE_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {(sourceType === 'licensed' || sourceType === 'partner_provided') && (
              <div className="space-y-2">
                <Label>Reference *</Label>
                <Textarea
                  placeholder={sourceType === 'licensed' ? 'e.g. licence/contract reference for this data provider' : 'e.g. partner name and how this list was shared'}
                  value={sourceReference}
                  onChange={(e) => setSourceReference(e.target.value)}
                />
              </div>
            )}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This is recorded against every contact in the batch (`provenance.sourceType`) and cannot be
                changed after import — pick carefully.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            {missingRequired.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>Map a column to: {missingRequired.map((f) => f.label).join(', ')} before continuing.</AlertDescription>
              </Alert>
            )}
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Your column</TableHead>
                    <TableHead>Sample value</TableHead>
                    <TableHead>Maps to</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {headers.map((header, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-medium">{header || <span className="text-muted-foreground italic">(blank)</span>}</TableCell>
                      <TableCell className="text-muted-foreground text-sm max-w-[200px] truncate">
                        {dataRows[0]?.[i] || <span className="italic">empty</span>}
                      </TableCell>
                      <TableCell>
                        <Select
                          value={mapping[i] || 'ignore'}
                          onValueChange={(v) => setMapping((prev) => ({ ...prev, [i]: v as NetworkImportTargetField['key'] }))}
                        >
                          <SelectTrigger className="w-[240px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {NETWORK_IMPORT_TARGET_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {step === 'validate' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{previewValid.length} look ready</Badge>
              {previewInvalid > 0 && <Badge variant="destructive">{previewInvalid} missing required fields</Badge>}
              <Badge variant="secondary">Source: {NETWORK_SOURCE_TYPE_OPTIONS.find((o) => o.value === sourceType)?.label}</Badge>
            </div>
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Duplicate detection against the existing network and final validation both run server-side on
                import. Every row lands at <strong>review</strong> status — none of this becomes recommendable
                until you approve and publish the batch from the review queue.
              </AlertDescription>
            </Alert>
            <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Outlet</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewRows.slice(0, 50).map((r, i) => {
                    const valid = r.name && r.email && EMAIL_RE.test(r.email) && r.outletName;
                    return (
                      <TableRow key={i} className={!valid ? 'bg-destructive/5' : ''}>
                        <TableCell>
                          {valid ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" role="img" aria-label="Valid row" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-destructive" role="img" aria-label="Invalid row — missing name, email, or outlet" />
                          )}
                        </TableCell>
                        <TableCell>{r.name || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                        <TableCell>{r.email || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                        <TableCell>{r.outletName || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div>
            {step !== 'upload' && (
              <Button
                variant="ghost"
                onClick={() => setStep(step === 'validate' ? 'map' : step === 'map' ? 'source' : 'upload')}
              >
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancel</Button>
            {step === 'source' && (
              <Button onClick={() => setStep('map')} disabled={rightsIncomplete}>Continue</Button>
            )}
            {step === 'map' && (
              <Button onClick={() => setStep('validate')} disabled={missingRequired.length > 0}>
                Review {dataRows.length} contact{dataRows.length !== 1 ? 's' : ''}
              </Button>
            )}
            {step === 'validate' && (
              <Button onClick={handleImport} disabled={isImporting || previewValid.length === 0}>
                {isImporting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>) : (<><Upload className="h-4 w-4" /> Import for review</>)}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
