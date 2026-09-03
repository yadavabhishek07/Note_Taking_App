import type { Metadata } from 'next';
import './globals.css';
import Navbar from '@/components/Navbar';

export const metadata: Metadata = {
  title: 'NoteShare - Expiring Notes',
  description: 'Simple note sharing with expiring links and password protection.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen flex flex-col antialiased">
        <Navbar />
        <main className="flex-1 max-w-3xl w-full mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
