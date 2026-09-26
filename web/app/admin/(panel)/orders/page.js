'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, baht, when } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { Cover, Empty, Pager, Status } from '../../../../components/ui';

// [13] All orders (whole shop, unlike [9]) + side drawer; ?open=ORD-… opens a drawer directly
export default function AdminOrders() {
  const sp = useSearchParams();
  const router = useRouter();
  const [res, setRes] = useState(null);
  const f = Object.fromEntries(['q', 'status', 'from', 'to', 'page', 'open'].map((k) => [k, sp.get(k) ?? '']));
  const set = (patch) => {
    const next = new URLSearchParams({ ...f, ...patch });
    for (const [k, v] of [...next]) if (!v) next.delete(k);
    router.replace(`/admin/orders?${next}`, { scroll: false });
  };
  const listQs = new URLSearchParams(sp); listQs.delete('open');
  const load = useCallback(() => api(`/admin/orders?${listQs}`).then(setRes), [listQs.toString()]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [load]);

  const filtered = f.q || f.status || f.from || f.to;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div><h1 className="h1">คำสั่งซื้อ</h1>
        <span className="mut">{res?.total ?? '…'} รายการ · PENDING {res?.counts.pending ?? 0} · FAILED {res?.counts.failed ?? 0}</span></div>

      <form className="row" onSubmit={(e) => { e.preventDefault(); set({ q: new FormData(e.target).get('q'), page: '' }); }}>
        <input className="inp" name="q" defaultValue={f.q} key={f.q} placeholder="ค้นหาเลขคำสั่งซื้อ หรืออีเมลลูกค้า" style={{ flex: 1 }} />
        <select className="inp" style={{ width: 'auto' }} value={f.status} onChange={(e) => set({ status: e.target.value, page: '' })}>
          <option value="">ทุกสถานะ</option><option>PENDING</option><option>PAID</option><option>FAILED</option><option>REFUNDED</option>
        </select>
        <input className="inp" type="date" style={{ width: 'auto' }} value={f.from} onChange={(e) => set({ from: e.target.value, page: '' })} />
        <span className="mut">–</span>
        <input className="inp" type="date" style={{ width: 'auto' }} value={f.to} onChange={(e) => set({ to: e.target.value, page: '' })} />
        <button className="btn">ค้นหา</button>
      </form>

      {res?.items.length === 0 ? (
        <div className="card">
          {filtered
            ? <Empty title="ไม่พบคำสั่งซื้อตามเงื่อนไข" text="ลองขยายช่วงวันที่ หรือเลือกสถานะเป็นทั้งหมด"><Link className="btn" href="/admin/orders">ล้างตัวกรอง</Link></Empty>
            : <Empty title="ยังไม่มีคำสั่งซื้อเข้ามา" text="คำสั่งซื้อจะปรากฏที่นี่ทันทีที่ลูกค้าชำระเงิน ทั้งสถานะ PENDING, PAID และ FAILED"><Link className="btn2" href="/admin/products?status=PUBLISHED">ดูสินค้าที่เผยแพร่อยู่</Link></Empty>}
        </div>
      ) : (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>ORDER NO.</th><th>อีเมลลูกค้า</th><th>วันที่</th><th>รายการ</th><th>ยอดรวม</th><th>สถานะ</th><th /></tr></thead>
            <tbody>
              {res?.items.map((o) => (
                <tr key={o.order_no} className={`click ${f.open === o.order_no ? 'sel' : ''}`} onClick={() => set({ open: o.order_no })}>
                  <td className="mono">{o.order_no}</td><td>{o.email}</td><td>{when(o.created_at)}</td><td>{o.item_count}</td>
                  <td className="mono">{baht(o.total)}</td><td><Status s={o.status} /></td><td>›</td>
                </tr>
              ))}
            </tbody>
          </table>
          {res && <Pager page={res.page} total={res.total} size={20} onPage={(n) => set({ page: String(n) })} />}
        </div>
      )}
      {f.open && <Drawer no={f.open} onClose={() => set({ open: '' })} onChange={load} />}
    </div>
  );
}

function Drawer({ no, onClose, onChange }) {
  const { notify } = useStore();
  const [o, setO] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { setO(null); api(`/admin/orders/${no}`).then(setO).catch(() => onClose()); }, [no]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  async function refund() {
    // two-step confirm: native dialogs are enough for a desktop-only admin
    if (!confirm(`คืนเงิน ${baht(o.total)} ให้ ${o.customer.email}?`)) return;
    if (!confirm('ยืนยันอีกครั้ง: ลูกค้าจะเสียสิทธิ์ดาวน์โหลดสินค้าในคำสั่งซื้อนี้ทันที')) return;
    setBusy(true);
    try {
      await api(`/admin/orders/${no}/refund`, { method: 'POST' });
      notify('คืนเงินแล้ว');
      setO({ ...o, status: 'REFUNDED' }); onChange();
    } catch (e) { notify(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="drawer-bg" onClick={onClose} />
      <aside className="drawer" role="dialog" aria-label={no}>
        {!o ? <div className="ph" style={{ height: 200, margin: 24 }} /> : (
          <div className="stack pad" style={{ gap: 20 }}>
            <div className="between">
              <div><div className="h2 mono">{o.order_no}</div><span className="mut">{when(o.created_at)} น.</span></div>
              <div className="row"><Status s={o.status} /><button className="btn2" onClick={onClose} aria-label="ปิด">✕</button></div>
            </div>

            {o.status === 'FAILED' && (
              <div className="alert"><div><b>! ชำระเงินไม่สำเร็จ · {o.failure_code}</b><div>ไม่ปล่อยไฟล์ให้ลูกค้า · ไม่มีปุ่มคืนเงินในสถานะนี้</div></div></div>
            )}

            <section className="card pad">
              <span className="lbl">ลูกค้า</span>
              <b>{o.customer.name}</b><div className="mut">{o.customer.email}</div>
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>คำสั่งซื้อทั้งหมด</dt><dd>{o.customer.orderCount} ครั้ง</dd>
                <dt>ยอดรวมตลอดชีพ</dt><dd className="mono">{baht(o.customer.lifetimeTotal)}</dd>
                <dt>สมาชิกตั้งแต่</dt><dd>{when(o.customer.memberSince, false)}</dd>
              </dl>
            </section>

            <section className="stack">
              <span className="lbl">รายการสินค้า ({o.items.length})</span>
              {o.items.map((i, n) => (
                <div key={n} className="row" style={{ flexWrap: 'nowrap' }}>
                  <Cover src={i.coverUrl} className="thumb" label="" />
                  <div style={{ flex: 1 }}><div className="pt">{i.name}</div>
                    <span className="mut mono" style={{ fontSize: 11 }}>{i.category.toUpperCase()} · ดาวน์โหลดแล้ว {i.downloads}/5</span></div>
                  <span className="mono">{baht(i.price)}</span>
                </div>
              ))}
            </section>

            <section className="card pad">
              <div className="between"><span className="lbl">การชำระเงิน</span>{o.testMode && <span className="tb">TEST MODE</span>}</div>
              {o.testMode && <div className="mut" style={{ fontSize: 12 }}>ธุรกรรมทดสอบ ไม่มีการตัดเงินจริง</div>}
              <dl className="kv" style={{ marginTop: 12 }}>
                <dt>Payment Intent</dt><dd className="mono">{o.payment_intent ? `${o.payment_intent.slice(0, 12)}••••` : '—'}</dd>
                <dt>เวลายืนยัน (webhook)</dt><dd>{o.paid_at ? when(o.paid_at) : '—'}</dd>
                <dt>ยอดรวม</dt><dd className="mono">{baht(o.total)}</dd>
              </dl>
            </section>

            <div className="row">
              {o.stripeUrl && <a className="btn2" href={o.stripeUrl} target="_blank" rel="noreferrer">ดูใน Stripe</a>}
              {/* refund only for PAID */}
              {o.status === 'PAID' && <button className="btn2 danger" disabled={busy} onClick={refund}>คืนเงิน</button>}
            </div>
          </div>
        )}
      </aside>
    </>
  );
}
