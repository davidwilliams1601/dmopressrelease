import type { Metadata } from 'next';
import type { DocumentSnapshot } from 'firebase-admin/firestore';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { Book, Calendar, ArrowLeft } from 'lucide-react';

type Props = {
  params: Promise<{ orgSlug: string; releaseSlug: string }>;
};

type OrgData = {
  id: string;
  name: string;
  slug: string;
  boilerplate?: string;
};

type ReleaseData = {
  id: string;
  headline: string;
  slug: string;
  bodyCopy?: string;
  status: string;
  imageUrl?: string;
  targetMarket?: string;
  audience?: string;
  createdAt?: any;
};

async function getOrgAndRelease(
  orgSlug: string,
  releaseSlug: string
): Promise<{ org: OrgData; release: ReleaseData } | null> {
  try {
    const db = getAdminFirestore();

    // Try slug field first, fall back to using orgSlug as the document ID directly
    let orgDoc: DocumentSnapshot | null = null;

    const orgSnap = await db
      .collection('orgs')
      .where('slug', '==', orgSlug)
      .limit(1)
      .get();

    if (!orgSnap.empty) {
      orgDoc = orgSnap.docs[0];
    } else {
      // Fallback: try orgSlug as document ID (common when org was provisioned manually)
      const directDoc = await db.collection('orgs').doc(orgSlug).get();
      if (directDoc.exists) {
        orgDoc = directDoc;
      }
    }

    if (!orgDoc) {
      console.error(`[public-release] No org found with slug or id: ${orgSlug}`);
      return null;
    }

    const org = { id: orgDoc.id, ...orgDoc.data() } as OrgData;

    const releaseSnap = await db
      .collection('orgs')
      .doc(org.id)
      .collection('releases')
      .where('slug', '==', releaseSlug)
      .limit(1)
      .get();

    if (releaseSnap.empty) {
      console.error(`[public-release] No release found with slug: ${releaseSlug} in org: ${org.id}`);
      return null;
    }

    const releaseDoc = releaseSnap.docs[0];
    const release = { id: releaseDoc.id, ...releaseDoc.data() } as ReleaseData;

    if (release.status !== 'Ready' && release.status !== 'Sent') return null;

    return { org, release };
  } catch (e) {
    console.error('[public-release] Error fetching release:', e);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug, releaseSlug } = await params;
  const result = await getOrgAndRelease(orgSlug, releaseSlug);

  if (!result) return { title: 'Release Not Found' };

  const { org, release } = result;
  const description = (release.bodyCopy ?? '').replace(/\n+/g, ' ').slice(0, 160);

  return {
    title: `${release.headline} | ${org.name}`,
    description,
    openGraph: {
      type: 'article',
      title: release.headline,
      description,
      siteName: org.name,
      ...(release.imageUrl && {
        images: [{ url: release.imageUrl, width: 1200, height: 630, alt: release.headline }],
      }),
    },
    twitter: {
      card: release.imageUrl ? 'summary_large_image' : 'summary',
      title: release.headline,
      description,
      ...(release.imageUrl && { images: [release.imageUrl] }),
    },
  };
}

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default async function PublicReleasePage({ params }: Props) {
  const { orgSlug, releaseSlug } = await params;
  const result = await getOrgAndRelease(orgSlug, releaseSlug);

  if (!result) notFound();

  const { org, release } = result;

  const paragraphs = (release.bodyCopy ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Book className="h-5 w-5 text-primary" />
            <span className="font-headline font-bold text-primary">{org.name}</span>
          </div>
          <Link
            href={`/media/${orgSlug}`}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Media hub
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        {/* Meta */}
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {formatDate(release.createdAt)}
          </span>
          {release.targetMarket && (
            <span className="rounded-full border px-2.5 py-0.5 text-xs">
              {release.targetMarket}
            </span>
          )}
          {release.audience && (
            <span className="rounded-full border px-2.5 py-0.5 text-xs">
              {release.audience}
            </span>
          )}
        </div>

        {/* Headline */}
        <h1 className="font-headline text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl mb-8">
          {release.headline}
        </h1>

        {/* Featured image */}
        {release.imageUrl && (
          <div className="mb-10 overflow-hidden rounded-xl border">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={release.imageUrl}
              alt={release.headline}
              className="w-full max-h-[480px] object-cover"
            />
          </div>
        )}

        {/* Body copy */}
        <div className="prose prose-neutral max-w-none">
          {paragraphs.map((para, i) => (
            <p key={i} className="mb-5 text-base leading-relaxed text-foreground">
              {para}
            </p>
          ))}
        </div>

        {/* Boilerplate / About */}
        {org.boilerplate && (
          <div className="mt-12 border-t pt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              About {org.name}
            </h2>
            <p className="text-sm text-muted-foreground leading-relaxed">{org.boilerplate}</p>
          </div>
        )}

        {/* Media enquiry CTA */}
        <div className="mt-10 rounded-xl border bg-muted/40 px-6 py-5">
          <p className="text-sm font-medium">Media enquiries</p>
          <p className="mt-1 text-sm text-muted-foreground">
            For interviews, images, or further information, please{' '}
            <Link
              href={`/media/${orgSlug}`}
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              submit a story request
            </Link>
            .
          </p>
        </div>
      </main>

      <footer className="border-t bg-muted/30 py-8 mt-12">
        <div className="mx-auto max-w-4xl px-6 text-center text-xs text-muted-foreground">
          <span className="font-headline font-semibold text-primary">PressPilot</span>
          {' · '}
          Press release management for {org.name}
        </div>
      </footer>
    </div>
  );
}
