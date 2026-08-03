import type { Metadata } from "next";
import "./globals.css";
import { StoreProvider } from "@/lib/store";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "AgentMesh + InferRoute — Control Panel",
  description: "Durable AI agent execution platform paired with a smart LLM gateway",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-row">
        <StoreProvider>
          <Sidebar />
          <main
            className="flex-1 overflow-y-auto"
            style={{
              padding: '32px 40px',
              position: 'relative',
              zIndex: 1,
            }}
          >
            {children}
          </main>
        </StoreProvider>
      </body>
    </html>
  );
}
