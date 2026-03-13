import type { Metadata } from "next";
import { Inter, Geist } from "next/font/google";
import "./globals.css";
import { installRequestProxy } from "@/lib/region-guard";
import { cn } from "@/lib/utils";
import { Toaster } from "@/components/ui/sonner";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});


// Install the eu-central-1 region guard on the server side at startup.
installRequestProxy();

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Fiscal Guard",
  description: "Tax compliance for Portugal NHR/IFICI residents",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={cn("font-sans", geist.variable)}>
      <body className={inter.className}>
        {children}
        <Toaster richColors position="top-right" />
      </body>
    </html>
  );
}
