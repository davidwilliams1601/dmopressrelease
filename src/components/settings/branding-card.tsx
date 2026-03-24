'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
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
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Save, Upload, Trash2, Palette, Wand2, Loader2 } from 'lucide-react';
import { useFirestore, useStorage } from '@/firebase';
import { updateDocumentNonBlocking } from '@/firebase';
import { doc, serverTimestamp } from 'firebase/firestore';
import { useToast } from '@/hooks/use-toast';
import { uploadBrandingLogo, deleteBrandingLogo } from '@/lib/storage';
import {
  isValidHex,
  lightenHex,
  getContrastColor,
  resolveOrgColors,
  getAttribution,
  DEFAULT_PRIMARY,
} from '@/lib/brand-utils';
import type { Organization } from '@/lib/types';

type BrandingCardProps = {
  organization: Organization;
};

export default function BrandingCard({ organization }: BrandingCardProps) {
  const firestore = useFirestore();
  const storage = useStorage();
  const { toast } = useToast();

  const [logoUrl, setLogoUrl] = useState(organization.branding?.logoUrl || '');
  const [logoStoragePath, setLogoStoragePath] = useState(organization.branding?.logoStoragePath || '');
  const [primaryColor, setPrimaryColor] = useState(organization.branding?.primaryColor || DEFAULT_PRIMARY);
  const [secondaryColor, setSecondaryColor] = useState(organization.branding?.secondaryColor || '');
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const attribution = getAttribution(organization.tier);
  const resolved = resolveOrgColors({ primaryColor, secondaryColor });

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Delete old logo if exists
      if (logoStoragePath) {
        await deleteBrandingLogo(storage, logoStoragePath);
      }

      const result = await uploadBrandingLogo(storage, organization.id, file);
      setLogoUrl(result.downloadUrl);
      setLogoStoragePath(result.storagePath);

      toast({ title: 'Logo uploaded', description: 'Remember to save your changes.' });
    } catch (error: any) {
      toast({ title: 'Upload failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  }, [storage, organization.id, logoStoragePath, toast]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'] },
    maxFiles: 1,
    disabled: isUploading,
  });

  async function handleDeleteLogo() {
    if (logoStoragePath) {
      try {
        await deleteBrandingLogo(storage, logoStoragePath);
      } catch {
        // Ignore delete errors
      }
    }
    setLogoUrl('');
    setLogoStoragePath('');
    toast({ title: 'Logo removed', description: 'Remember to save your changes.' });
  }

  function handleAutoSecondary() {
    if (isValidHex(primaryColor)) {
      setSecondaryColor(lightenHex(primaryColor, 0.4));
    }
  }

  async function handleSave() {
    setIsSaving(true);
    try {
      const orgRef = doc(firestore, 'orgs', organization.id);
      updateDocumentNonBlocking(orgRef, {
        branding: {
          logoUrl: logoUrl || null,
          logoStoragePath: logoStoragePath || null,
          primaryColor: isValidHex(primaryColor) ? primaryColor : null,
          secondaryColor: isValidHex(secondaryColor) ? secondaryColor : null,
        },
        updatedAt: serverTimestamp(),
      });
      toast({ title: 'Branding saved' });
    } catch (error: any) {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="font-headline">Branding</CardTitle>
            <CardDescription>
              Customise your logo and brand colours. These appear on your public pages, emails, and reports.
            </CardDescription>
          </div>
          {organization.tier && (
            <Badge variant="secondary" className="capitalize">
              {organization.tier}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Logo Upload */}
        <div className="space-y-2">
          <Label>Organisation Logo</Label>
          {logoUrl ? (
            <div className="flex items-center gap-4">
              <div className="border rounded-lg p-3 bg-muted/30">
                <img src={logoUrl} alt="Logo" className="h-16 w-auto max-w-[200px] object-contain" />
              </div>
              <div className="flex flex-col gap-2">
                <div {...getRootProps()}>
                  <input {...getInputProps()} />
                  <Button variant="outline" size="sm" disabled={isUploading}>
                    <Upload className="mr-2 h-3 w-3" />
                    Replace
                  </Button>
                </div>
                <Button variant="ghost" size="sm" onClick={handleDeleteLogo} className="text-destructive">
                  <Trash2 className="mr-2 h-3 w-3" />
                  Remove
                </Button>
              </div>
            </div>
          ) : (
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              {isUploading ? (
                <div className="flex flex-col items-center gap-2">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">Uploading...</p>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2">
                  <Upload className="h-8 w-8 text-muted-foreground" />
                  <p className="text-sm text-muted-foreground">
                    Drag and drop your logo, or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground">PNG, JPG, SVG or WebP. Max 5MB.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Colour Pickers */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="primary-color">Primary Colour</Label>
            <p className="text-xs text-muted-foreground">
              Used for headers, buttons, and links. Paste a hex code from Canva or use the picker.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isValidHex(primaryColor) ? primaryColor : DEFAULT_PRIMARY}
                onChange={(e) => setPrimaryColor(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                id="primary-color"
                value={primaryColor}
                onChange={(e) => setPrimaryColor(e.target.value)}
                placeholder="#2563eb"
                className="font-mono"
              />
            </div>
            {primaryColor && !isValidHex(primaryColor) && primaryColor !== DEFAULT_PRIMARY && (
              <p className="text-xs text-destructive">Enter a valid hex colour (e.g. #2563eb)</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="secondary-color">Secondary Colour</Label>
            <p className="text-xs text-muted-foreground">
              Used for accents and highlights. Leave blank to auto-generate.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={isValidHex(secondaryColor) ? secondaryColor : resolved.secondary}
                onChange={(e) => setSecondaryColor(e.target.value)}
                className="h-10 w-10 rounded border cursor-pointer"
              />
              <Input
                id="secondary-color"
                value={secondaryColor}
                onChange={(e) => setSecondaryColor(e.target.value)}
                placeholder="Auto-generated"
                className="font-mono"
              />
              <Button variant="outline" size="sm" onClick={handleAutoSecondary} title="Generate from primary">
                <Wand2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Live Preview */}
        <div className="space-y-2">
          <Label>Preview</Label>
          <div className="border rounded-lg overflow-hidden">
            <div
              className="px-6 py-4 flex items-center gap-3"
              style={{ backgroundColor: resolved.primary }}
            >
              {logoUrl && (
                <img src={logoUrl} alt="" className="h-8 w-auto max-w-[120px] object-contain" />
              )}
              <span
                className="font-semibold text-sm"
                style={{ color: getContrastColor(resolved.primary) }}
              >
                {organization.name}
              </span>
            </div>
            <div className="px-6 py-3 bg-background text-sm">
              <p>
                Sample link:{' '}
                <span className="font-medium" style={{ color: resolved.primary }}>
                  Read the full release
                </span>
              </p>
              <div
                className="mt-2 px-3 py-2 rounded text-xs"
                style={{ backgroundColor: resolved.primaryLight, borderLeft: `3px solid ${resolved.primary}` }}
              >
                Callout box example — used in emails and public pages
              </div>
            </div>
            <div className="px-6 py-2 border-t text-xs text-muted-foreground text-center">
              {attribution === 'full' && <>Powered by PressPilot</>}
              {attribution === 'subtle' && (
                <span className="text-[10px] opacity-60">Powered by PressPilot</span>
              )}
              {attribution === 'none' && <>{organization.name}</>}
            </div>
          </div>
        </div>

        {/* Tier info */}
        {attribution === 'full' && (
          <div className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
            <Palette className="inline h-4 w-4 mr-1 -mt-0.5" />
            Your plan includes &ldquo;Powered by PressPilot&rdquo; branding on public pages and emails.
            Upgrade to Professional for subtle branding, or Organisation for full whitelabel.
          </div>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={handleSave} disabled={isSaving}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Branding
        </Button>
      </CardFooter>
    </Card>
  );
}
