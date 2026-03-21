import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { Book, Calendar, Mail } from 'lucide-react';

export const dynamic = 'force-dynamic';

type Props = {
  params: Promise<{ orgSlug: string }>;
};

type OrgData = {
  id: string;
  name: string;
  slug: string;
  boilerplate?: string;
  pressContact?: { name: string; email: string };
};

type ReleaseData = {
  id: string;
  headline: string;
  slug: string;
  bodyCopy?: string;
  imageUrl?: string;
  createdAt?: any;
};

async function getNewsroomData(orgSlug: string) {
  try {
    const db = getAdminFirestore();

    let orgDoc: FirebaseFirestore.DocumentSnapshot | null = null;
    const orgSnap = await db
      .collection('orgs')
      .where('slug', '==', orgSlug)
      .limit(1)
      .get();

    if (!orgSnap.empty) {
      orgDoc = orgSnap.docs[0];
    } else {
      const directDoc = await db.collection('orgs').doc(orgSlug).get();
      if (directDoc.exists) orgDoc = directDoc;
    }

    if (!orgDoc) return null;

    const orgData = orgDoc.data()!;
    const org: OrgData = {
      id: orgDoc.id,
      name: orgData.name ?? '',
      slug: orgData.slug ?? orgSlug,
      boilerplate: orgData.boilerplate ?? '',
      pressContact: orgData.pressContact ?? undefined,
    };

    const releasesSnap = await db
      .collection('orgs')
      .doc(org.id)
      .collection('releases')
      .where('status', '==', 'Sent')
      .orderBy('createdAt', 'desc')
      .get();

    const releases: ReleaseData[] = releasesSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        headline: d.headline ?? '',
        slug: d.slug ?? '',
        bodyCopy: d.bodyCopy ?? '',
        imageUrl: d.imageUrl ?? undefined,
        createdAt: d.createdAt ?? null,
      };
    });

    return { org, releases };
  } catch (e) {
    console.error('[newsroom] Error fetching data:', e);
    return null;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { orgSlug } = await params;
  const data = await getNewsroomData(orgSlug);

  if (!data) return { title: 'Newsroom Not Found' };

  const title = `${data.org.name} — Newsroom`;
  const description = data.org.boilerplate
    ? data.org.boilerplate.slice(0, 160)
    : `Latest press releases from ${data.org.name}.`;

  return {
    title,
    description,
    openGraph: { type: 'website', title, description },
    twitter: { card: 'summary', title, description },
  };
}

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '');
}

function getSummary(bodyCopy: string, maxLength = 200): string {
  const plain = stripHtml(bodyCopy).replace(/\n+/g, ' ').trim();
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength).replace(/\s+\S*$/, '') + '...';
}

export default async function NewsroomPage({ params }: Props) {
  const { orgSlug } = await params;
  const data = await getNewsroomData(orgSlug);

  if (!data) notFound();

  const { org, releases } = data;

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            <Book className="h-5 w-5 text-primary" />
            <span className="font-headline font-bold text-primary">{org.name}</span>
          </div>
          <Link
            href={`/media/${orgSlug}`}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Media enquiries
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        {/* Page title */}
        <div className="mb-10">
          <h1 className="font-headline text-3xl font-bold tracking-tight sm:text-4xl">
            Newsroom
          </h1>
          <p className="mt-2 text-muted-foreground">
            Latest press releases from {org.name}
          </p>
        </div>

        {/* Boilerplate */}
        {org.boilerplate && (
          <div className="mb-10 rounded-xl border bg-muted/40 px-6 py-5">
            <p className="text-sm leading-relaxed text-muted-foreground">{org.boilerplate}</p>
          </div>
        )}

        {/* Releases grid */}
        {releases.length === 0 ? (
          <div className="rounded-xl border border-dashed px-6 py-16 text-center">
            <p className="text-muted-foreground">No press releases published yet.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {releases.map((release) => (
              <Link
                key={release.id}
                href={`/releases/${orgSlug}/${release.slug}`}
                className="group flex flex-col overflow-hidden rounded-xl border bg-card transition-shadow hover:shadow-md"
              >
                {/* Thumbnail */}
                {release.imageUrl ? (
                  <div className="aspect-[16/9] overflow-hidden bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={release.imageUrl}
                      alt={release.headline}
                      className="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                  </div>
                ) : (
                  <div className="aspect-[16/9] flex items-center justify-center bg-muted">
                    <Book className="h-10 w-10 text-muted-foreground/40" />
                  </div>
                )}

                {/* Content */}
                <div className="flex flex-1 flex-col p-4">
                  <h2 className="font-headline text-base font-semibold leading-snug group-hover:text-primary transition-colors line-clamp-2">
                    {release.headline}
                  </h2>
                  {release.bodyCopy && (
                    <p className="mt-2 text-sm text-muted-foreground line-clamp-3">
                      {getSummary(release.bodyCopy)}
                    </p>
                  )}
                  <div className="mt-auto pt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Calendar className="h-3.5 w-3.5" />
                    {formatDate(release.createdAt)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Press contact */}
        {org.pressContact && (org.pressContact.name || org.pressContact.email) && (
          <div className="mt-12 border-t pt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Press Contact
            </h2>
            <div className="flex items-center gap-3">
              <Mail className="h-4 w-4 text-muted-foreground" />
              <div className="text-sm">
                {org.pressContact.name && (
                  <span className="font-medium">{org.pressContact.name}</span>
                )}
                {org.pressContact.name && org.pressContact.email && <span> — </span>}
                {org.pressContact.email && (
                  <a
                    href={`mailto:${org.pressContact.email}`}
                    className="text-primary underline underline-offset-4 hover:no-underline"
                  >
                    {org.pressContact.email}
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Media enquiry CTA */}
        <div className="mt-10 rounded-xl border bg-muted/40 px-6 py-5">
          <p className="text-sm font-medium">Looking for something specific?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            For interviews, images, or further information, please{' '}
            <Link
              href={`/media/${orgSlug}`}
              className="text-primary underline underline-offset-4 hover:no-underline"
            >
              submit a media enquiry
            </Link>
            .
          </p>
        </div>
      </main>

      <footer className="border-t bg-muted/30 py-8 mt-12">
        <div className="mx-auto max-w-5xl px-6 text-center text-xs text-muted-foreground">
          <span className="font-headline font-semibold text-primary">PressPilot</span>
          {' · '}
          Press release management for {org.name}
        </div>
      </footer>
    </div>
  );
}
