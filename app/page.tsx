import { redirect } from 'next/navigation';
import { headers } from 'next/headers';

export default async function Home() {
  const ua = (await headers()).get('user-agent') || '';
  const isMobile = /Mobi|Android|iPhone/i.test(ua);
  redirect(isMobile ? '/comparatif-fournisseurs' : '/menus');
}
