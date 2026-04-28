import { redirect } from 'next/navigation';
import { headers, cookies } from 'next/headers';
import { isDirecteur, directeurHomePath } from '@/lib/roles';

export default async function Home() {
  const user = (await cookies()).get('aupa_user')?.value;
  if (isDirecteur(user)) redirect(directeurHomePath());

  const ua = (await headers()).get('user-agent') || '';
  const isMobile = /Mobi|Android|iPhone/i.test(ua);
  redirect(isMobile ? '/comparatif-fournisseurs' : '/menus');
}
