import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { AuthGate, AuthProvider } from "@/components/AuthProvider";
import { Nav } from "@/components/Nav";
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
  title: "Garimppu",
  description: "Ache as ofertas e os criativos que estão escalando na Biblioteca de Anúncios da Meta",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">
        <AuthProvider>
          <Suspense fallback={<div className="h-14 border-b border-line" />}>
            <Nav />
          </Suspense>
          <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-6 sm:px-6">
            <Suspense fallback={null}>
              <AuthGate>{children}</AuthGate>
            </Suspense>
          </main>
        </AuthProvider>
      </body>
    </html>
  );
}
