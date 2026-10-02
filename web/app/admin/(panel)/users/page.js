'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, baht, downloadFile, when } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { Empty, Pager } from '../../../../components/ui';

// Users — read-only list (roles are changed in the DB); a row opens that customer's orders in [13]
export default function Users() {
  const sp = useSearchParams();
  const router = useRouter();
  const { notify } = useStore();
  const [res, setRes] = useState(null);
  const f = Object.fromEntries(['q', 'role', 'page'].map((k) => [k, sp.get(k) ?? '']));
  const set = (patch) => {
    const next = new URLSearchParams({ ...f, page: '', ...patch });
    for (const [k, v] of [...next]) if (!v) next.delete(k);
    router.replace(`/admin/users?${next}`);
  };
  useEffect(() => { api(`/admin/users?${sp}`).then(setRes); }, [sp]);

  const exp = (ext) => downloadFile(`/admin/export/users?format=${ext}`, `users.${ext}`).catch((e) => notify(e.message));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="between">
        <div><h1 className="h1">ผู้ใช้</h1><span className="mut">{res?.total ?? '…'} บัญชี</span></div>
        <div className="row">
          <button className="btn2" onClick={() => exp('csv')}>ส่งออก CSV</button>
          <button className="btn2" onClick={() => exp('json')}>ส่งออก JSON</button>
        </div>
      </div>

      <form className="row" onSubmit={(e) => { e.preventDefault(); set({ q: new FormData(e.target).get('q') }); }}>
        <input className="inp" name="q" defaultValue={f.q} key={f.q} placeholder="ค้นหาชื่อ หรืออีเมล" style={{ flex: 1 }} />
        <select className="inp" style={{ width: 'auto' }} value={f.role} onChange={(e) => set({ role: e.target.value })}>
          <option value="">ทุกสิทธิ์</option><option value="customer">customer</option><option value="admin">admin</option>
        </select>
        <button className="btn">ค้นหา</button>
      </form>

      <div className="card">
        {res?.items.length === 0 ? (
          <Empty title="ไม่พบผู้ใช้ตามเงื่อนไข" text="ลองค้นด้วยคำที่สั้นลง หรือเลือกสิทธิ์เป็นทั้งหมด"><Link className="btn" href="/admin/users">ล้างตัวกรอง</Link></Empty>
        ) : (
          <>
            <table className="tbl">
              <thead><tr><th>ชื่อ</th><th>อีเมล</th><th>สิทธิ์</th><th>สมัครเมื่อ</th><th>คำสั่งซื้อ (PAID)</th><th>ยอดซื้อรวม</th><th /></tr></thead>
              <tbody>
                {res?.items.map((u) => (
                  <tr key={u.id} className="click" onClick={() => router.push(`/admin/orders?q=${encodeURIComponent(u.email)}`)}>
                    <td>{u.name}</td><td>{u.email}</td><td><span className="tag">{u.role}</span></td><td>{when(u.created_at, false)}</td>
                    <td className="mono">{u.paid_orders}</td><td className="mono">{baht(u.total_spent)}</td><td>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {res && <Pager page={res.page} total={res.total} size={20} onPage={(n) => set({ page: String(n) })} />}
          </>
        )}
      </div>
    </div>
  );
}
