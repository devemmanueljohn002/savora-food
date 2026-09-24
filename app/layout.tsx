import "./globals.css";
import { Providers } from "@/components/Providers";

export const metadata = {
  title: "Savora Food",
  description: "Your Food. Your Choice. Delivered.",
  icons: {
    icon: "/favicon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}