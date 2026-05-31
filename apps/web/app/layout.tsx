import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "SoulSync AI — AI 페르소나가 대신 데이트하는 ChatGPT 앱",
  description: "ChatGPT 안에서 AI 페르소나가 먼저 대화해보고 궁합을 확인해 매칭해주는 한국어 데이팅 앱입니다.",
  openGraph: {
    title: "SoulSync AI — AI 페르소나가 대신 데이트하는 ChatGPT 앱",
    description: "AI가 먼저 대화해보고 궁합을 확인해 매칭해드립니다."
  }
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" />
        <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.css" />
      </head>
      <body>{children}</body>
    </html>
  );
}
