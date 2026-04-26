import type { Metadata } from "next";
import "./globals.css";
import Nav from "@/components/Nav";

export const metadata: Metadata = {
  title: "Aupa",
  description: "Gestion rentabilité restaurant",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="bg-gray-50 min-h-screen">
        <Nav />
        <main className="p-3 sm:p-6">{children}</main>
      </body>
    </html>
  );
}