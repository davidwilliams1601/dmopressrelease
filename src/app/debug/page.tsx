'use client';
export const dynamic = 'force-dynamic';

import { useState } from 'react';
import { useUserData } from '@/hooks/use-user-data';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getFunctions, httpsCallable } from 'firebase/functions';

export default function DebugPage() {
  const { orgId, userData, isLoading } = useUserData();
  const [debugResult, setDebugResult] = useState<any>(null);
  const [isChecking, setIsChecking] = useState(false);

  const handleDebug = async () => {
    setIsChecking(true);
    try {
      const functions = getFunctions();
      const debugUser = httpsCallable(functions, 'debugUser');

      const result = await debugUser({
        orgId: 'visit-kent',
      });

      setDebugResult(result.data);
    } catch (error) {
      console.error('Debug error:', error);
      setDebugResult({ error: String(error) });
    } finally {
      setIsChecking(false);
    }
  };

  if (isLoading) {
    return <div className="p-8">Loading...</div>;
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-headline font-bold">Debug User Document</h1>
        <p className="text-muted-foreground">
          Check what's actually stored in your Firestore user document
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Current User Data (from hook)</CardTitle>
          <CardDescription>
            This is what the useUserData hook sees
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs">
            {JSON.stringify({ orgId, userData }, null, 2)}
          </pre>
        </CardContent>
      </Card>

      <div>
        <Button onClick={handleDebug} disabled={isChecking}>
          {isChecking ? 'Checking...' : 'Check Firestore Document'}
        </Button>
      </div>

      {debugResult && (
        <Card>
          <CardHeader>
            <CardTitle>
              {debugResult.exists ? 'Document Found ✅' : 'Document Not Found ❌'}
            </CardTitle>
            <CardDescription>
              Direct read from Firestore using Admin SDK
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {debugResult.exists ? (
              <>
                <div>
                  <p className="text-sm font-medium mb-2">Document Path:</p>
                  <code className="bg-muted p-2 rounded text-xs block">
                    {debugResult.path}
                  </code>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">OrgID Check:</p>
                  <div className="bg-muted p-3 rounded space-y-1">
                    <p className="text-xs">
                      Expected: <code>{debugResult.orgIdCheck.expected}</code>
                    </p>
                    <p className="text-xs">
                      Actual: <code>{String(debugResult.orgIdCheck.actual)}</code>
                    </p>
                    <p className="text-xs">
                      Type: <code>{debugResult.orgIdCheck.type}</code>
                    </p>
                    <p className={`text-xs font-bold ${debugResult.orgIdCheck.matches ? 'text-green-600' : 'text-red-600'}`}>
                      Match: {debugResult.orgIdCheck.matches ? '✅ YES' : '❌ NO'}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Required Fields:</p>
                  <div className="bg-muted p-3 rounded space-y-1">
                    <p className="text-xs">
                      Present: {debugResult.requiredFields.present.join(', ') || 'none'}
                    </p>
                    {debugResult.requiredFields.missing.length > 0 && (
                      <p className="text-xs text-red-600">
                        Missing: {debugResult.requiredFields.missing.join(', ')}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-sm font-medium mb-2">Full Document Data:</p>
                  <pre className="bg-muted p-4 rounded-lg overflow-auto text-xs max-h-96">
                    {JSON.stringify(debugResult.data, null, 2)}
                  </pre>
                </div>
              </>
            ) : (
              <div className="bg-destructive/10 p-4 rounded-lg">
                <p className="text-destructive font-medium">{debugResult.message}</p>
                <p className="text-sm text-muted-foreground mt-2">
                  Path checked: <code>{debugResult.requestedPath}</code>
                </p>
              </div>
            )}

            {debugResult.error && (
              <div className="bg-destructive/10 p-4 rounded-lg">
                <p className="text-destructive text-sm">{debugResult.error}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
