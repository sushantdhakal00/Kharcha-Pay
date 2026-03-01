import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "KharchaPay",
  description: "Track and split expenses",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("kharchapay_theme");var d=!(window.matchMedia&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(t==="dark"||(t==="system"&&!d)){document.documentElement.classList.add("dark")}else{document.documentElement.classList.remove("dark")}})();`,
          }}
        />
      </head>
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased dark:bg-[#18181B] dark:text-stone-100">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
