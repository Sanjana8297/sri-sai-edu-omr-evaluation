import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { QueryProvider } from "@/providers/QueryProvider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://srisaiyanam.com"),
  title: {
    default: "Sri Sai Educational Institutions",
    template: "%s | Sri Sai Educational Institutions",
  },
  description:
    "Sri Sai Educational Institutions, Yanam — student login, exams, and performance tracking.",
  applicationName: "Sri Sai Educational Institutions",
  openGraph: {
    title: "Sri Sai Educational Institutions",
    description:
      "Sri Sai Educational Institutions, Yanam — student login, exams, and performance tracking.",
    siteName: "Sri Sai Educational Institutions",
    type: "website",
    url: "https://srisaiyanam.com",
  },
  twitter: {
    card: "summary",
    title: "Sri Sai Educational Institutions",
    description:
      "Sri Sai Educational Institutions, Yanam — student login, exams, and performance tracking.",
  },
  icons: {
    icon: [
      { url: "/favicon.ico?v=3", sizes: "any" },
      { url: "/favicon-96x96.png?v=3", sizes: "96x96", type: "image/png" },
      { url: "/web-app-manifest-192x192.png?v=3", sizes: "192x192", type: "image/png" },
      { url: "/web-app-manifest-512x512.png?v=3", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png?v=3", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function () {
  try {
    var choice = localStorage.getItem("theme-choice") || "system";
    var prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    var effective = choice === "system" ? (prefersDark ? "dark" : "light") : choice;
    document.documentElement.setAttribute("data-theme", effective);
  } catch (e) {}
})();`,
          }}
        />
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
