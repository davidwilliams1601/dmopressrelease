'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useFirebase } from '@/firebase';
import { useUserData } from '@/hooks/use-user-data';
import { doc, updateDoc } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { Bell } from 'lucide-react';

export default function NotificationPrefsCard() {
  const { firestore, user } = useFirebase();
  const { orgId, notificationPrefs } = useUserData();
  const { toast } = useToast();

  // Default to true (opt-out model) when prefs haven't been saved yet
  const [partnerSubmissions, setPartnerSubmissions] = useState(true);
  const [mediaRequests, setMediaRequests] = useState(true);

  useEffect(() => {
    if (notificationPrefs) {
      setPartnerSubmissions(notificationPrefs.partnerSubmissions ?? true);
      setMediaRequests(notificationPrefs.mediaRequests ?? true);
    }
  }, [notificationPrefs]);

  const save = async (prefs: { partnerSubmissions: boolean; mediaRequests: boolean }) => {
    if (!user || !orgId) return;
    try {
      const userRef = doc(firestore, 'orgs', orgId, 'users', user.uid);
      await updateDoc(userRef, { notificationPrefs: prefs });
    } catch {
      toast({ title: 'Failed to save preferences', variant: 'destructive' });
    }
  };

  const handlePartnerSubmissions = (checked: boolean) => {
    setPartnerSubmissions(checked);
    save({ partnerSubmissions: checked, mediaRequests });
  };

  const handleMediaRequests = (checked: boolean) => {
    setMediaRequests(checked);
    save({ partnerSubmissions, mediaRequests: checked });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-headline flex items-center gap-2">
          <Bell className="h-5 w-5" />
          Email Notifications
        </CardTitle>
        <CardDescription>
          Choose which events trigger an email to you. Changes save instantly.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="notif-submissions" className="text-sm font-medium">
              Partner submissions
            </Label>
            <p className="text-sm text-muted-foreground">
              Email me when a partner submits new content for review.
            </p>
          </div>
          <Switch
            id="notif-submissions"
            checked={partnerSubmissions}
            onCheckedChange={handlePartnerSubmissions}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="notif-media-requests" className="text-sm font-medium">
              Media requests
            </Label>
            <p className="text-sm text-muted-foreground">
              Email me when a journalist submits a story request.
            </p>
          </div>
          <Switch
            id="notif-media-requests"
            checked={mediaRequests}
            onCheckedChange={handleMediaRequests}
          />
        </div>
      </CardContent>
    </Card>
  );
}
