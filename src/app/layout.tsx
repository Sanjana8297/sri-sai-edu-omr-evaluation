import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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
  title: "JEE & NEET Coaching Portal",
  description: "Login, performance tracking, and question papers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
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
        {children}
      </body>
    </html>
  );
}
