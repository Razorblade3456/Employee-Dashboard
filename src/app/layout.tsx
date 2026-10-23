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
    <html lang="en" suppressHydrationWarning>
      <body>
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{var p=localStorage.getItem('gather-theme-preference'),old=localStorage.getItem('gather-theme');if(!p)p=old==='dark'?'night':old==='light'?'day':'system';document.documentElement.classList.toggle('dark',p==='night'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches));}catch(e){}",
          }}
        />
        {children}
      </body>
    </html>
  );
}
