'use client';
import { usePathname } from 'next/navigation';
import { Header, Tabs } from '../../components/ui';

export default function ShopLayout({ children }) {
  const path = usePathname();
  return (
    <>
      <Header />
      <main className="wrap">{children}</main>
      {/* tabs dimmed during checkout so the buyer can't wander off mid-payment */}
      <Tabs disabled={path === '/checkout'} />
    </>
  );
}
