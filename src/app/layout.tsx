import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noteriv",
  description: "A modern markdown editor",
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
