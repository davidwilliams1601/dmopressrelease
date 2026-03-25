'use client';
export const dynamic = 'force-dynamic';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { initializeApp, getApps } from 'firebase/app';
import { getFirestore, collection, query, where, orderBy, getDocs, limit } from 'firebase/firestore';
import { Book, Calendar, Mail, Newspaper } from 'lucide-react';
import { useParams } from 'next/navigation';
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
  id: string;
  name: string;
  slug: string;
  boilerplate?: string;
  pressContact?: { name: string; email: string };
  branding?: { logoUrl?: string; primaryColor?: string; secondaryColor?: string };
  tier?: string;
};

type ReleaseData = {
  id: string;
  headline: string;
  slug: string;
  bodyCopy?: string;
  imageUrl?: string;
  createdAt?: any;
};

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

export default function NewsroomPage() {
  const params = useParams();
  const orgSlug = params.orgSlug as string;
  const [org, setOrg] = useState<OrgData | null>(null);
  const [releases, setReleases] = useState<ReleaseData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const db = getClientFirestore();

        // Look up org by slug
        const orgSnap = await getDocs(
          query(collection(db, 'orgs'), where('slug', '==', orgSlug), limit(1))
        );

        let orgDoc: any = null;
        if (!orgSnap.empty) {
          orgDoc = orgSnap.docs[0];
        }

        if (!orgDoc) {
          setNotFound(true);
          setIsLoading(false);
          return;
        }

        const orgData = orgDoc.data();
        setOrg({
          id: orgDoc.id,
          name: orgData.name ?? '',
          slug: orgData.slug ?? orgSlug,
          boilerplate: orgData.boilerplate ?? '',
          pressContact: orgData.pressContact ?? undefined,
          branding: orgData.branding ?? undefined,
          tier: orgData.tier ?? undefined,
        });

        // Fetch sent releases
        const releasesSnap = await getDocs(
          query(
            collection(db, 'orgs', orgDoc.id, 'releases'),
            where('status', '==', 'Sent'),
            orderBy('createdAt', 'desc')
          )
        );

        setReleases(
          releasesSnap.docs.map((doc) => {
            const d = doc.data();
            return {
              id: doc.id,
              headline: d.headline ?? '',
              slug: d.slug ?? '',
              bodyCopy: d.bodyCopy ?? '',
              imageUrl: d.imageUrl ?? undefined,
              createdAt: d.createdAt ?? null,
            };
          })
        );
      } catch (e) {
        console.error('[newsroom] Error loading data:', e);
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, [orgSlug]);

  if (isLoading) {
    return (
      <main className="min-h-screen bg-white">
        <div className="max-w-5xl mx-auto px-6 py-20 text-center text-gray-400">
          Loading newsroom...
        </div>
      </main>
    );
  }

  if (notFound || !org) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Newsroom Not Found</h1>
          <p className="text-gray-500">The organisation you're looking for doesn't exist.</p>
        </div>
      </main>
    );
  }

  const colors = resolveOrgColors(org.branding);
  const attribution = getAttribution(org.tier);

  return (
    <main
      className="min-h-screen bg-white"
      style={{ '--brand-primary': colors.primary, '--brand-primary-light': colors.primaryLight } as React.CSSProperties}
    >
      {/* Header */}
      <header className="border-b bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 py-10">
          {org.branding?.logoUrl ? (
            <div className="mb-3">
              <img src={org.branding.logoUrl} alt={org.name} className="h-10 w-auto" />
            </div>
          ) : attribution === 'full' ? (
            <div className="flex items-center gap-2 mb-3" style={{ color: colors.primary }}>
              <Book className="h-5 w-5" />
              <span className="text-sm font-semibold tracking-wide uppercase">PressPilot</span>
            </div>
          ) : null}
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900">{org.name}</h1>
          <p className="text-lg text-gray-500 mt-1">Newsroom</p>
          {org.boilerplate && (
            <p className="mt-4 text-gray-600 max-w-2xl leading-relaxed">{org.boilerplate}</p>
          )}
        </div>
      </header>

      {/* Releases */}
      <section className="max-w-5xl mx-auto px-6 py-12">
        {releases.length === 0 ? (
          <div className="text-center py-16">
            <Newspaper className="h-12 w-12 text-gray-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">No press releases published yet</h2>
            <p className="text-gray-500">Check back soon for the latest news.</p>
          </div>
        ) : (
          <>
            <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-6">
              {releases.length} Press Release{releases.length !== 1 ? 's' : ''}
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {releases.map((release) => (
                <Link
                  key={release.id}
                  href={`/releases/${org.slug}/${release.slug}`}
                  className="group block rounded-lg border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {release.imageUrl ? (
                    <div className="aspect-video bg-gray-100 overflow-hidden">
                      <img
                        src={release.imageUrl}
                        alt={release.headline}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                  ) : (
                    <div className="aspect-video bg-gray-50 flex items-center justify-center">
                      <Newspaper className="h-10 w-10 text-gray-300" />
                    </div>
                  )}
                  <div className="p-4">
                    <h3 className="font-semibold text-gray-900 transition-colors line-clamp-2" style={{ '--tw-hover-color': colors.primary } as React.CSSProperties}>
                      {release.headline}
                    </h3>
                    {release.bodyCopy && (
                      <p className="mt-2 text-sm text-gray-500 line-clamp-3">
                        {getSummary(release.bodyCopy)}
                      </p>
                    )}
                    {release.createdAt && (
                      <div className="mt-3 flex items-center gap-1.5 text-xs text-gray-400">
                        <Calendar className="h-3.5 w-3.5" />
                        {formatDate(release.createdAt)}
                      </div>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Footer */}
      <footer className="border-t bg-gray-50">
        <div className="max-w-5xl mx-auto px-6 py-8">
          <div className="flex flex-col sm:flex-row justify-between gap-4 items-start">
            {org.pressContact?.name && (
              <div>
                <p className="text-sm font-medium text-gray-900">Press Contact</p>
                <p className="text-sm text-gray-500">{org.pressContact.name}</p>
                {org.pressContact.email && (
                  <a href={`mailto:${org.pressContact.email}`} className="text-sm hover:underline flex items-center gap-1 mt-1" style={{ color: colors.primary }}>
                    <Mail className="h-3.5 w-3.5" />
                    {org.pressContact.email}
                  </a>
                )}
              </div>
            )}
            <div className="text-right">
              <Link href={`/media/${org.slug}`} className="text-sm hover:underline" style={{ color: colors.primary }}>
                Submit a media enquiry →
              </Link>
              {attribution === 'full' && (
                <p className="text-xs text-gray-400 mt-2">Powered by PressPilot</p>
              )}
              {attribution === 'subtle' && (
                <p className="text-[10px] text-gray-300 mt-2">Powered by PressPilot</p>
              )}
            </div>
          </div>
          <div className="mt-6 pt-4 border-t border-gray-200 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400">
            <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
            <Link href="/legal/terms" className="hover:underline">Terms</Link>
            <Link href="/legal/acceptable-use" className="hover:underline">Acceptable Use</Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
