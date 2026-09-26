'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, baht } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { Cover, Empty } from '../../../components/ui';

// [5] Cart — no qty selector: digital goods are 1 per product
export default function Cart() {
  const { user, guestCart, removeFromCart, addToCart, notify } = useStore();
  const router = useRouter();
  const [items, setItems] = useState(null);
  const [removed, setRemoved] = useState([]);

  const load = useCallback(async () => {
    if (user) {
      const r = await api('/cart');
      setItems(r.items); setRemoved(r.removed);
    } else {
      // guest: resolve ids one by one; unpublished ones 404 and drop out
      const got = await Promise.all(guestCart().map((id) => api(`/products/${id}`).catch(() => null)));
      setItems(got.filter(Boolean));
    }
  }, [user, guestCart]);
  useEffect(() => { if (user !== undefined) load(); }, [user, load]);

  const remove = async (p) => {
    await removeFromCart(p.id);
    setItems((xs) => xs.filter((x) => x.id !== p.id));
    notify(`นำ “${p.name}” ออกแล้ว`, { label: 'เลิกทำ', fn: () => addToCart(p.id).then(load) });
  };

  if (!items) return <div className="ph" style={{ height: 240 }} />;
  if (!items.length) return (
    <div className="card"><Empty title="ตะกร้าของคุณยังว่างอยู่" text="เลือกดูอีบุ๊ก เทมเพลต ซอร์สโค้ด หรือคอร์สออนไลน์ แล้วเพิ่มลงตะกร้าได้เลย">
      <Link className="btn" href="/">เลือกซื้อสินค้า</Link><Link className="btn2" href="/library">ดูคลังของฉัน</Link>
    </Empty></div>
  );

  const total = items.reduce((s, p) => s + p.price, 0);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div><h1 className="h1">ตะกร้าสินค้า</h1><span className="mut">{items.length} รายการ · สินค้าดิจิทัลดาวน์โหลดได้ทันทีหลังชำระเงิน</span></div>
      {removed.length > 0 && <div className="alert">! มี {removed.length} รายการถูกถอนออกจากร้าน ระบบนำออกจากตะกร้าให้แล้ว</div>}
      <div className="split">
        <div className="card">
          {items.map((p) => (
            <div key={p.id} className="row" style={{ padding: 16, borderBottom: '1px solid var(--ln2)', flexWrap: 'nowrap' }}>
              <Cover src={p.cover_url} className="thumb" label="" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="tag">{p.category}</span>
                <Link href={`/products/${p.id}`} className="pt" style={{ display: 'block', marginTop: 4 }}>{p.name}</Link>
                <span className="mut" style={{ fontSize: 12 }}>{p.file_types}</span>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
                <span className="pp">{baht(p.price)}</span>
                <span className="tag">QTY 1</span>
                <button className="lnk" onClick={() => remove(p)}>นำออก</button>
              </div>
            </div>
          ))}
        </div>
        <aside className="card pad stack sticky">
          <h2 className="h2">สรุปคำสั่งซื้อ</h2>
          <div className="between"><span>ยอดรวมสินค้า ({items.length} รายการ)</span><span className="mono">{baht(total)}</span></div>
          <div className="between mut"><span>ค่าจัดส่ง</span><span>— ไม่มี (สินค้าดิจิทัล)</span></div>
          <div className="between" style={{ borderTop: '1px solid var(--ln)', paddingTop: 12 }}><b>ยอดชำระทั้งหมด</b><b className="mono">{baht(total)}</b></div>
          <button className="btn btnl" onClick={() => router.push(user ? '/checkout' : '/login?next=/checkout')}>ดำเนินการชำระเงิน</button>
          <span className="mut mono" style={{ fontSize: 10, textAlign: 'center' }}>STRIPE TEST MODE · ไม่มีการตัดเงินจริง</span>
          <Link href="/">← เลือกซื้อสินค้าต่อ</Link>
        </aside>
      </div>
    </div>
  );
}
