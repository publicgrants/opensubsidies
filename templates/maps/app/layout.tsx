import type { Metadata } from "next";
import { Outfit, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import "./globals.css";

const outfitSans = Outfit({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Grant.com — Global Grant Intelligence",
  description:
    "The category-defining map of public grants worldwide. Discover, filter and watch every open grant scheme — for SMEs, startups, researchers and corporates — across the EU, US, Nordics, APAC and multilateral funders. Powered by Virkely's real-time ingestion infrastructure and the Grant Matching & Grant Writing AI connectors.",
  applicationName: "Grant.com",
  keywords: [
    "grants",
    "public funding",
    "EU grants",
    "Horizon Europe",
    "EIC Accelerator",
    "SBIR",
    "NIH grants",
    "Innovation Norway",
    "Bpifrance",
    "Grant Matching",
    "Grant Writing",
    "AI connector",
  ],
  authors: [{ name: "Grant.com" }],
  openGraph: {
    title: "Grant.com — Global Grant Intelligence",
    description:
      "The interactive map of every public grant in the world. From Horizon Europe to SBIR to Innovation Norway — one canonical, AI-native catalogue.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${outfitSans.variable} ${geistMono.variable} antialiased font-sans`}
      >
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
