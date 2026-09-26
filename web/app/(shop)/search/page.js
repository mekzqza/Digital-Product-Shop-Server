'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, baht, CATS } from '../../../lib/api';
import { Empty, ProductCard } from '../../../components/ui';

// [3] Search / category results — every filter lives in the query string (shareable, back button works)
export default function Search() {
  const sp = useSearchParams();
  const router = useRouter();
  const [res, setRes] = useState(null);
  const f = { q: sp.get('q') ?? '', category: sp.get('category') ?? '', min: sp.get('min') ?? '', max: sp.get('max') ?? '', sort: sp.get('sort') ?? 'newest' };

  const set = (patch) => {
    const next = new URLSearchParams({ ...f, ...patch });
    for (const [k, v] of [...next]) if (!v) next.delete(k);
    router.replace(`/search?${next}`);
  };

  useEffect(() => {
    setRes(null);
    api(`/products?${sp.toString()}`).then(setRes).catch(() => setRes({ items: [], total: 0, categories: {} }));
  }, [sp]);

  const rail = (
    <div className="card pad stack">
      <div className="between"><b>ตัวกรอง</b><Link href="/search">ล้างทั้งหมด</Link></div>
      <span className="lbl">หมวดหมู่</span>
      {Object.entries(CATS).map(([slug, th]) => (
        <label key={slug} className="between" style={{ minHeight: 32 }}>
          <span className="row"><input type="radio" name="cat" checked={f.category === slug} onChange={() => set({ category: slug })} />{th}</span>
          <span className="mut mono">{res?.categories?.[slug] ?? 0}</span>
        </label>
      ))}
      <span className="lbl">ช่วงราคา</span>
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <input className="inp" type="number" min="0" placeholder="฿0" defaultValue={f.min} onBlur={(e) => set({ min: e.target.value })} />
        <input className="inp" type="number" min="0" placeholder="฿2,000" defaultValue={f.max} onBlur={(e) => set({ max: e.target.value })} />
      </div>
      <span className="lbl">เรียงตาม</span>
      {[['newest', 'ใหม่สุด'], ['price_asc', 'ราคาต่ำ–สูง'], ['price_desc', 'ราคาสูง–ต่ำ']].map(([v, l]) => (
        <label key={v} className="row" style={{ minHeight: 32 }}>
          <input type="radio" name="sort" checked={f.sort === v} onChange={() => set({ sort: v })} />{l}
        </label>
      ))}
    </div>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <form className="row" onSubmit={(e) => { e.preventDefault(); set({ q: new FormData(e.target).get('q') }); }}>
        <input className="inp" name="q" defaultValue={f.q} key={f.q} placeholder="ค้นหาสินค้าดิจิทัล" style={{ flex: 1 }} />
        {f.q && <button type="button" className="btn2" onClick={() => set({ q: '' })}>✕</button>}
        <button className="btn">ค้นหา</button>
      </form>
      <div className="rail">
        <div className="sticky">
          <div className="hide-m">{rail}</div>
          <details className="only-m"><summary className="btn2">ตัวกรอง</summary><div style={{ marginTop: 12 }}>{rail}</div></details>
        </div>
        <div className="stack">
          <div>
            <h1 className="h1">{f.q ? `ผลการค้นหา “${f.q}”` : CATS[f.category] ?? 'สินค้าทั้งหมด'}</h1>
            <span className="mut">พบ {res?.total ?? '…'} รายการ</span>
          </div>
          <div className="chips">
            {f.category && <button className="chip" onClick={() => set({ category: '' })}>{CATS[f.category]} ✕</button>}
            {(f.min || f.max) && <button className="chip" onClick={() => set({ min: '', max: '' })}>{baht(f.min || 0)}–{f.max ? baht(f.max) : '∞'} ✕</button>}
          </div>
          {!res && <div className="grid g3">{[1, 2, 3].map((i) => <div key={i} className="pc"><div className="ph r43" /><div className="pcb"><div className="ph" style={{ height: 14 }} /></div></div>)}</div>}
          {res?.items.length === 0 && (
            <div className="card">
              <Empty title="ไม่พบสินค้าที่ค้นหา" text="ลองใช้คำค้นที่สั้นลง ตรวจการสะกด หรือล้างตัวกรองราคาออก">
                <Link className="btn" href="/search">ล้างตัวกรอง</Link>
                <Link className="btn2" href="/">ดูสินค้าทั้งหมด</Link>
              </Empty>
            </div>
          )}
          <div className="grid g3">{res?.items.map((p) => <ProductCard key={p.id} p={p} />)}</div>
        </div>
      </div>
    </div>
  );
}
