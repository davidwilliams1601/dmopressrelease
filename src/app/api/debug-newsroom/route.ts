import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug') || 'visit-kent';

  // Step 1: Check env var
  const json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!json) {
    return NextResponse.json({ error: true, message: 'FIREBASE_SERVICE_ACCOUNT_JSON not set' });
  }

  // Step 2: Try parsing
  let serviceAccount: any;
  try {
    const cleaned = json.trim().replace(/^["']|["']$/g, '');
    serviceAccount = JSON.parse(cleaned);
  } catch (e: any) {
    return NextResponse.json({
      error: true,
      step: 'json-parse',
      message: e.message,
      jsonStart: json.substring(0, 50),
      jsonEnd: json.substring(json.length - 50),
    });
  }

  // Step 3: Check fields
  if (!serviceAccount.project_id) {
    return NextResponse.json({
      error: true,
      step: 'missing-project-id',
      keys: Object.keys(serviceAccount),
    });
  }

  // Step 4: Try Firestore
  try {
    const { getAdminFirestore } = await import('@/lib/firebase-admin');
    const db = getAdminFirestore();

    const orgSnap = await db
      .collection('orgs')
      .where('slug', '==', slug)
      .limit(1)
      .get();

    if (!orgSnap.empty) {
      const doc = orgSnap.docs[0];
      return NextResponse.json({
        found: true,
        id: doc.id,
        name: doc.data().name,
        slug: doc.data().slug,
        projectId: serviceAccount.project_id,
      });
    }

    const allOrgs = await db.collection('orgs').get();
    return NextResponse.json({
      found: false,
      searchedSlug: slug,
      allOrgs: allOrgs.docs.map(d => ({ id: d.id, slug: d.data().slug })),
    });
  } catch (e: any) {
    return NextResponse.json({
      error: true,
      step: 'firestore',
      message: e.message,
      code: e.code,
      projectId: serviceAccount.project_id,
      clientEmail: serviceAccount.client_email,
    }, { status: 500 });
  }
}
