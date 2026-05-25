import Link from 'next/link';
import { ChevronRight, Home } from 'lucide-react';

export interface Crumb {
  label: string;
  href?: string;
}

export default function Breadcrumb({ items }: { items: Crumb[] }) {
  return (
    <nav className="flex items-center gap-1.5 text-sm text-gray-500 flex-wrap" aria-label="面包屑导航">
      <Link href="/" className="hover:text-gray-700 transition-colors">
        <Home size={14} />
      </Link>
      {items.map((item, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight size={12} className="text-gray-300 shrink-0" />
          {item.href ? (
            <Link href={item.href} className="hover:text-gray-700 transition-colors truncate max-w-[200px]">
              {item.label}
            </Link>
          ) : (
            <span className="text-gray-900 font-medium truncate max-w-[250px]">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}
