import type { Metadata, Viewport } from "next";
import { Barlow_Condensed, Inter } from "next/font/google";
import { Suspense } from "react";
import { NavigationProgress } from "@/components/navigation-progress";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const barlow = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700", "800"], variable: "--font-barlow" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: { default: "SR Autorrepuestos — Repuestos para tu vehículo", template: "%s · SR Autorrepuestos" },
  description:
    "Repuestos automotrices en Paraguay: frenos, filtros, suspensión, baterías y más, con búsqueda por vehículo y compatibilidad verificada.",
  openGraph: { siteName: "SR Autorrepuestos", locale: "es_PY", type: "website" },
};

export const viewport: Viewport = {
  themeColor: "#111418",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es-PY" className={`${inter.variable} ${barlow.variable}`}>
      <body className="min-h-dvh">
        <Suspense>
          <NavigationProgress />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
