import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Gather — A better workday",
  description:
    "A considered workspace for people, schedules, and payroll estimates.",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
