'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { Empty, Logo, Narrow } from '../../../components/ui';

// [10]–[13] shared shell: fixed sidebar, admin role required, desktop ≥1280px only (CSS swaps in <Narrow/>)
export default function AdminLayout({ children }) {
  const { user, signOut } = useStore();
  const path = usePathname();
  const router = useRouter();
  const [badges, setBadges] = useState({});

  useEffect(() => { if (user === null) router.replace('/admin/login'); }, [user, router]);
  useEffect(() => {
    if (user?.role !== 'admin') return;
    api('/admin/stats').then((s) => setBadges({ products: s.products_draft, orders: s.orders_pending })).catch(() => {});
  }, [user, path]);

  if (!user) return null;
  if (user.role !== 'admin') return ( // signed-in customer → 403, not the login page
    <div className="wrap"><div className="card"><Empty title="403 — ไม่มีสิทธิ์เข้าถึงระบบหลังร้าน" text="บัญชีนี้เป็นบัญชีลูกค้า">
      <Link className="btn" href="/">กลับไปหน้าร้าน</Link>
    </Empty></div></div>
  );

  const item = (href, label, badge) => (
    <Link href={href} className={`sbi ${(href === '/admin' ? path === href : path.startsWith(href)) ? 'on' : ''}`}>
      {label}{badge > 0 && <span className="cb">{badge}</span>}
    </Link>
  );
  return (
    <>
      <div className="narrow"><Narrow /></div>
      <div className="adm">
        <aside className="sb">
          <div style={{ padding: '0 20px 20px' }}><span style={{ color: '#fff' }}><Logo href="/admin" /></span></div>
          <span className="mono" style={{ padding: '8px 20px', fontSize: 10, color: '#6d727c' }}>จัดการ</span>
          {item('/admin', 'Dashboard')}
          {item('/admin/products', 'สินค้า', badges.products)}
          {item('/admin/orders', 'คำสั่งซื้อ', badges.orders)}
          <div style={{ marginTop: 'auto', padding: '16px 20px', borderTop: '1px solid #2e3139' }}>
            <div style={{ fontSize: 13 }}>{user.name}</div>
            <div style={{ fontSize: 11, color: '#a9aeb8' }}>{user.email}</div>
            <button className="lnk" style={{ color: '#9dc0ff', fontSize: 12, marginTop: 8 }} onClick={() => signOut().then(() => router.replace('/admin/login'))}>ออกจากระบบ</button>
          </div>
        </aside>
        <main className="admain">{children}</main>
      </div>
    </>
  );
}
