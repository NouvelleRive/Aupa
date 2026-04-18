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
    <nav className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-8">
      <Image src="/logo.png" alt="Aupa" width={60} height={30} className="object-contain" />
      {LINKS.map(({ href, label }) => (
        <Link key={href} href={href}
          className={`text-sm transition-colors ${pathname === href ? 'text-yellow-500 font-semibold' : 'text-gray-600 hover:text-yellow-400'}`}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
