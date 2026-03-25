import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900 hover:text-gray-600">
            PressPilot
          </Link>
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </div>
      </header>
      <main className="max-w-4xl mx-auto px-6 py-12">
        {children}
      </main>
      <footer className="border-t">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-400">
          <Link href="/legal/privacy" className="hover:underline">Privacy Policy</Link>
          <Link href="/legal/terms" className="hover:underline">Terms of Service</Link>
          <Link href="/legal/acceptable-use" className="hover:underline">Acceptable Use Policy</Link>
        </div>
      </footer>
    </div>
  );
}
