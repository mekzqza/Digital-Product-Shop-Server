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
        {/* pages read useSearchParams(); Next needs a Suspense boundary above them.
            The store sits inside it: outside, its mount effect (cart count) runs before the boundary hydrates
            and the header no longer matches the prerendered HTML. */}
        <Suspense><StoreProvider>{children}</StoreProvider></Suspense>
      </body>
    </html>
  );
}
