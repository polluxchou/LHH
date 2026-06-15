import type { Metadata } from "next";
import type { ReactNode } from "react";
import { WorkflowProvider } from "@/components/workbench/workflow-provider";
import "maplibre-gl/dist/maplibre-gl.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "林哈哈聊太空 · 情报工作台",
  description: "面向航空航天科技内容团队的内部情报筛选与选题工作台",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="zh-Hans">
      <body>
        <WorkflowProvider>{children}</WorkflowProvider>
      </body>
    </html>
  );
}
