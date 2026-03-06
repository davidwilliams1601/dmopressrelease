import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const orgSlug = searchParams.get('org') || 'visit-kent';
  const releaseSlug = searchParams.get('release') || '';

  const result: Record<string, any> = {
    orgSlug,
    releaseSlug,
    envVarSet: !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
    envVarLength: process.env.FIREBASE_SERVICE_ACCOUNT_JSON?.length ?? 0,
  };

  try {
    const { getAdminFirestore } = await import('@/lib/firebase-admin');
    const db = getAdminFirestore();
    result.adminInitialized = true;

    // Try slug query
    const bySlug = await db.collection('orgs').where('slug', '==', orgSlug).limit(1).get();
    result.orgBySlugCount = bySlug.size;

    // Try direct doc ID
    const byId = await db.collection('orgs').doc(orgSlug).get();
    result.orgByIdExists = byId.exists;
    if (byId.exists) {
      const data = byId.data()!;
      result.orgData = { id: byId.id, name: data.name, slug: data.slug };

      if (releaseSlug) {
        const releaseSnap = await db
          .collection('orgs').doc(orgSlug)
          .collection('releases')
          .where('slug', '==', releaseSlug)
          .limit(1)
          .get();
        result.releaseBySlugCount = releaseSnap.size;
        if (!releaseSnap.empty) {
          const r = releaseSnap.docs[0].data();
          result.releaseData = { id: releaseSnap.docs[0].id, status: r.status, slug: r.slug };
        }

        // Also list first 5 release slugs for comparison
        const allReleases = await db
          .collection('orgs').doc(orgSlug)
          .collection('releases')
          .limit(5)
          .get();
        result.firstReleaseSlugs = allReleases.docs.map(d => ({ id: d.id, slug: d.data().slug, status: d.data().status }));
      }
    }
  } catch (e: any) {
    result.error = e.message;
    result.stack = e.stack?.split('\n').slice(0, 5);
  }

  return NextResponse.json(result);
}
