import { NextRequest, NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ orgSlug: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { orgSlug } = await params;

  try {
    const db = getAdminFirestore();

    // Look up org by slug
    let orgDoc: FirebaseFirestore.DocumentSnapshot | null = null;

    const orgSnap = await db
      .collection('orgs')
      .where('slug', '==', orgSlug)
      .limit(1)
      .get();

    if (!orgSnap.empty) {
      orgDoc = orgSnap.docs[0];
    } else {
      // Fallback: try orgSlug as document ID
      const directDoc = await db.collection('orgs').doc(orgSlug).get();
      if (directDoc.exists) {
        orgDoc = directDoc;
      }
    }

    if (!orgDoc) {
      return NextResponse.json({ error: 'Organisation not found' }, { status: 404 });
    }

    const orgData = orgDoc.data()!;
    const org = {
      id: orgDoc.id,
      name: orgData.name ?? '',
      slug: orgData.slug ?? orgSlug,
      boilerplate: orgData.boilerplate ?? '',
      pressContact: orgData.pressContact ?? null,
    };

    // Fetch sent releases ordered by createdAt desc
    const releasesSnap = await db
      .collection('orgs')
      .doc(org.id)
      .collection('releases')
      .where('status', '==', 'Sent')
      .orderBy('createdAt', 'desc')
      .get();

    const releases = releasesSnap.docs.map((doc) => {
      const d = doc.data();
      return {
        id: doc.id,
        headline: d.headline ?? '',
        slug: d.slug ?? '',
        bodyCopy: d.bodyCopy ?? '',
        imageUrl: d.imageUrl ?? null,
        createdAt: d.createdAt?.toDate?.()?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ org, releases });
  } catch (e) {
    console.error('[newsroom-api] Error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
