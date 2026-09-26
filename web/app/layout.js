import { Suspense } from 'react';
import { StoreProvider } from '../lib/store';
import './globals.css';

export const metadata = { title: 'โหลดเลย — ร้านสินค้าดิจิทัล' };

export default function RootLayout({ children }) {
  return (
    <html lang="th">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Thai:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
      </head>
      <body>
        <StoreProvider>
          {/* pages read useSearchParams(); Next needs a Suspense boundary above them */}
          <Suspense>{children}</Suspense>
        </StoreProvider>
      </body>
    </html>
  );
}
