import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug') || 'visit-kent';
  
  try {
    const db = getAdminFirestore();
    
    const slugSnap = await db
      .collection('orgs')
      .where('slug', '==', slug)
      .limit(1)
      .get();
    
    if (!slugSnap.empty) {
      const doc = slugSnap.docs[0];
      const data = doc.data();
      return NextResponse.json({
        found: true,
        method: 'slug-query',
        id: doc.id,
        name: data.name,
        slug: data.slug,
      });
    }
    
    const directDoc = await db.collection('orgs').doc(slug).get();
    if (directDoc.exists) {
      const data = directDoc.data()!;
      return NextResponse.json({
        found: true,
        method: 'direct-doc',
        id: directDoc.id,
        name: data.name,
        slug: data.slug,
      });
    }
    
    const allOrgs = await db.collection('orgs').get();
    const orgList = allOrgs.docs.map(d => ({
      id: d.id,
      slug: d.data().slug,
      name: d.data().name,
    }));
    
    return NextResponse.json({
      found: false,
      searchedSlug: slug,
      allOrgs: orgList,
    });
  } catch (e: any) {
    return NextResponse.json({
      error: true,
      message: e.message,
      code: e.code,
    }, { status: 500 });
  }
}
