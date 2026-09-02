import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Header } from "@/components/layout/Header";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Mawsool API Documentation",
  description: "Modern API documentation for Mawsool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-background antialiased`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <div className="relative flex min-h-screen flex-col">
            <Header />
            <main className="flex-1">{children}</main>
            <footer className="w-full border-t py-4">
              <div className="container w-full flex flex-col md:flex-row items-start gap-5 mt-auto">
                <p className="text-xs font-semibold text-[#222222]">
                  Copyright © 2026 Mawsool
                </p>
                <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
                  <a href="https://mawsool.tech/privacy-policy" target="_blank" className="text-xs text-[#434343]">Privacy Policy</a>
                  <a href="https://mawsool.tech/terms-of-service/" target="_blank" className="text-xs text-[#434343]">Term and conditions</a>
                  <a href="https://www.linkedin.com/company/mawsool-%D9%85%D9%88%D8%B5%D9%88%D9%84/" target="_blank" className="text-xs text-[#434343] flex items-center gap-0.5">
                    <img
                      src="/icons/LinkedinLogo.svg"
                      className="select-none"
                      draggable={false}
                      alt="Linkedin"
                    />
                    Linkedin
                  </a>
                </div>
              </div>
            </footer>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
