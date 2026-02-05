'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
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
import { Save, Trash2 } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { updateDocumentNonBlocking, deleteDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import type { Release } from '@/lib/types';
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

type ReleaseEditFormProps = {
  release: Release;
  orgId: string;
};

export function ReleaseEditForm({ release, orgId }: ReleaseEditFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = new FormData(e.currentTarget);
    const headline = formData.get('headline') as string;

    try {
      const releaseRef = doc(firestore, 'orgs', orgId, 'releases', release.id);

      // Create slug from headline if it changed
      const slug = headline
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');

      await updateDocumentNonBlocking(releaseRef, {
        headline,
        slug,
        campaignType: formData.get('campaignType') as string,
        targetMarket: formData.get('targetMarket') as string,
        audience: formData.get('audience') as string,
        bodyCopy: formData.get('bodyCopy') as string || '',
        status: formData.get('status') as string,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Release updated',
        description: 'Your press release has been updated successfully.',
      });
    } catch (error) {
      console.error('Error updating release:', error);
      toast({
        title: 'Error updating release',
        description: 'There was a problem updating your release. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      const releaseRef = doc(firestore, 'orgs', orgId, 'releases', release.id);
      await deleteDocumentNonBlocking(releaseRef);

      toast({
        title: 'Release deleted',
        description: 'Your press release has been deleted successfully.',
      });

      router.push('/releases');
    } catch (error) {
      console.error('Error deleting release:', error);
      toast({
        title: 'Error deleting release',
        description: 'There was a problem deleting your release. Please try again.',
        variant: 'destructive',
      });
      setIsDeleting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div className="grid gap-6">
        {/* Metadata Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="font-headline">Release Details</CardTitle>
                <CardDescription>
                  Basic information about your press release.
                </CardDescription>
              </div>
              <Badge
                variant={
                  release.status === 'Sent'
                    ? 'default'
                    : release.status === 'Ready'
                    ? 'secondary'
                    : 'outline'
                }
                className={
                  release.status === 'Ready'
                    ? 'bg-yellow-200 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-200'
                    : release.status === 'Sent'
                    ? 'bg-green-200 text-green-800 dark:bg-green-800 dark:text-green-200'
                    : ''
                }
              >
                {release.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="headline">Headline *</Label>
              <Input
                id="headline"
                name="headline"
                defaultValue={release.headline}
                placeholder="e.g., New Culinary Trail Launches in Canterbury"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="campaignType">Campaign Type *</Label>
                <Select name="campaignType" defaultValue={release.campaignType} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select campaign type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Seasonal">Seasonal</SelectItem>
                    <SelectItem value="Product Launch">Product Launch</SelectItem>
                    <SelectItem value="Event">Event</SelectItem>
                    <SelectItem value="Partnership">Partnership</SelectItem>
                    <SelectItem value="Award">Award</SelectItem>
                    <SelectItem value="General">General</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label htmlFor="status">Status *</Label>
                <Select name="status" defaultValue={release.status} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Draft">Draft</SelectItem>
                    <SelectItem value="Ready">Ready</SelectItem>
                    <SelectItem value="Sent">Sent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="targetMarket">Target Market *</Label>
                <Input
                  id="targetMarket"
                  name="targetMarket"
                  defaultValue={release.targetMarket}
                  placeholder="e.g., UK, International, France, Belgium"
                  required
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="audience">Audience *</Label>
                <Select name="audience" defaultValue={release.audience} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select audience" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Consumer">Consumer</SelectItem>
                    <SelectItem value="Travel Trade">Travel Trade</SelectItem>
                    <SelectItem value="Hybrid">Hybrid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-2">
              <p className="text-sm text-muted-foreground">
                Created: {format(
                  release.createdAt?.toDate ? release.createdAt.toDate() : new Date(release.createdAt),
                  'dd MMM yyyy, HH:mm'
                )}
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Content Card */}
        <Card>
          <CardHeader>
            <CardTitle className="font-headline">Content</CardTitle>
            <CardDescription>
              The body copy of your press release.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6">
            <div className="grid gap-2">
              <Label htmlFor="bodyCopy">Body Copy</Label>
              <Textarea
                id="bodyCopy"
                name="bodyCopy"
                defaultValue={release.bodyCopy || ''}
                placeholder="Write your press release content here..."
                className="min-h-[400px] font-mono text-sm"
              />
            </div>
          </CardContent>
        </Card>

        {/* Stats Card (if sent) */}
        {release.status === 'Sent' && (
          <Card>
            <CardHeader>
              <CardTitle className="font-headline">Engagement Stats</CardTitle>
              <CardDescription>
                Performance metrics for this press release.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Sends</p>
                  <p className="text-2xl font-bold">{release.sends || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Opens</p>
                  <p className="text-2xl font-bold">{release.opens || 0}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Clicks</p>
                  <p className="text-2xl font-bold">{release.clicks || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Action Buttons */}
        <div className="flex items-center justify-between">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                type="button"
                variant="destructive"
                disabled={isDeleting}
              >
                <Trash2 />
                Delete Release
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. This will permanently delete the press release
                  "{release.headline}".
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete}>
                  Delete
                </AlertDialogAction>
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
