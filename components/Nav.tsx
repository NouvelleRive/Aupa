'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
  { href: '/panier', label: 'Panier' },
];

export default function Nav() {
  const pathname = usePathname();
  const [panierCount, setPanierCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    getDocs(collection(db, 'panier')).then(snap => {
      if (!cancelled) setPanierCount(snap.size);
    });
    return () => { cancelled = true; };
  }, [pathname]);

  return (
    <nav className="bg-white border-b border-gray-100 px-3 sm:px-6 py-3 flex items-center gap-4 sm:gap-8 overflow-x-auto whitespace-nowrap">
      <Image src="/logo.png" alt="Aupa" width={60} height={30} className="object-contain shrink-0" />
      {LINKS.map(({ href, label }) => {
        const showBadge = href === '/panier' && panierCount > 0;
        return (
          <Link key={href} href={href}
            className={`text-sm transition-colors shrink-0 ${pathname === href ? 'text-yellow-500 font-semibold' : 'text-gray-600 hover:text-yellow-400'}`}>
            {label}
            {showBadge && (
              <span className="ml-1 inline-flex items-center justify-center bg-yellow-400 text-white text-xs font-bold rounded-full min-w-[1.25rem] h-5 px-1">
                {panierCount}
              </span>
            )}
          </Link>
        );
      })}
      <div className="ml-auto shrink-0">
        <Link href="/mapping-caisse"
          className={`text-sm transition-colors ${pathname === '/mapping-caisse' ? 'text-yellow-500 font-semibold' : 'text-gray-400 hover:text-yellow-400'}`}>
          Mapping caisse
        </Link>
      </div>
    </nav>
  );
}
