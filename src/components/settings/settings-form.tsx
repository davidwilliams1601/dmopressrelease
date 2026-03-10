'use client';

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
import type { Organization } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Save } from 'lucide-react';
import { useFirestore } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useState } from 'react';
import { useToast } from '@/hooks/use-toast';

type SettingsFormProps = {
  organization: Organization;
};

export default function SettingsForm({ organization }: SettingsFormProps) {
  const firestore = useFirestore();
  const { toast } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [approvalEnabled, setApprovalEnabled] = useState(
    organization.approvalWorkflowEnabled ?? false
  );

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setIsSaving(true);

    const formData = new FormData(e.currentTarget);

    try {
      const orgRef = doc(firestore, 'orgs', organization.id);

      const maxSubsStr = formData.get('max-submissions-per-partner') as string;
      const maxSubmissionsPerPartner = maxSubsStr ? parseInt(maxSubsStr, 10) : null;

      await updateDocumentNonBlocking(orgRef, {
        name: formData.get('org-name') as string,
        pressContact: {
          name: formData.get('press-contact-name') as string,
          email: formData.get('press-contact-email') as string,
        },
        boilerplate: formData.get('boilerplate') as string,
        brandToneNotes: formData.get('brand-tone-notes') as string,
        ...(maxSubmissionsPerPartner && maxSubmissionsPerPartner > 0
          ? { maxSubmissionsPerPartner }
          : { maxSubmissionsPerPartner: null }),
        approvalWorkflowEnabled: approvalEnabled,
        updatedAt: serverTimestamp(),
      });

      toast({
        title: 'Settings saved',
        description: 'Your organization settings have been updated successfully.',
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      toast({
        title: 'Error saving settings',
        description: 'There was a problem saving your settings. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <Card>
        <CardHeader>
          <CardTitle className="font-headline">Organization Details</CardTitle>
          <CardDescription>
            This information will be used on your public press pages and in AI
            prompts.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <div className="grid gap-2">
            <Label htmlFor="org-name">Organization Name</Label>
            <Input
              id="org-name"
              name="org-name"
              defaultValue={organization.name}
              placeholder="e.g., Visit Kent"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="press-contact-name">Press Contact Name</Label>
            <Input
              id="press-contact-name"
              name="press-contact-name"
              defaultValue={organization.pressContact?.name}
              placeholder="e.g., Jane Doe"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="press-contact-email">Press Contact Email</Label>
            <Input
              id="press-contact-email"
              name="press-contact-email"
              type="email"
              defaultValue={organization.pressContact?.email}
              placeholder="e.g., press@example.com"
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="boilerplate">Boilerplate Text</Label>
            <Textarea
              id="boilerplate"
              name="boilerplate"
              defaultValue={organization.boilerplate}
              className="min-h-32"
              placeholder="Your standard organization description..."
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="brand-tone-notes">Brand / Tone Notes</Label>
            <Textarea
              id="brand-tone-notes"
              name="brand-tone-notes"
              defaultValue={organization.brandToneNotes}
              className="min-h-32"
              placeholder="Describe your brand's voice and tone for AI generation..."
            />
            <p className="text-sm text-muted-foreground">
              Used to guide AI in generating and enhancing press release copy.
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="max-submissions-per-partner">Submission Limit per Partner</Label>
            <Input
              id="max-submissions-per-partner"
              name="max-submissions-per-partner"
              type="number"
              min="1"
              defaultValue={organization.maxSubmissionsPerPartner ?? ''}
              placeholder="Unlimited"
            />
            <p className="text-sm text-muted-foreground">
              Maximum number of submissions each partner can make. Leave empty for unlimited. Helps prevent any one partner from monopolising the queue.
            </p>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div className="space-y-0.5">
              <Label htmlFor="approval-workflow" className="text-base">Approval Workflow</Label>
              <p className="text-sm text-muted-foreground">
                Require approval before a release can be sent.
              </p>
            </div>
            <Switch
              id="approval-workflow"
              checked={approvalEnabled}
              onCheckedChange={setApprovalEnabled}
            />
          </div>
        </CardContent>
        <CardFooter className="border-t px-6 py-4">
          <Button type="submit" disabled={isSaving}>
            <Save />
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </CardFooter>
      </Card>
    </form>
  );
}
