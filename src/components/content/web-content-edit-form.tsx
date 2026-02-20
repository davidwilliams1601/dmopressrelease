'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, Trash2, Plus, X, Copy, Check } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { WebContent } from '@/lib/types';
import { format } from 'date-fns';
import { useRouter } from 'next/navigation';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const CONTENT_TYPES = ["What's New", 'Event Listing', 'Destination Guide', 'Seasonal Update', 'General'];

type WebContentEditFormProps = {
  content: WebContent;
  orgId: string;
};

function buildHtml(content: WebContent, sections: Array<{ heading: string; body: string }>, title: string, metaDescription: string, introParagraph: string): string {
  const sectionHtml = sections
    .map((s) => `<h2>${s.heading}</h2>\n<p>${s.body}</p>`)
    .join('\n');
  return `<h1>${title}</h1>\n<p class="meta-description">${metaDescription}</p>\n<p>${introParagraph}</p>\n${sectionHtml}`.trim();
}

function buildMarkdown(sections: Array<{ heading: string; body: string }>, title: string, metaDescription: string, introParagraph: string): string {
  const sectionMd = sections
    .map((s) => `## ${s.heading}\n\n${s.body}`)
    .join('\n\n');
  return `# ${title}\n\n> ${metaDescription}\n\n${introParagraph}\n\n${sectionMd}`.trim();
}

function buildPlainText(sections: Array<{ heading: string; body: string }>, title: string, metaDescription: string, introParagraph: string): string {
  const sectionText = sections
    .map((s) => `${s.heading}\n${'─'.repeat(s.heading.length)}\n${s.body}`)
    .join('\n\n');
  return `${title}\n${'═'.repeat(title.length)}\n\n${metaDescription}\n\n${introParagraph}\n\n${sectionText}`.trim();
}

export function WebContentEditForm({ content, orgId }: WebContentEditFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const [title, setTitle] = useState(content.title);
  const [metaDescription, setMetaDescription] = useState(content.metaDescription);
  const [introParagraph, setIntroParagraph] = useState(content.introParagraph);
  const [contentType, setContentType] = useState(content.contentType);
  const [targetMarket, setTargetMarket] = useState(content.targetMarket || '');
  const [status, setStatus] = useState<WebContent['status']>(content.status);
  const [sections, setSections] = useState<Array<{ heading: string; body: string }>>(
    content.sections || []
  );

  const handleSectionChange = (index: number, field: 'heading' | 'body', value: string) => {
    setSections((prev) => prev.map((s, i) => i === index ? { ...s, [field]: value } : s));
  };

  const handleAddSection = () => {
    setSections((prev) => [...prev, { heading: '', body: '' }]);
  };

  const handleRemoveSection = (index: number) => {
    setSections((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const contentRef = doc(firestore, 'orgs', orgId, 'webContent', content.id);

      await updateDocumentNonBlocking(contentRef, {
        title,
        metaDescription,
        introParagraph,
        sections,
        contentType,
        targetMarket,
        status,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Content updated',
        description: 'Your web content has been updated successfully.',
      });
    } catch (error) {
      console.error('Error updating web content:', error);
      toast({
        title: 'Error updating content',
        description: 'There was a problem saving your changes. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const contentRef = doc(firestore, 'orgs', orgId, 'webContent', content.id);
      await deleteDocumentNonBlocking(contentRef);

      toast({
        title: 'Content deleted',
        description: 'The web content has been deleted.',
      });

      router.push('/dashboard/content');
    } catch (error) {
      console.error('Error deleting web content:', error);
      toast({
        title: 'Error deleting content',
        description: 'There was a problem deleting the content. Please try again.',
        variant: 'destructive',
      });
      setIsDeleting(false);
    }
  };

  const handleCopy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      toast({ title: 'Copy failed', description: 'Could not access clipboard.', variant: 'destructive' });
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-6">
        {/* Details Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-headline">Content Details</CardTitle>
                <CardDescription>Metadata and settings for this web content.</CardDescription>
              </div>
              <Badge
                variant={status === 'Published' ? 'default' : status === 'Ready' ? 'secondary' : 'outline'}
                className={
                  status === 'Ready'
                    ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200'
                    : status === 'Published'
                    ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
                    : ''
                }
              >
                {status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="title">Title (H1) *</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Discover Kent's Hidden Gems This Summer"
                required
              />
            </div>

            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="metaDescription">Meta Description *</Label>
                <span className={`text-xs ${metaDescription.length > 160 ? 'text-destructive' : metaDescription.length >= 150 ? 'text-green-600' : 'text-muted-foreground'}`}>
                  {metaDescription.length}/160
                </span>
              </div>
              <Input
                id="metaDescription"
                value={metaDescription}
                onChange={(e) => setMetaDescription(e.target.value)}
                placeholder="150-160 character SEO description..."
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="contentType">Content Type *</Label>
                <Select value={contentType} onValueChange={setContentType} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select content type" />
                  </SelectTrigger>
                  <SelectContent>
                    {CONTENT_TYPES.map((type) => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Status *</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as WebContent['status'])} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Ready">Ready</SelectItem>
                    <SelectItem value="Published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="targetMarket">Target Market</Label>
              <Input
                id="targetMarket"
                value={targetMarket}
                onChange={(e) => setTargetMarket(e.target.value)}
                placeholder="e.g. UK, International, France"
              />
            </div>

            <p className="text-sm text-muted-foreground">
              Created: {format(
                content.createdAt?.toDate ? content.createdAt.toDate() : new Date(content.createdAt),
                'dd MMM yyyy, HH:mm'
              )}
            </p>
          </CardContent>
        </Card>

        {/* Content Card */}
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Content</CardTitle>
            <CardDescription>Intro paragraph and structured sections.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="introParagraph">Intro Paragraph *</Label>
              <Textarea
                id="introParagraph"
                value={introParagraph}
                onChange={(e) => setIntroParagraph(e.target.value)}
                placeholder="Opening paragraph for this web section..."
                className="min-h-[100px]"
                required
              />
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Sections</Label>
                <Button type="button" variant="outline" size="sm" onClick={handleAddSection}>
                  <Plus className="h-4 w-4" />
                  Add Section
                </Button>
              </div>

              {sections.length === 0 && (
                <p className="text-sm text-muted-foreground">No sections yet. Click "Add Section" to add one.</p>
              )}

              {sections.map((section, i) => (
                <Card key={i} className="border-dashed">
                  <CardContent className="pt-4 grid gap-3">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 grid gap-2">
                        <Label htmlFor={`heading-${i}`}>Heading (H2)</Label>
                        <Input
                          id={`heading-${i}`}
                          value={section.heading}
                          onChange={(e) => handleSectionChange(i, 'heading', e.target.value)}
                          placeholder="Section heading..."
                        />
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mt-6 shrink-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveSection(i)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor={`body-${i}`}>Body</Label>
                      <Textarea
                        id={`body-${i}`}
                        value={section.body}
                        onChange={(e) => handleSectionChange(i, 'body', e.target.value)}
                        placeholder="Section body copy..."
                        className="min-h-[80px]"
                      />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Export Card */}
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Export Content</CardTitle>
            <CardDescription>Copy formatted content to paste into your CMS.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCopy('html', buildHtml({ ...content, sections, title, metaDescription, introParagraph }, sections, title, metaDescription, introParagraph))}
            >
              {copiedKey === 'html' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy HTML
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCopy('md', buildMarkdown(sections, title, metaDescription, introParagraph))}
            >
              {copiedKey === 'md' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy Markdown
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => handleCopy('txt', buildPlainText(sections, title, metaDescription, introParagraph))}
            >
              {copiedKey === 'txt' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              Copy Plain Text
            </Button>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button type="button" variant="destructive" disabled={isDeleting}>
                <Trash2 />
                Delete Content
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete &ldquo;{content.title}&rdquo;.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button type="submit" disabled={isSaving}>
            <Save />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </form>
  );
}
