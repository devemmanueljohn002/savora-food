import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { absoluteUrl, siteUrl } from "@/lib/site-url";

const SITE_NAME = "Savora Food";
const DEFAULT_DESCRIPTION =
  "Savora Food delivers hot, freshly cooked meals from trusted local kitchens. Your Food. Your Choice. Delivered.";
const DEFAULT_OG_IMAGE = absoluteUrl("/savora-logo-wide.png");

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${SITE_NAME} | Your Food. Your Choice. Delivered.`,
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  icons: {
    icon: "/favicon.png",
  },
  themeColor: "#ff6500",
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: `${SITE_NAME} | Your Food. Your Choice. Delivered.`,
    description: DEFAULT_DESCRIPTION,
    images: [{ url: DEFAULT_OG_IMAGE, width: 1200, height: 630, alt: SITE_NAME }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} | Your Food. Your Choice. Delivered.`,
    description: DEFAULT_DESCRIPTION,
    images: [DEFAULT_OG_IMAGE],
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
