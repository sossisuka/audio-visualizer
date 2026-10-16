import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./hardware.css";

export const metadata: Metadata = {
  title: "Audio Visualizer",
  description:
    "An audio-reactive particle instrument. Shape sound with tactile controls, light, and motion.",
  icons: { icon: "/icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#d7d7d7",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
