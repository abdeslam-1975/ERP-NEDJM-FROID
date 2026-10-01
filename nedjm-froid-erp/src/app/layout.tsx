import type { Metadata } from "next";
import {
  Cairo,
  IBM_Plex_Sans,
  IBM_Plex_Sans_Arabic,
  Inter,
  Libre_Franklin,
  Noto_Kufi_Arabic,
  Source_Sans_3,
  Tajawal,
} from "next/font/google";
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

/* Fonts offered in Paramètres › Interface: declared here, downloaded by the browser only once chosen. */
const cairo = Cairo({ variable: "--font-cairo", subsets: ["arabic"], preload: false });
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], preload: false });
const ibmPlex = IBM_Plex_Sans({
  variable: "--font-ibm-plex",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  preload: false,
});
const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
  preload: false,
});
const ibmPlexArabic = IBM_Plex_Sans_Arabic({
  variable: "--font-ibm-plex-arabic",
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  preload: false,
});
const notoKufi = Noto_Kufi_Arabic({ variable: "--font-noto-kufi", subsets: ["arabic"], preload: false });

const fontVariables = [sourceSans, libreFranklin, cairo, inter, ibmPlex, tajawal, ibmPlexArabic, notoKufi]
  .map((font) => font.variable)
  .join(" ");

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
    <html lang="fr" suppressHydrationWarning className={`${fontVariables} h-full`}>
      <body className="min-h-full antialiased">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
