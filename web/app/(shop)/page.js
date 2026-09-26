'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { CategoryChips, Empty, ProductCard } from '../../components/ui';

// [2] Storefront
export default function Storefront() {
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [error, setError] = useState(null);

  useEffect(() => {
    api(`/products?sort=${sort}&page=${page}`)
      .then((r) => { setItems((prev) => (page === 1 ? r.items : [...(prev ?? []), ...r.items])); setTotal(r.total); })
      .catch((e) => setError(e.message));
  }, [page, sort]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <form action="/search" className="only-m"><input className="srch" name="q" placeholder="ค้นหาสินค้าดิจิทัล" style={{ width: '100%', maxWidth: 'none' }} /></form>
      <CategoryChips />
      <div className="between">
        <div><h1 className="h1">สินค้าใหม่ล่าสุด</h1><span className="mut">{total} รายการ</span></div>
        <select className="inp" style={{ width: 'auto' }} value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }}>
          <option value="newest">เรียงตาม: ใหม่สุด</option>
          <option value="price_asc">ราคาต่ำ–สูง</option>
          <option value="price_desc">ราคาสูง–ต่ำ</option>
        </select>
      </div>
      {error && <div className="alert">{error}</div>}
      {items?.length === 0 && <Empty title="ยังไม่มีสินค้าในร้าน" />}
      <div className="grid">{items?.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      {items && items.length < total && (
        <button className="btn2" style={{ alignSelf: 'center' }} onClick={() => setPage(page + 1)}>ดูสินค้าเพิ่มเติม</button>
      )}
    </div>
  );
}
