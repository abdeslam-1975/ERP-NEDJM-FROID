import type { Metadata } from "next";
import { Libre_Franklin, Source_Sans_3 } from "next/font/google";
import { ThemeProvider } from "@/components/layout/theme-provider";
import "./globals.css";

const sourceSans = Source_Sans_3({
  variable: "--font-source-sans",
  subsets: ["latin"],
});

const libreFranklin = Libre_Franklin({
  variable: "--font-libre-franklin",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "NEDJM FROID ERP",
  description:
    "ERP Cloud — Core, Security & System Setup · NEDJM FROID (BTPH & Maintenance)",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr" suppressHydrationWarning className="h-full">
      <body
        className={`${sourceSans.variable} ${libreFranklin.variable} min-h-full antialiased`}
      >
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
