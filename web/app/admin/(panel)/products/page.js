'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, baht, CATS, mb } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { useDeleteProduct } from '../../../../lib/deleteProduct';
import { Cover, Empty, Pager, Status } from '../../../../components/ui';

// [11] Product list — filters in the query string like [3]
export default function Products() {
  const sp = useSearchParams();
  const router = useRouter();
  const { notify } = useStore();
  const [res, setRes] = useState(null);
  const [sel, setSel] = useState([]);
  const f = Object.fromEntries(['q', 'category', 'status', 'sort', 'page'].map((k) => [k, sp.get(k) ?? '']));
  const set = (patch) => {
    const next = new URLSearchParams({ ...f, page: '', ...patch });
    for (const [k, v] of [...next]) if (!v) next.delete(k);
    router.replace(`/admin/products?${next}`);
  };

  const load = useCallback(() => api(`/admin/products?${sp}`).then(setRes), [sp]);
  useEffect(() => { load(); setSel([]); }, [load]);
  const del = useDeleteProduct((what) => { notify(what === 'deleted' ? 'ลบสินค้าแล้ว' : 'เปลี่ยนเป็น DRAFT แล้ว'); load(); });

  async function bulk(status) {
    const r = await api('/admin/products', { method: 'PATCH', body: { ids: sel, status } });
    notify(`อัปเดต ${r.updated.length} รายการ${r.updated.length < sel.length ? ' (บางรายการยังไม่มีปก/ไฟล์ จึงเผยแพร่ไม่ได้)' : ''}`);
    load();
  }

  const filtered = f.q || f.category || f.status;
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div className="between">
        <div><h1 className="h1">สินค้า</h1><span className="mut">{res?.total ?? '…'} รายการ</span></div>
        <Link className="btn" href="/admin/products/new">+ เพิ่มสินค้า</Link>
      </div>

      <form className="row" onSubmit={(e) => { e.preventDefault(); set({ q: new FormData(e.target).get('q') }); }}>
        <input className="inp" name="q" defaultValue={f.q} key={f.q} placeholder="ค้นหาชื่อสินค้า หรือรหัสสินค้า" style={{ flex: 1 }} />
        <select className="inp" style={{ width: 'auto' }} value={f.category} onChange={(e) => set({ category: e.target.value })}>
          <option value="">ทุกหมวดหมู่</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="inp" style={{ width: 'auto' }} value={f.status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">ทุกสถานะ</option><option>PUBLISHED</option><option>DRAFT</option>
        </select>
        <select className="inp" style={{ width: 'auto' }} value={f.sort} onChange={(e) => set({ sort: e.target.value })}>
          <option value="">เรียงตาม: อัปเดตล่าสุด</option><option value="name">ชื่อ</option><option value="price_asc">ราคาต่ำ–สูง</option><option value="price_desc">ราคาสูง–ต่ำ</option>
        </select>
        <button className="btn">ค้นหา</button>
      </form>

      {res?.items.length === 0 ? (
        <div className="card">
          {filtered
            ? <Empty title="ไม่พบสินค้าตามเงื่อนไข" text="ลองล้างตัวกรองสถานะ หรือค้นด้วยคำที่สั้นลง"><Link className="btn" href="/admin/products">ล้างตัวกรอง</Link></Empty>
            : <Empty title="ยังไม่มีสินค้าในร้าน" text="เริ่มจากเพิ่มสินค้าชิ้นแรก อัปโหลดไฟล์และปกสินค้า แล้วกดเผยแพร่เพื่อให้แสดงบนหน้าร้าน"><Link className="btn" href="/admin/products/new">+ เพิ่มสินค้า</Link></Empty>}
        </div>
      ) : (
        <div className="card">
          {sel.length > 0 && (
            <div className="row pad" style={{ background: 'var(--acw)' }}>
              เลือก {sel.length} รายการ
              <button className="btn2" onClick={() => bulk('PUBLISHED')}>เผยแพร่</button>
              <button className="btn2" onClick={() => bulk('DRAFT')}>ถอนเป็น DRAFT</button>
            </div>
          )}
          <table className="tbl">
            <thead><tr>
              <th><input type="checkbox" aria-label="เลือกทั้งหมด" checked={!!res?.items.length && sel.length === res.items.length}
                onChange={(e) => setSel(e.target.checked ? res.items.map((p) => p.id) : [])} /></th>
              <th>COVER</th><th>ชื่อสินค้า</th><th>หมวดหมู่</th><th>ราคา</th><th>สถานะ</th><th>จัดการ</th>
            </tr></thead>
            <tbody>
              {res?.items.map((p) => (
                <tr key={p.id} className={p.status === 'DRAFT' ? 'draft' : ''}>
                  <td><input type="checkbox" checked={sel.includes(p.id)} onChange={(e) => setSel(e.target.checked ? [...sel, p.id] : sel.filter((x) => x !== p.id))} /></td>
                  <td><Cover src={p.cover_url} className="thumb" label="COVER" /></td>
                  <td style={{ maxWidth: 420 }}>
                    <Link href={`/admin/products/${p.id}`} className="pt">{p.name}</Link>
                    <span className="mut mono" style={{ fontSize: 11 }}>
                      {p.sku} · {p.has_file ? [p.file_types, mb(p.file_size), p.version].filter(Boolean).join(' · ') : 'ยังไม่อัปโหลดไฟล์สินค้า'}
                    </span>
                  </td>
                  <td><span className="tag">{p.category}</span></td>
                  <td className="mono">{baht(p.price)}</td>
                  <td><Status s={p.status} /></td>
                  <td><div className="row">
                    <Link className="btn2" href={`/admin/products/${p.id}`}>แก้ไข</Link>
                    <button className="btn2 danger" onClick={() => del.ask(p)}>ลบ</button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
          {res && <Pager page={res.page} total={res.total} size={20} onPage={(n) => set({ ...f, page: String(n) })} />}
        </div>
      )}
      {del.modal}
    </div>
  );
}
