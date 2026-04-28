import type { Metadata } from "next";
import { cookies } from "next/headers";
import "./globals.css";
import Nav from "@/components/Nav";
import { isDirecteur } from "@/lib/roles";

export const metadata: Metadata = {
  title: "Aupa",
  description: "Gestion rentabilité restaurant",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = (await cookies()).get('aupa_user')?.value;
  const directeur = isDirecteur(user);
  return (
    <html lang="fr">
      <body className="bg-gray-50 min-h-screen">
        <Nav directeur={directeur} />
        <main className="p-3 sm:p-6">{children}</main>
      </body>
    </html>
  );
}
