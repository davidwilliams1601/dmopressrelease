'use client';

import { useState, useRef, useMemo } from 'react';
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
import { Checkbox } from '@/components/ui/checkbox';
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
import { Upload, Download, AlertCircle, CheckCircle2, Loader2, Wand2 } from 'lucide-react';
import { useFirestore, useCollection, useMemoFirebase, addDocumentNonBlocking } from '@/firebase';
import { collection, doc, writeBatch, serverTimestamp, increment, query, orderBy } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import {
  IMPORT_TARGET_FIELDS,
  type ImportTargetField,
  suggestFieldForHeader,
  normaliseHeader,
  parseBooleanCell,
  splitListCell,
  normaliseOutletTypeLabel,
} from '@/lib/media-taxonomy';
import type { ImportMappingProfile } from '@/lib/types';

type ImportWizardDialogProps = {
  orgId: string;
  listId: string;
  /** Emails already present anywhere in this org's outlet lists (any case), used for
   *  duplicate detection. QA fix (Medium): must be org-wide, not just this list —
   *  callers should pass a set built from every outlet list the org owns, not only
   *  the one currently open (see src/app/dashboard/outlets/[listId]/page.tsx). */
  existingEmails: string[];
};

type Step = 'upload' | 'map' | 'validate';

type ParsedRecord = {
  rowIndex: number;
  values: Record<string, string>;
  errors: string[];
  isDuplicate: boolean;
};

const TEMPLATE_CSV =
  'first_name,last_name,email,outlet,role,editorial_focus,geography,topics,outlet_type,last_contacted,relationship_notes,do_not_contact\n' +
  'Jane,Smith,jane@example-times.co.uk,Example Times,Travel Editor,"independent retail, high-street regeneration","Kent, South East England","retail, town centres",local-news,2026-05-12,"Covered our members before; prefers exclusives",false\n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Same permissive CSV parser as the original importer — handles quoted fields with commas/newlines. */
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
 * CSV/XLSX import wizard for outlet-list contacts. Any spreadsheet's header row is
 * auto-mapped (with alias suggestions — e.g. "Beat" -> Editorial focus) and reviewable
 * before anything is written to Firestore. See docs/smart-distribution/
 * import-wizard-and-credits.md for the full design.
 *
 * XLSX note: only CSV is supported today. The two well-known browser XLSX-parsing
 * libraries (xlsx/SheetJS, exceljs) both currently carry open security advisories —
 * see the Phase 1 PR description. Customers can "Save As CSV" from Excel/Sheets in the
 * meantime; native XLSX parsing is a fast-follow once a vetted library is chosen.
 */
export function ImportWizardDialog({ orgId, listId, existingEmails }: ImportWizardDialogProps) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [dataRows, setDataRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<number, ImportTargetField['key']>>({});
  const [saveProfile, setSaveProfile] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const firestore = useFirestore();
  const { toast } = useToast();

  const profilesQuery = useCollection<ImportMappingProfile>(
    useMemoFirebase(() => {
      if (!orgId || !open) return null;
      return query(collection(firestore, 'orgs', orgId, 'importMappingProfiles'), orderBy('createdAt', 'desc'));
    }, [firestore, orgId, open])
  );
  const profiles = profilesQuery.data || [];

  const existingEmailSet = useMemo(
    () => new Set(existingEmails.map((e) => e.toLowerCase().trim())),
    [existingEmails]
  );

  const resetState = () => {
    setStep('upload');
    setFileName('');
    setHeaders([]);
    setDataRows([]);
    setMapping({});
    setSaveProfile(false);
    setProfileName('');
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
        toast({
          title: 'No contacts found',
          description: 'The file needs a header row plus at least one contact row.',
          variant: 'destructive',
        });
        return;
      }
      const [headerRow, ...rest] = rows;
      const cleanRows = rest.filter((r) => r.some((c) => c.trim() !== ''));
      setHeaders(headerRow);
      setDataRows(cleanRows);

      const suggested: Record<number, ImportTargetField['key']> = {};
      headerRow.forEach((h, i) => {
        suggested[i] = suggestFieldForHeader(h);
      });
      setMapping(suggested);
      setStep('map');
    };
    reader.readAsText(file);
  };

  const applyProfile = (profile: ImportMappingProfile) => {
    const next: Record<number, ImportTargetField['key']> = {};
    headers.forEach((h, i) => {
      const key = normaliseHeader(h);
      next[i] = (profile.mapping[key] as ImportTargetField['key']) || 'ignore';
    });
    setMapping(next);
    toast({ title: 'Mapping applied', description: `Applied the "${profile.name}" mapping.` });
  };

  const mappedTargetKeys = new Set(Object.values(mapping));
  const missingRequired = IMPORT_TARGET_FIELDS.filter(
    (f) => f.required && !mappedTargetKeys.has(f.key)
  );

  const parsedRecords: ParsedRecord[] = useMemo(() => {
    if (step !== 'validate') return [];
    const seenEmails = new Set<string>();

    return dataRows.map((row, rowIndex) => {
      const values: Record<string, string> = {};
      headers.forEach((_, i) => {
        const target = mapping[i];
        if (!target || target === 'ignore') return;
        const cell = (row[i] || '').trim();
        if (!cell) return;
        values[target] = values[target] ? `${values[target]}, ${cell}` : cell;
      });

      const name = values.name || '';
      const email = (values.email || '').toLowerCase();
      const outlet = values.outlet || '';

      const errors: string[] = [];
      if (!name) errors.push('Name is required');
      if (!email) errors.push('Email is required');
      else if (!EMAIL_RE.test(email)) errors.push('Invalid email format');
      if (!outlet) errors.push('Outlet is required');

      let isDuplicate = false;
      if (email) {
        if (existingEmailSet.has(email) || seenEmails.has(email)) isDuplicate = true;
        seenEmails.add(email);
      }

      return { rowIndex, values: { ...values, email }, errors, isDuplicate };
    });
  }, [step, dataRows, headers, mapping, existingEmailSet]);

  const readyRecords = parsedRecords.filter((r) => r.errors.length === 0 && !r.isDuplicate);
  const invalidRecords = parsedRecords.filter((r) => r.errors.length > 0);
  const duplicateRecords = parsedRecords.filter((r) => r.errors.length === 0 && r.isDuplicate);

  const handleImport = async () => {
    if (readyRecords.length === 0) return;
    setIsImporting(true);

    try {
      const recipientsRef = collection(firestore, 'orgs', orgId, 'outletLists', listId, 'recipients');
      const listRef = doc(firestore, 'orgs', orgId, 'outletLists', listId);

      const BATCH_SIZE = 499;
      for (let i = 0; i < readyRecords.length; i += BATCH_SIZE) {
        const batch = writeBatch(firestore);
        const chunk = readyRecords.slice(i, i + BATCH_SIZE);

        chunk.forEach((record) => {
          const ref = doc(recipientsRef);
          const data: Record<string, unknown> = {
            orgId,
            outletListId: listId,
            name: record.values.name,
            email: record.values.email,
            outlet: record.values.outlet,
            position: record.values.position || '',
            notes: record.values.notes || '',
            source: 'customer_provided',
            createdAt: serverTimestamp(),
          };
          if (record.values.editorialFocus) data.editorialFocus = splitListCell(record.values.editorialFocus);
          if (record.values.geography) data.geography = splitListCell(record.values.geography);
          if (record.values.topics) data.topics = splitListCell(record.values.topics);
          if (record.values.outletType) data.outletType = normaliseOutletTypeLabel(record.values.outletType);
          if (record.values.relationshipStatus) data.relationshipStatus = record.values.relationshipStatus;
          if (record.values.lastContactedAt) data.lastContactedAt = record.values.lastContactedAt;
          if (record.values.doNotContact) data.doNotContact = parseBooleanCell(record.values.doNotContact);
          batch.set(ref, data);
        });

        await batch.commit();
      }

      const countBatch = writeBatch(firestore);
      countBatch.update(listRef, {
        recipientCount: increment(readyRecords.length),
        updatedAt: serverTimestamp(),
      });
      await countBatch.commit();

      if (saveProfile && profileName.trim()) {
        const profileMapping: Record<string, string> = {};
        headers.forEach((h, i) => {
          const target = mapping[i];
          if (target && target !== 'ignore') profileMapping[normaliseHeader(h)] = target;
        });
        addDocumentNonBlocking(collection(firestore, 'orgs', orgId, 'importMappingProfiles'), {
          orgId,
          name: profileName.trim(),
          mapping: profileMapping,
          createdAt: serverTimestamp(),
        });
      }

      toast({
        title: `${readyRecords.length} contact${readyRecords.length !== 1 ? 's' : ''} imported`,
        description:
          [
            invalidRecords.length > 0 ? `${invalidRecords.length} skipped — errors` : null,
            duplicateRecords.length > 0 ? `${duplicateRecords.length} skipped — duplicate` : null,
          ]
            .filter(Boolean)
            .join(' · ') || 'All contacts added successfully.',
      });

      handleOpenChange(false);
    } catch (err) {
      console.error('Import wizard error:', err);
      toast({
        title: 'Import failed',
        description: 'There was a problem importing the contacts. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'media-contacts-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" />
          Import contacts
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Import media contacts</DialogTitle>
          <DialogDescription>
            {step === 'upload' && 'Upload any spreadsheet — we\'ll help you map its columns, whatever they\'re called.'}
            {step === 'map' && 'Review how each column maps to a Press Pilot field, then continue.'}
            {step === 'validate' && 'Nothing is imported until you confirm below.'}
          </DialogDescription>
        </DialogHeader>

        {step === 'upload' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={downloadTemplate}>
                <Download className="h-4 w-4" />
                Download template
              </Button>
              <span className="text-sm text-muted-foreground">then fill it in and upload below</span>
            </div>

            <div
              className="flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/25 p-8 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
              onClick={() => fileRef.current?.click()}
            >
              <Upload className="h-8 w-8 text-muted-foreground/50 mb-2" />
              {fileName ? (
                <p className="text-sm font-medium">{fileName}</p>
              ) : (
                <p className="text-sm text-muted-foreground">Click to select a CSV file</p>
              )}
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={handleFile}
              />
            </div>

            <p className="text-xs text-muted-foreground">
              XLSX support is coming soon — for now, save your spreadsheet as CSV
              (File → Save As → CSV) before uploading.
            </p>

            {profiles.length > 0 && (
              <p className="text-xs text-muted-foreground">
                You have {profiles.length} saved mapping profile{profiles.length !== 1 ? 's' : ''} —
                you'll be able to apply one after uploading a file.
              </p>
            )}
          </div>
        )}

        {step === 'map' && (
          <div className="space-y-4">
            {profiles.length > 0 && (
              <div className="flex items-center gap-2 rounded-md border bg-muted/40 p-3">
                <Wand2 className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm text-muted-foreground">Apply a saved mapping:</span>
                <Select onValueChange={(id) => {
                  const profile = profiles.find((p) => p.id === id);
                  if (profile) applyProfile(profile);
                }}>
                  <SelectTrigger className="w-[240px] h-8">
                    <SelectValue placeholder="Choose a mapping profile…" />
                  </SelectTrigger>
                  <SelectContent>
                    {profiles.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {missingRequired.length > 0 && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Map a column to: {missingRequired.map((f) => f.label).join(', ')} before continuing.
                </AlertDescription>
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
                          onValueChange={(v) => setMapping((prev) => ({ ...prev, [i]: v as ImportTargetField['key'] }))}
                        >
                          <SelectTrigger className="w-[220px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMPORT_TARGET_FIELDS.map((f) => (
                              <SelectItem key={f.key} value={f.key}>
                                {f.label}{f.required ? ' *' : ''}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <p className="text-xs text-muted-foreground">
              "Editorial focus", "Geography" and "Topics" accept comma-separated values (e.g. "retail, town centres").
            </p>
          </div>
        )}

        {step === 'validate' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="default">{readyRecords.length} ready to import</Badge>
              {duplicateRecords.length > 0 && (
                <Badge variant="secondary">{duplicateRecords.length} possible duplicate{duplicateRecords.length !== 1 ? 's' : ''}</Badge>
              )}
              {invalidRecords.length > 0 && (
                <Badge variant="destructive">{invalidRecords.length} need attention</Badge>
              )}
            </div>

            {(invalidRecords.length > 0 || duplicateRecords.length > 0) && (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Rows with errors or matching an existing contact's email won't be imported.
                  Fix your file and re-upload to include them, or continue to import the {readyRecords.length} ready row{readyRecords.length !== 1 ? 's' : ''}.
                </AlertDescription>
              </Alert>
            )}

            <div className="max-h-64 overflow-y-auto rounded-md border text-sm">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8"></TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Outlet</TableHead>
                    <TableHead>Editorial focus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedRecords.slice(0, 50).map((r) => (
                    <TableRow
                      key={r.rowIndex}
                      className={r.errors.length > 0 ? 'bg-destructive/5' : r.isDuplicate ? 'bg-muted/40' : ''}
                    >
                      <TableCell>
                        {r.errors.length > 0 ? (
                          <span title={r.errors.join(', ')}>
                            <AlertCircle className="h-4 w-4 text-destructive" role="img" aria-label={`Invalid row: ${r.errors.join(', ')}`} />
                          </span>
                        ) : r.isDuplicate ? (
                          <span title="Matches an existing contact's email">
                            <AlertCircle className="h-4 w-4 text-muted-foreground" role="img" aria-label="Duplicate row — matches an existing contact's email" />
                          </span>
                        ) : (
                          <CheckCircle2 className="h-4 w-4 text-green-500" role="img" aria-label="Valid row" />
                        )}
                      </TableCell>
                      <TableCell>{r.values.name || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                      <TableCell>{r.values.email || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                      <TableCell>{r.values.outlet || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                      <TableCell className="text-muted-foreground text-xs max-w-[180px] truncate">{r.values.editorialFocus}</TableCell>
                    </TableRow>
                  ))}
                  {parsedRecords.length > 50 && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-muted-foreground py-2 text-xs">
                        …and {parsedRecords.length - 50} more rows
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-start gap-2 rounded-md border p-3">
              <Checkbox
                id="save-profile"
                checked={saveProfile}
                onCheckedChange={(v) => setSaveProfile(v === true)}
              />
              <div className="flex-1 space-y-2">
                <Label htmlFor="save-profile" className="cursor-pointer">
                  Save this column mapping for next time
                </Label>
                {saveProfile && (
                  <Input
                    placeholder="e.g. Monthly media list export"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                  />
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div>
            {step !== 'upload' && (
              <Button variant="ghost" onClick={() => setStep(step === 'validate' ? 'map' : 'upload')}>
                Back
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => handleOpenChange(false)}>
              Cancel
            </Button>
            {step === 'map' && (
              <Button onClick={() => setStep('validate')} disabled={missingRequired.length > 0}>
                Review {dataRows.length} contact{dataRows.length !== 1 ? 's' : ''}
              </Button>
            )}
            {step === 'validate' && (
              <Button
                onClick={handleImport}
                disabled={readyRecords.length === 0 || isImporting || (saveProfile && !profileName.trim())}
              >
                {isImporting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Importing…</>
                ) : (
                  <><Upload className="h-4 w-4" /> Import {readyRecords.length} contact{readyRecords.length !== 1 ? 's' : ''}</>
                )}
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
