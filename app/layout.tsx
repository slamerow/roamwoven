import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Roamwoven",
  description: "Turn your trip details into your private travel app."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
