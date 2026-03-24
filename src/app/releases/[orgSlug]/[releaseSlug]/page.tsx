'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, limit } from 'firebase/firestore';
import { Book, Calendar, ArrowLeft } from 'lucide-react';
import { resolveOrgColors, getAttribution } from '@/lib/brand-utils';

const firebaseConfig = {
  apiKey: "AIzaSyCEQji1lRBsREmY7Vt5l8_XDyTY0Pp_Oqc",
  authDomain: "dmo-press-release.firebaseapp.com",
  projectId: "dmo-press-release",
  storageBucket: "dmo-press-release.firebasestorage.app",
  messagingSenderId: "959287689887",
  appId: "1:959287689887:web:4af709961507f1790ad8aa",
};

function getClientFirestore() {
  const app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  return getFirestore(app);
}

type OrgData = {
  id: string; name: string; slug: string; boilerplate?: string;
  branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string };
  tier?: string;
};
type ReleaseData = {
  id: string; headline: string; slug: string; bodyCopy?: string;
  status: string; imageUrl?: string; targetMarket?: string;
  audience?: string; createdAt?: any;
};

function formatDate(ts: any): string {
  if (!ts) return '';
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function PublicReleasePage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const releaseSlug = params.releaseSlug as string;
  const [org, setOrg] = useState<OrgData | null>(null);
  const [release, setRelease] = useState<ReleaseData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const db = getClientFirestore();

        const orgSnap = await getDocs(
          query(collection(db, 'orgs'), where('slug', '==', orgSlug), limit(1))
        );
        if (orgSnap.empty) { setNotFound(true); return; }

        const orgDoc = orgSnap.docs[0];
        const orgData = orgDoc.data();
        const orgObj: OrgData = {
          id: orgDoc.id,
          name: orgData.name ?? '',
          slug: orgData.slug ?? orgSlug,
          boilerplate: orgData.boilerplate ?? '',
          branding: orgData.branding ?? undefined,
          tier: orgData.tier ?? undefined,
        };
        setOrg(orgObj);

        const releaseSnap = await getDocs(
          query(
            collection(db, 'orgs', orgObj.id, 'releases'),
            where('slug', '==', releaseSlug),
            limit(1)
          )
        );
        if (releaseSnap.empty) { setNotFound(true); return; }

        const relDoc = releaseSnap.docs[0];
        const relData = relDoc.data();
        const rel: ReleaseData = {
          id: relDoc.id,
          headline: relData.headline ?? '',
          slug: relData.slug ?? '',
          bodyCopy: relData.bodyCopy ?? '',
          status: relData.status ?? '',
          imageUrl: relData.imageUrl ?? undefined,
          targetMarket: relData.targetMarket ?? undefined,
          audience: relData.audience ?? undefined,
          createdAt: relData.createdAt ?? null,
        };

        if (rel.status !== 'Ready' && rel.status !== 'Sent') {
          setNotFound(true);
          return;
        }

        setRelease(rel);
      } catch (e) {
        console.error('[public-release] Error:', e);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, [orgSlug, releaseSlug]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400">
        Loading...
      </div>
    );
  }

  if (notFound || !org || !release) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Release Not Found</h1>
          <p className="text-gray-500">This press release doesn't exist or hasn't been published.</p>
        </div>
      </div>
    );
  }

  const paragraphs = (release.bodyCopy ?? '')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const colors = resolveOrgColors(org.branding);
  const attribution = getAttribution(org.tier);

  return (
    <div className="min-h-screen bg-white text-gray-900">
      <header className="border-b">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            {org.branding?.logoUrl ? (
              <img src={org.branding.logoUrl} alt={org.name} className="h-8 w-auto" />
            ) : (
              <Book className="h-5 w-5" style={{ color: colors.primary }} />
            )}
            <span className="font-bold" style={{ color: colors.primary }}>{org.name}</span>
          </div>
          <Link
            href={`/newsroom/${orgSlug}`}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Newsroom
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-12">
        <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-gray-500">
          <span className="inline-flex items-center gap-1.5">
            <Calendar className="h-4 w-4" />
            {formatDate(release.createdAt)}
          </span>
          {release.targetMarket && (
            <span className="rounded-full border px-2.5 py-0.5 text-xs">{release.targetMarket}</span>
          )}
          {release.audience && (
            <span className="rounded-full border px-2.5 py-0.5 text-xs">{release.audience}</span>
          )}
        </div>

        <h1 className="text-3xl font-bold leading-tight sm:text-4xl lg:text-5xl mb-8">
          {release.headline}
        </h1>

        {release.imageUrl && (
          <div className="mb-10 overflow-hidden rounded-xl border">
            <img src={release.imageUrl} alt={release.headline} className="w-full max-h-[480px] object-cover" />
          </div>
        )}

        <div className="prose prose-neutral max-w-none">
          {paragraphs.map((para, i) => (
            <p key={i} className="mb-5 text-base leading-relaxed">{para}</p>
          ))}
        </div>

        {org.boilerplate && (
          <div className="mt-12 border-t pt-8">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-400">
              About {org.name}
            </h2>
            <p className="text-sm text-gray-500 leading-relaxed">{org.boilerplate}</p>
          </div>
        )}

        <div className="mt-10 rounded-xl border bg-gray-50 px-6 py-5">
          <p className="text-sm font-medium">Media enquiries</p>
          <p className="mt-1 text-sm text-gray-500">
            For interviews, images, or further information, please{' '}
            <Link href={`/media/${orgSlug}`} className="underline underline-offset-4 hover:no-underline" style={{ color: colors.primary }}>
              submit a story request
            </Link>.
          </p>
        </div>
      </main>

      <footer className="border-t py-8 mt-12">
        <div className="mx-auto max-w-4xl px-6 text-center text-xs text-gray-400">
          {attribution === 'full' && (
            <><span className="font-bold" style={{ color: colors.primary }}>PressPilot</span> · Press release management for {org.name}</>
          )}
          {attribution === 'subtle' && (
            <>{org.name} · <span className="text-[10px] opacity-60">Powered by PressPilot</span></>
          )}
          {attribution === 'none' && (
            <>{org.name}</>
          )}
        </div>
      </footer>
    </div>
  );
}
