import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AuthGate, AuthProvider } from "@/components/AuthProvider";
import { Nav } from "@/components/Nav";
import { NavTrail } from "@/components/NavTrail";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: { default: "Garimppu", template: "%s · Garimppu" },
  description: "Ache as ofertas e os criativos que estão escalando na Biblioteca de Anúncios da Meta",
};

export const viewport: Viewport = { viewportFit: "cover" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <a href="#conteudo"
          className="btn btn-primary fixed top-2 left-2 z-50 -translate-y-[200%] transition-transform focus:translate-y-0">
          Pular para o conteúdo
        </a>
        <AuthProvider>
          <Suspense fallback={<div className="h-14 border-b border-line" />}>
            <Nav />
          </Suspense>
          <Suspense fallback={null}>
            <NavTrail />
          </Suspense>
          <main id="conteudo" tabIndex={-1} className="mx-auto outline-none flex w-full max-w-[1600px] flex-1 flex-col px-4 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-6 md:py-6">
            <Suspense fallback={null}>
              <AuthGate>{children}</AuthGate>
            </Suspense>
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
