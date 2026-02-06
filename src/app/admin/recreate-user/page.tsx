'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function RecreateUserPage() {
  const [email, setEmail] = useState('davidwilliams1601@gmail.com');
  const [name, setName] = useState('David Test');
  const [role, setRole] = useState('Admin');
  const [isProcessing, setIsProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRecreate = async () => {
    setIsProcessing(true);
    setResult(null);
    setError(null);

    try {
      const functions = getFunctions();
      const recreateUser = httpsCallable(functions, 'recreateUser');

      const response = await recreateUser({
        orgId: 'visit-kent',
        email,
        name,
        role,
      });

      setResult(response.data);
      console.log('Recreate user result:', response.data);
    } catch (err: any) {
      console.error('Error recreating user:', err);
      setError(err.message || String(err));
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-headline font-bold">Recreate User</h1>
        <p className="text-muted-foreground">
          Delete and recreate a user account with proper Firestore document
        </p>
      </div>

      <Alert>
        <AlertDescription>
          ⚠️ This will delete the existing user (if any) and create a new one with a temporary password.
          You must be logged in as an admin to use this function.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>User Details</CardTitle>
          <CardDescription>
            Enter the details for the user you want to recreate
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="name">Full Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="User">User</SelectItem>
                <SelectItem value="Admin">Admin</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleRecreate}
            disabled={isProcessing || !email || !name}
            className="w-full"
          >
            {isProcessing ? 'Processing...' : 'Recreate User'}
          </Button>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {result && result.success && (
        <Card className="border-green-600">
          <CardHeader>
            <CardTitle className="text-green-600">✅ User Recreated Successfully!</CardTitle>
            <CardDescription>
              The user has been deleted and recreated with a new temporary password
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-muted p-4 rounded-lg space-y-2">
              <div>
                <Label className="text-xs text-muted-foreground">Email</Label>
                <p className="font-mono">{result.email}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">User ID</Label>
                <p className="font-mono text-xs">{result.userId}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Temporary Password</Label>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-background px-3 py-2 rounded border font-mono text-sm">
                    {result.tempPassword}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(result.tempPassword);
                      alert('Password copied to clipboard!');
                    }}
                  >
                    Copy
                  </Button>
                </div>
              </div>
            </div>

            <Alert>
              <AlertDescription>
                ✅ Document verified to exist in Firestore. You can now log in with this email and password.
                Please change the password after logging in.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
