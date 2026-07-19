import type { Metadata } from "next";
import { Libre_Baskerville, Source_Sans_3 } from "next/font/google";
import { AuthProvider } from "@/lib/auth-context";
import "@/styles/globals.css";

const serif = Libre_Baskerville({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-serif-loaded",
  display: "swap",
});

const sans = Source_Sans_3({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans-loaded",
  display: "swap",
});

export const metadata: Metadata = {
  title: "EGI Website Monitoring",
  description: "Internal platform for monitoring EGI websites",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={`${serif.variable} ${sans.variable}`}>
      <body
        style={
          {
            ["--font-serif" as string]:
              "var(--font-serif-loaded), Libre Baskerville, Georgia, serif",
            ["--font-sans" as string]:
              "var(--font-sans-loaded), Source Sans 3, Segoe UI, sans-serif",
          } as React.CSSProperties
        }
      >
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
