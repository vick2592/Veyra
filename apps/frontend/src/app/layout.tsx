import type { Metadata } from 'next';
import { Host_Grotesk } from 'next/font/google';
import './globals.css';
import Web3Provider from './Web3Provider';

const hostGrotesk = Host_Grotesk({
  subsets: ['latin'],
  variable: '--font-host-grotesk',
});

export const metadata: Metadata = {
  title: 'Veyra Agent Execution',
  description: 'Authorize secure agent capabilities with World ID Face Auth.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={hostGrotesk.variable}>
      <body>
        <Web3Provider>{children}</Web3Provider>
      </body>
    </html>
  );
}
