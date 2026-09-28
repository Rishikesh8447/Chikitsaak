import { ClerkProvider } from "@clerk/nextjs";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import CreditSync from "@/components/credit-sync";
import "./globals.css";
import Header from "@/components/header"
import { checkUser } from "@/lib/checkUser";
import { Toaster } from "sonner";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Chikitsaak-Doctors Appointment App",
  description: "Connect with Doctors anytime,anywhere",
};

export default async function RootLayout({ children }) {
  const user = await checkUser();

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <ClerkProvider>
          <ThemeProvider
            attribute="class"
            defaultTheme="dark"
            enableSystem
            disableTransitionOnChange

          >

            <Header user={user} />
            <CreditSync user={user} />
            <div className="min-h-screen">
              {children}
            </div>
            <Toaster richColors />

            <footer className="border-t border-border bg-card">
              <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <p className="font-medium text-foreground">Chikitsaak <span className="font-normal text-muted-foreground">· Care, connected.</span></p>
                <p>Private, considered care for every step of your health journey.</p>
              </div>
            </footer>


          </ThemeProvider>
        </ClerkProvider>
      </body>

    </html>
  );
}
