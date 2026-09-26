'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, baht, mb } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { Cover, Status, TestBanner } from '../../../../components/ui';

// [7] Payment result. The truth comes from the Stripe webhook, so poll while PENDING.
export default function Result() {
  const no = useSearchParams().get('order');
  const { user, refresh } = useStore();
  const [o, setO] = useState(null);
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!user) return;
    let alive = true, tries = 0;
    const tick = async () => {
      const r = await api(`/orders/${no}`).catch(() => null);
      if (!alive) return;
      if (r) setO(r);
      if (r?.status === 'PENDING' && ++tries < 30) setTimeout(tick, 2000);
      else { if (r?.status === 'PENDING') setSlow(true); refresh(); } // cart count drops to 0 on PAID
    };
    tick();
    return () => { alive = false; };
  }, [user, no, refresh]);

  if (!o) return <div className="ph" style={{ height: 320 }} />;

  const head = {
    PAID: ['✓', 'ชำระเงินสำเร็จ', 'ขอบคุณสำหรับการสั่งซื้อ ไฟล์ทั้งหมดพร้อมดาวน์โหลดในคลังของคุณแล้ว', 'up'],
    FAILED: ['✕', 'ชำระเงินไม่สำเร็จ', 'ยังไม่มีการเรียกเก็บเงิน และสินค้ายังอยู่ในตะกร้าของคุณ', 'down'],
    PENDING: ['…', 'กำลังตรวจสอบการชำระเงิน', slow ? 'ใช้เวลานานกว่าปกติ ระบบจะส่งอีเมลยืนยันให้แทน — ตรวจสถานะได้ที่ประวัติคำสั่งซื้อ' : 'โปรดอย่าปิดหน้านี้หรือกดย้อนกลับ ขั้นตอนนี้ใช้เวลาไม่เกิน 30 วินาที', ''],
  }[o.status] ?? ['', o.status, '', ''];

  return (
    <div className="stack" style={{ gap: 20, maxWidth: 760, margin: '0 auto' }}>
      <TestBanner text="คำสั่งซื้อนี้สร้างในระบบทดสอบ ไม่มีการตัดเงินจริง" />
      <section className="card pad stack" style={{ alignItems: 'center', textAlign: 'center' }}>
        <div className={`h1 ${head[3]}`} style={{ fontSize: 40 }}>{head[0]}</div>
        <h1 className="h1">{head[1]}</h1>
        <p className="mut" style={{ margin: 0 }}>{head[2]}</p>
        {o.status === 'PAID' && user && <p className="mut" style={{ margin: 0 }}>เราส่งใบเสร็จไปที่ {user.email}</p>}
        <dl className="kv" style={{ margin: '12px 0' }}>
          <dt>เลขที่คำสั่งซื้อ</dt><dd className="mono">{o.order_no}</dd>
          <dt>ยอดชำระ</dt><dd className="mono">{baht(o.total)}</dd>
          {o.failure_code && <><dt>รหัสข้อผิดพลาด</dt><dd className="mono">{o.failure_code}</dd></>}
          <dt>สถานะ</dt><dd><Status s={o.status} /></dd>
        </dl>
        <div className="row" style={{ justifyContent: 'center' }}>
          {o.status === 'PAID' && <><Link className="btn" href="/library">ไปที่คลังของฉัน</Link><Link className="btn2" href="/">เลือกซื้อสินค้าต่อ</Link></>}
          {o.status === 'FAILED' && <><Link className="btn" href={`/checkout?products=${o.items.map((i) => i.productId).join(',')}`}>ลองอีกครั้ง</Link><a className="btn2" href="mailto:support@sukpat.dev">ติดต่อฝ่ายช่วยเหลือ</a></>}
        </div>
      </section>
      {o.status === 'PAID' && (
        <section className="card">
          <h2 className="h2 pad">รายการในคำสั่งซื้อนี้ ({o.items.length})</h2>
          {o.items.map((i) => (
            <div key={i.itemId} className="row" style={{ padding: '12px 20px', borderTop: '1px solid var(--ln2)', flexWrap: 'nowrap' }}>
              <Cover src={i.coverUrl} className="thumb" label="" />
              <div style={{ flex: 1 }}><div className="pt">{i.name}</div><span className="mut" style={{ fontSize: 11 }}>{i.fileTypes} · {mb(i.fileSize)}</span></div>
              <Link className="btn2" href="/library">ดาวน์โหลด</Link>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}
