import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Company Lens | Company intelligence",
  description: "Explore company news across regional and global sources with cited analysis.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
