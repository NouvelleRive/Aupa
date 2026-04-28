// Whitelist des routes accessibles au rôle "directeur".
// Pour élargir/restreindre ses accès, modifier cette liste.
const DIRECTEUR_ALLOWED_PREFIXES = [
  '/comparatif-fournisseurs',
  '/panier',
  '/ecarts',
];

function parseList(raw: string | undefined): Set<string> {
  const s = new Set<string>();
  if (!raw) return s;
  for (const v of raw.split(',')) {
    const t = v.trim().toLowerCase();
    if (t) s.add(t);
  }
  return s;
}

export function isDirecteur(username: string | undefined | null): boolean {
  if (!username) return false;
  return parseList(process.env.APP_DIRECTEUR_USERS).has(username.toLowerCase());
}

export function canAccessPath(username: string | undefined | null, pathname: string): boolean {
  if (!isDirecteur(username)) return true;
  if (pathname.startsWith('/api/')) return true;
  if (pathname === '/' || pathname === '/login') return true;
  return DIRECTEUR_ALLOWED_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));
}

export function directeurHomePath(): string {
  return '/comparatif-fournisseurs';
}

export function filterNavLinksForRole<T extends { href: string }>(links: T[], directeur: boolean): T[] {
  if (!directeur) return links;
  return links.filter(l => DIRECTEUR_ALLOWED_PREFIXES.some(p => l.href === p || l.href.startsWith(p + '/')));
}
