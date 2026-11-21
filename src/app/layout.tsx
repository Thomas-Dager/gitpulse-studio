import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GitPulse Studio — Publicador Automático a GitHub",
  description:
    "Escanea tus aplicaciones locales, blinda secretos, genera commits semánticos y publica o actualiza repositorios públicos en GitHub automáticamente.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" className="dark">
      <body className="min-h-screen bg-[#09090b] text-zinc-100 antialiased">
        {children}
      </body>
    </html>
  );
}
