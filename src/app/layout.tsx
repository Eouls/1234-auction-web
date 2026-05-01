import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "1234 Auction",
  description: "1234 디스코드 서버를 위한 리그오브레전드 내전 팀 경매 플랫폼",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
