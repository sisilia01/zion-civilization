import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { ZionLoader } from "@/components/ZionLoader";

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
    <html lang="en" className="h-full antialiased" style={{ background: "#000000" }}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@300;400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-full flex flex-col" style={{ background: "#000000", margin: 0 }}>
        <ZionLoader />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
