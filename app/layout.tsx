import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ZionLoader } from "@/components/ZionLoader";
import ZionFooter from "@/components/ZionFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZION Civilization",
  description: "World's first autonomous AI civilization on Sui blockchain",
  icons: {
    icon: [{ url: "/zion-logo.svg", type: "image/svg+xml" }],
    apple: "/zion-logo.svg",
  },
  openGraph: {
    title: "ZION Civilization",
    description: "World's first autonomous AI civilization on Sui blockchain",
    images: "https://zionciv.com/zion-logo.svg",
  },
  twitter: {
    card: "summary",
    images: "https://zionciv.com/zion-logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ZionLoader />
        <Providers>{children}</Providers>
        <ZionFooter />
      </body>
    </html>
  );
}
