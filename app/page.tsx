import Link from 'next/link';

export default function Home() {
  return (
    <div className="max-w-2xl mx-auto mt-20 text-center">
      <h1 className="text-3xl font-bold mb-2">Bienvenue sur Aupa</h1>
      <p className="text-gray-500 mb-8">Gestion de la rentabilité du restaurant</p>
      <div className="grid grid-cols-2 gap-4">
        <Link href="/ingredients" className="bg-white border border-yellow-100 rounded-xl p-6 hover:border-yellow-400 transition-colors">
          <p className="text-xl mb-1">🥕</p>
          <p className="font-semibold">Ingrédients</p>
        </Link>
        <Link href="/recettes" className="bg-white border border-yellow-100 rounded-xl p-6 hover:border-yellow-400 transition-colors">
          <p className="text-xl mb-1">📋</p>
          <p className="font-semibold">Recettes</p>
        </Link>
        <Link href="/menus" className="bg-white border border-yellow-100 rounded-xl p-6 hover:border-yellow-400 transition-colors">
          <p className="text-xl mb-1">🍽️</p>
          <p className="font-semibold">Menus</p>
        </Link>
        <Link href="/performance" className="bg-white border border-yellow-100 rounded-xl p-6 hover:border-yellow-400 transition-colors">
          <p className="text-xl mb-1">📊</p>
          <p className="font-semibold">Performance</p>
        </Link>
      </div>
    </div>
  );
}
