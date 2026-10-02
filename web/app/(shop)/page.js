'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { CategoryChips, Empty, ProductCard, SkeletonGrid } from '../../components/ui';

// [2] Storefront
export default function Storefront() {
  const [items, setItems] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState('newest');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0); // bumped by "ลองใหม่"

  useEffect(() => {
    setLoading(true); setError(null);
    api(`/products?sort=${sort}&page=${page}`)
      .then((r) => { setItems((prev) => (page === 1 ? r.items : [...(prev ?? []), ...r.items])); setTotal(r.total); })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [page, sort, attempt]);

  return (
    <div className="stack" style={{ gap: 20 }}>
      <form action="/search" className="only-m"><input className="srch" name="q" placeholder="ค้นหาสินค้าดิจิทัล" style={{ width: '100%', maxWidth: 'none' }} /></form>
      <CategoryChips />
      <div className="between">
        <div><h1 className="h1">{sort === 'newest' ? 'สินค้าใหม่ล่าสุด' : 'สินค้าทั้งหมด'}</h1><span className="mut">{items ? total : '…'} รายการ</span></div>
        <select className="inp" style={{ width: 'auto' }} value={sort} onChange={(e) => { setPage(1); setSort(e.target.value); }}>
          <option value="newest">เรียงตาม: ใหม่สุด</option>
          <option value="price_asc">ราคาต่ำ–สูง</option>
          <option value="price_desc">ราคาสูง–ต่ำ</option>
        </select>
      </div>
      {error && (
        <div className="alert between">
          <span>โหลดสินค้าไม่สำเร็จ — {error}</span>
          <button className="btn2" onClick={() => setAttempt((n) => n + 1)}>ลองใหม่</button>
        </div>
      )}
      {!items && loading && <SkeletonGrid />}
      {items?.length === 0 && <Empty title="ยังไม่มีสินค้าในร้าน" />}
      <div className="grid">{items?.map((p) => <ProductCard key={p.id} p={p} />)}</div>
      {items && items.length < total && (
        <button className="btn2" style={{ alignSelf: 'center' }} disabled={loading} onClick={() => setPage(page + 1)}>
          {loading ? 'กำลังโหลด…' : 'ดูสินค้าเพิ่มเติม'}
        </button>
      )}
    </div>
  );
}
