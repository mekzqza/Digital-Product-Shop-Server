'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, baht, when } from '../../../lib/api';
import { Empty, Status } from '../../../components/ui';

const pct = (cur, prev) => (prev ? ((cur - prev) / prev) * 100 : null);
function Delta({ cur, prev }) {
  const d = pct(cur, prev);
  if (d == null) return <span className="mut">—</span>;
  return <span className={d >= 0 ? 'up' : 'down'}>{d >= 0 ? '+' : '−'}{Math.abs(d).toFixed(1)}%</span>;
}

// [10] Dashboard
export default function Dashboard() {
  const router = useRouter();
  const [days, setDays] = useState(30);
  const [bucket, setBucket] = useState('day');
  const [s, setS] = useState(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    api(`/admin/stats?days=${days}&bucket=${bucket}`).then(setS).catch(() => setError(true));
  }, [days, bucket]);
  useEffect(load, [load]);

  const max = Math.max(1, ...(s?.series ?? []).map((p) => p.sales));
  const empty = s && s.products_published + s.products_draft === 0 && !s.recentOrders.length;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="between">
        <div><h1 className="h1">ภาพรวมร้าน</h1><span className="mut">อัปเดต {when(new Date())}</span></div>
        <select className="inp" style={{ width: 'auto' }} value={days} onChange={(e) => setDays(+e.target.value)}>
          <option value={7}>7 วันล่าสุด</option><option value={30}>30 วันล่าสุด</option><option value={90}>90 วันล่าสุด</option><option value={365}>1 ปี</option>
        </select>
      </div>

      {error && <div className="alert between"><span>! โหลดสถิติไม่สำเร็จ</span><button className="btn2" onClick={load}>ลองโหลดใหม่</button></div>}

      <div className="stats">
        {[
          ['ยอดขายรวม', baht(s?.sales), <><Delta cur={s?.sales} prev={s?.sales_prev} /> เทียบ {days} วันก่อน</>],
          ['จำนวนคำสั่งซื้อ', s?.orders, <><Delta cur={s?.orders} prev={s?.orders_prev} /> PAID {s?.orders_paid} · FAILED {s?.orders_failed}</>],
          ['สินค้าทั้งหมด', s && s.products_published + s.products_draft, <>PUBLISHED {s?.products_published} · DRAFT {s?.products_draft}</>],
          ['สมาชิกใหม่', s?.new_users, <><Delta cur={s?.new_users} prev={s?.new_users_prev} /> เทียบ {days} วันก่อน</>],
        ].map(([label, v, sub]) => (
          <div key={label} className="card stat">
            <span className="mut">{label}</span>
            {s ? <b>{v}</b> : <div className="ph" style={{ height: 29, margin: '6px 0' }} />}
            <span className="mono" style={{ fontSize: 11 }}>{s && sub}</span>
          </div>
        ))}
      </div>

      {empty ? (
        <div className="card"><Empty title="ยังไม่มีข้อมูลยอดขาย" text="เพิ่มสินค้าและเผยแพร่ขึ้นร้านก่อน กราฟและตารางคำสั่งซื้อจะเริ่มแสดงข้อมูลเมื่อมีการซื้อครั้งแรก">
          <Link className="btn" href="/admin/products/new">เพิ่มสินค้าชิ้นแรก</Link>
        </Empty></div>
      ) : (
        <>
          <section className="card pad">
            <div className="between">
              <h2 className="h2">ยอดขาย{{ day: 'รายวัน', week: 'รายสัปดาห์', month: 'รายเดือน' }[bucket]}</h2>
              <div className="chips">
                {[['day', 'รายวัน'], ['week', 'รายสัปดาห์'], ['month', 'รายเดือน']].map(([b, l]) => (
                  <button key={b} className={`chip ${bucket === b ? 'on' : ''}`} onClick={() => setBucket(b)}>{l}</button>
                ))}
              </div>
            </div>
            {/* ponytail: CSS bars, swap for Chart.js/Recharts if axes/tooltips are needed */}
            <div className="chart">
              {s?.series.map((p) => <i key={p.t} style={{ height: `${(p.sales / max) * 100}%` }} title={`${when(p.t, false)} · ${baht(p.sales)}`} />)}
            </div>
            {s?.series.length === 0 && <p className="mut">ยังไม่มียอดขายในช่วงนี้</p>}
          </section>

          <section className="card">
            <div className="between pad"><h2 className="h2">คำสั่งซื้อล่าสุด</h2><Link href="/admin/orders">ดูทั้งหมดในหน้าคำสั่งซื้อ →</Link></div>
            <table className="tbl">
              <thead><tr><th>ORDER NO.</th><th>ลูกค้า</th><th>วันที่</th><th>รายการ</th><th>ยอดรวม</th><th>สถานะ</th></tr></thead>
              <tbody>
                {s?.recentOrders.map((o) => (
                  <tr key={o.order_no} className="click" onClick={() => router.push(`/admin/orders?open=${o.order_no}`)}>
                    <td className="mono">{o.order_no}</td><td>{o.email}</td><td>{when(o.created_at)}</td>
                    <td>{o.item_count}</td><td className="mono">{baht(o.total)}</td><td><Status s={o.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
