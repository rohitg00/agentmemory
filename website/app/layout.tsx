import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jetbrains = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://agentmemory.dev"),
  title: "agentmemory: persistent memory for AI coding agents",
  description:
    "Persistent memory for AI coding agents. Capture every session, recall it in the next one. Runs locally with zero external databases. Works with every MCP client.",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: "/icon.svg",
  },
  openGraph: {
    title: "agentmemory",
    description:
      "Persistent memory for AI coding agents. Runs locally. Zero external databases.",
    type: "website",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "agentmemory",
    description:
      "Persistent memory for AI coding agents. Runs locally. Zero external databases.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${inter.variable} ${jetbrains.variable}`}>
      <body>{children}</body>
    </html>
  );
}
