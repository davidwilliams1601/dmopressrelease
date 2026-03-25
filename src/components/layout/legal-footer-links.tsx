import Link from 'next/link';
import { cn } from '@/lib/utils';

type LegalFooterLinksProps = {
  className?: string;
};

export default function LegalFooterLinks({ className }: LegalFooterLinksProps) {
  return (
    <div className={cn('flex flex-wrap gap-x-3 gap-y-1', className)}>
      <Link href="/legal/privacy" className="hover:underline">Privacy</Link>
      <Link href="/legal/terms" className="hover:underline">Terms</Link>
      <Link href="/legal/acceptable-use" className="hover:underline">Acceptable Use</Link>
    </div>
  );
}
