'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/produits-fournisseurs', label: 'PF' },
  { href: '/ingredients', label: 'Ingrédients' },
  { href: '/recettes', label: 'Recettes' },
  { href: '/menus', label: 'Menus' },
  { href: '/performance', label: 'Perf' },
  { href: '/couts', label: 'Coûts' },
  { href: '/ecarts', label: 'Écarts' },
  { href: '/employes', label: 'Employés' },
  { href: '/comparatif-fournisseurs', label: 'Comparatif' },
];

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex items-center gap-4 sm:gap-8 overflow-x-auto whitespace-nowrap">
      <Image src="/logo.png" alt="Aupa" width={60} height={30} className="object-contain shrink-0" />
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={href}
          className={`text-sm transition-colors shrink-0 ${pathname === href ? 'text-yellow-500 font-semibold' : 'text-gray-600 hover:text-yellow-400'}`}>
          {label}
        </Link>
      ))}
      <div className="ml-auto shrink-0">
        <Link href="/mapping-caisse"
          className={`text-sm transition-colors ${pathname === '/mapping-caisse' ? 'text-yellow-500 font-semibold' : 'text-gray-400 hover:text-yellow-400'}`}>
          Mapping caisse
        </Link>
      </div>
    </nav>
  );
}
