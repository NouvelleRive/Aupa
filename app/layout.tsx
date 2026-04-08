import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";
import Image from "next/image";

export const metadata: Metadata = {
  title: "Aupa",
  description: "Gestion rentabilité restaurant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 min-h-screen">
        <nav className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-8">
          <Image src="/logo.png" alt="Aupa" width={60} height={30} className="object-contain" />
          <Link href="/ingredients" className="text-sm text-gray-600 hover:text-yellow-400 transition-colors">Ingrédients</Link>
          <Link href="/produits-fournisseurs" className="text-sm text-gray-600 hover:text-yellow-400 transition-colors">Produits fournisseurs</Link>
          <Link href="/recettes" className="text-sm text-gray-600 hover:text-yellow-400 transition-colors">Recettes</Link>
          <Link href="/menus" className="text-sm text-gray-600 hover:text-yellow-400 transition-colors">Menus</Link>
          <Link href="/rentabilite" className="text-sm text-gray-600 hover:text-yellow-400 transition-colors">Rentabilité</Link>
          <Link href="/performance" className="text-sm text-gray-600 hover:text-yellow-400 transition-colors">Performance</Link>
          <Link href="/ecarts" className="text-sm text-gray-600 hover:text-yellow-400 transition-colors">Écarts</Link>
          <Link href="/employes" className="text-sm text-gray-600 hover:text-yellow-400 transition-colors">Employés</Link>
        </nav>
        <main className="p-6">{children}</main>
      </body>
    </html>
  );
}