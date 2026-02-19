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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Upload, Download, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { collection, doc, writeBatch, serverTimestamp, increment } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';

type ParsedRow = {
  name: string;
  email: string;
  outlet: string;
  position: string;
  notes: string;
  error?: string;
};

type CsvImportDialogProps = {
  orgId: string;
  listId: string;
};

const TEMPLATE_CSV =
  'name,email,outlet,position,notes\n' +
  'Jane Smith,jane@thetimes.co.uk,The Times,Travel Editor,Covers UK travel\n' +
  'John Doe,john@guardian.com,The Guardian,Lifestyle Correspondent,\n';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Very simple CSV parser — handles quoted fields containing commas/newlines. */
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

  // Last field/row
  if (field || row.length > 0) {
    row.push(field.trim());
    if (row.some((f) => f !== '')) rows.push(row);
  }

  return rows;
}

function parseRecipients(text: string): ParsedRow[] {
  const rows = parseCsv(text);
  if (rows.length < 2) return [];

  // Normalise headers
  const headers = rows[0].map((h) => h.toLowerCase().replace(/\s+/g, ''));
  const idx = (names: string[]) => {
    for (const n of names) {
      const i = headers.indexOf(n);
      if (i !== -1) return i;
    }
    return -1;
  };

  const nameIdx    = idx(['name', 'fullname', 'contactname']);
  const emailIdx   = idx(['email', 'emailaddress']);
  const outletIdx  = idx(['outlet', 'publication', 'outlet/publication']);
  const posIdx     = idx(['position', 'role', 'jobtitle', 'title']);
  const notesIdx   = idx(['notes', 'note', 'comments']);

  return rows.slice(1).map((row) => {
    const get = (i: number) => (i >= 0 ? (row[i] || '').trim() : '');
    const name   = get(nameIdx);
    const email  = get(emailIdx);
    const outlet = get(outletIdx);

    let error: string | undefined;
    if (!name)                      error = 'Name is required';
    else if (!email)                error = 'Email is required';
    else if (!EMAIL_RE.test(email)) error = 'Invalid email format';
    else if (!outlet)               error = 'Outlet is required';

    return { name, email, outlet, position: get(posIdx), notes: get(notesIdx), error };
  }).filter((r) => r.name || r.email || r.outlet); // drop completely blank rows
}

export function CsvImportDialog({ orgId, listId }: CsvImportDialogProps) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [fileName, setFileName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const firestore = useFirestore();
  const { toast } = useToast();

  const validRows   = rows.filter((r) => !r.error);
  const invalidRows = rows.filter((r) => r.error);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setRows(parseRecipients(text));
    };
    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (validRows.length === 0) return;
    setIsImporting(true);

    try {
      const recipientsRef = collection(
        firestore, 'orgs', orgId, 'outletLists', listId, 'recipients'
      );
      const listRef = doc(firestore, 'orgs', orgId, 'outletLists', listId);

      // Firestore batches are limited to 500 ops each
      const BATCH_SIZE = 499;
      for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
        const batch = writeBatch(firestore);
        const chunk = validRows.slice(i, i + BATCH_SIZE);

        chunk.forEach((row) => {
          const ref = doc(recipientsRef);
          batch.set(ref, {
            orgId,
            outletListId: listId,
            name: row.name,
            email: row.email.toLowerCase(),
            outlet: row.outlet,
            position: row.position || '',
            notes: row.notes || '',
            createdAt: serverTimestamp(),
          });
        });

        await batch.commit();
      }

      // Update recipient count
      const countBatch = writeBatch(firestore);
      countBatch.update(listRef, {
        recipientCount: increment(validRows.length),
        updatedAt: serverTimestamp(),
      });
      await countBatch.commit();

      toast({
        title: `${validRows.length} contacts imported`,
        description: invalidRows.length > 0
          ? `${invalidRows.length} row${invalidRows.length !== 1 ? 's' : ''} were skipped due to errors.`
          : 'All contacts added successfully.',
      });

      setOpen(false);
      resetState();
    } catch (err) {
      console.error('CSV import error:', err);
      toast({
        title: 'Import failed',
        description: 'There was a problem importing the contacts. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const resetState = () => {
    setRows([]);
    setFileName('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleOpenChange = (v: boolean) => {
    setOpen(v);
    if (!v) resetState();
  };

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contacts-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="h-4 w-4" />
          Import CSV
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Import Contacts from CSV</DialogTitle>
          <DialogDescription>
            Upload a CSV file to bulk-add contacts to this list.
            Required columns: <strong>name</strong>, <strong>email</strong>, <strong>outlet</strong>.
            Optional: <strong>position</strong>, <strong>notes</strong>.
          </DialogDescription>
        </DialogHeader>

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
              <p className="text-sm text-muted-foreground">
                Click to select a CSV file
              </p>
            )}
            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={handleFile}
            />
          </div>

          {rows.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="default">{validRows.length} valid</Badge>
                {invalidRows.length > 0 && (
                  <Badge variant="destructive">{invalidRows.length} skipped</Badge>
                )}
              </div>

              {invalidRows.length > 0 && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    {invalidRows.length} row{invalidRows.length !== 1 ? 's' : ''} will be skipped.
                    Fix the errors in your file and re-upload to include them.
                  </AlertDescription>
                </Alert>
              )}

              <div className="max-h-56 overflow-y-auto rounded-md border text-sm">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-8"></TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Outlet</TableHead>
                      <TableHead>Position</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.slice(0, 50).map((row, i) => (
                      <TableRow key={i} className={row.error ? 'bg-destructive/5' : ''}>
                        <TableCell>
                          {row.error
                            ? <span title={row.error}><AlertCircle className="h-4 w-4 text-destructive" /></span>
                            : <CheckCircle2 className="h-4 w-4 text-green-500" />
                          }
                        </TableCell>
                        <TableCell>{row.name || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                        <TableCell>{row.email || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                        <TableCell>{row.outlet || <span className="text-muted-foreground italic">empty</span>}</TableCell>
                        <TableCell className="text-muted-foreground">{row.position}</TableCell>
                      </TableRow>
                    ))}
                    {rows.length > 50 && (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground py-2 text-xs">
                          …and {rows.length - 50} more rows
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleImport}
            disabled={validRows.length === 0 || isImporting}
          >
            <Upload className="h-4 w-4" />
            {isImporting
              ? 'Importing…'
              : validRows.length > 0
              ? `Import ${validRows.length} contact${validRows.length !== 1 ? 's' : ''}`
              : 'Import'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
