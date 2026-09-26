'use client';
import { Fragment, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, baht, when } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { useDownload } from '../../../lib/download';
import { Cover, Empty, SignedOut, Status } from '../../../components/ui';

const THIS_YEAR = new Date().getFullYear() + 543;

// [9] Order history — click a row to expand in place, one at a time
export default function Orders() {
  const { user } = useStore();
  const [status, setStatus] = useState('');
  const [year, setYear] = useState('');
  const [orders, setOrders] = useState(null);
  const [open, setOpen] = useState(null);
  const { download, busy, error } = useDownload();

  useEffect(() => {
    if (!user) return;
    const qs = new URLSearchParams({ ...(status && { status }), ...(year && { year }) });
    api(`/orders?${qs}`).then((r) => { setOrders(r.items); setOpen(r.items[0]?.order_no); });
  }, [user, status, year]);

  if (user === null) return <SignedOut title="เข้าสู่ระบบเพื่อดูประวัติคำสั่งซื้อ" text="ประวัติการสั่งซื้อและใบเสร็จผูกกับบัญชีของคุณ" next="/orders" />;
  if (!orders) return <div className="ph" style={{ height: 320 }} />;
  const filtered = status || year;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="between">
        <div><h1 className="h1">ประวัติคำสั่งซื้อ</h1><span className="mut">คำสั่งซื้อทั้งหมด {orders.length} รายการ</span></div>
        <div className="row">
          <select className="inp" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">ทุกสถานะ</option><option>PAID</option><option>PENDING</option><option>FAILED</option>
          </select>
          <select className="inp" style={{ width: 'auto' }} value={year} onChange={(e) => setYear(e.target.value)}>
            <option value="">ทุกปี</option>{[0, 1, 2].map((d) => <option key={d}>{THIS_YEAR - d}</option>)}
          </select>
        </div>
      </div>
      {!orders.length ? (
        <div className="card">
          {filtered
            ? <Empty title="ไม่พบคำสั่งซื้อตามตัวกรอง" text="ลองเปลี่ยนสถานะหรือช่วงปีที่เลือก"><button className="btn" onClick={() => { setStatus(''); setYear(''); }}>ล้างตัวกรอง</button></Empty>
            : <Empty title="ยังไม่มีประวัติคำสั่งซื้อ" text="เมื่อคุณสั่งซื้อสำเร็จ รายการทั้งหมดจะแสดงที่นี่"><Link className="btn" href="/">เลือกซื้อสินค้า</Link></Empty>}
        </div>
      ) : (
        <div className="card scroll">
          <table className="tbl">
            <thead><tr><th>ORDER NO.</th><th>วันที่สั่งซื้อ</th><th>จำนวนรายการ</th><th>ยอดรวม</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {orders.map((o) => (
                <Fragment key={o.order_no}>
                  <tr className={`click ${open === o.order_no ? 'sel' : ''}`} onClick={() => setOpen(open === o.order_no ? null : o.order_no)}>
                    <td className="mono">{o.order_no}</td><td>{when(o.created_at)}</td><td>{o.items.length}</td>
                    <td className="mono">{baht(o.total)}</td><td><Status s={o.status} /></td>
                    <td onClick={(e) => e.stopPropagation()}>
                      {o.status === 'FAILED' && <Link href={`/checkout?products=${o.items.map((i) => i.productId).join(',')}`}>ชำระเงินอีกครั้ง</Link>}
                      {o.status === 'PENDING' && <span className="mut">รอการยืนยัน</span>}
                    </td>
                  </tr>
                  {open === o.order_no && (
                    <tr><td colSpan={6} style={{ background: 'var(--bg)' }}>
                      <div className="stack">
                        {o.items.map((i) => (
                          <div key={i.itemId} className="between" style={{ flexWrap: 'nowrap' }}>
                            <div className="row" style={{ flexWrap: 'nowrap' }}>
                              <Cover src={i.coverUrl} className="thumb" label="" />
                              <div><div className="pt">{i.name}</div><span className="tag">{i.category}</span></div>
                            </div>
                            <div className="row">
                              <span className="mono">{baht(i.price)}</span>
                              {/* PENDING/FAILED never release files */}
                              {o.status === 'PAID' && <button className="btn2" disabled={busy === i.itemId} onClick={() => download(i.itemId)}>ดาวน์โหลด</button>}
                              {error[i.itemId] && <span className="bad" style={{ fontSize: 11 }}>{error[i.itemId]}</span>}
                            </div>
                          </div>
                        ))}
                        {o.status === 'PAID' && <span className="mut" style={{ fontSize: 12 }}>ชำระผ่าน Stripe (TEST) · {o.payment_intent?.slice(0, 10)}••••</span>}
                        {o.status === 'PENDING' && <span className="mut" style={{ fontSize: 12 }}>รอการยืนยันจากระบบชำระเงิน · ยังดาวน์โหลดไม่ได้</span>}
                      </div>
                    </td></tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
