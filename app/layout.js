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

            {/*header*/}
            <Header user={user} />
            <CreditSync user={user} />
            <main className="min-h-screen">
              {children}
            </main>
<Toaster  richColors/>

            {/*footer*/}

            <footer className="bg-muted/12-py">
              <div className="container mx-auto px-4 text-center text-gray-200">
                <p>Made by RISHI</p>
              </div>
            </footer>


          </ThemeProvider>
        </ClerkProvider>
      </body>

    </html>
  );
}
