import type { Metadata } from "next";
import { headers } from "next/headers";
import { uiThemeIds } from "@/lib/ui-themes";
import "./globals.css";

const themeBootScript = `try{var theme=localStorage.getItem("kiromail-theme");if(${JSON.stringify(uiThemeIds)}.includes(theme)){document.documentElement.dataset.theme=theme}}catch(error){}`;

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host");
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  const origin = host ? `${protocol}://${host}` : process.env.APP_URL ?? "http://localhost:3000";
  const title = "KiroMail — campañas con calma";
  const description = "Plataforma autoinstalable para gestionar suscriptores y enviar campañas de newsletter con Amazon SES.";
  return {
    metadataBase: new URL(origin),
    title,
    description,
    icons: { icon: "/kiro-cat.svg", shortcut: "/kiro-cat.svg", apple: "/kiro-cat.svg" },
    openGraph: { title, description, type: "website", images: [{ url: `${origin}/og.png`, width: 1200, height: 630, alt: "KiroMail — Campañas claras. En tu terreno." }] },
    twitter: { card: "summary_large_image", title, description, images: [`${origin}/og.png`] },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
        {children}
      </body>
    </html>
  );
}
