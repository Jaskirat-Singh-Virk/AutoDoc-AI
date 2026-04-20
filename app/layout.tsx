import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AutoDoc AI",
  description: "Generate Word documents from a topic with AI images and preview.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
