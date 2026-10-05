'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, baht, CATS, mb, when } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';
import { Cover, Empty, ProductCard } from '../../../../components/ui';

// [4] Product detail
export default function Product() {
  const { id } = useParams();
  const router = useRouter();
  const { user, addToCart, guestCart, notify } = useStore();
  const [p, setP] = useState(null);
  const [missing, setMissing] = useState(false);
  const [inCart, setInCart] = useState(false);

  useEffect(() => {
    if (user === undefined) return; // wait for auth so owned/in_cart are right
    api(`/products/${id}`)
      .then((r) => { setP(r); setInCart(r.in_cart || guestCart().includes(r.id)); })
      .catch(() => setMissing(true));
  }, [id, user, guestCart]);

  if (missing) return (
    <div className="card"><Empty title="ไม่พบสินค้านี้" text="สินค้าอาจถูกถอนออกจากร้านแล้ว ลองดูสินค้าอื่นในหมวดเดียวกัน">
      <Link className="btn" href="/">กลับไปหน้าร้าน</Link>
    </Empty></div>
  );
  if (!p) return <div className="ph r32" style={{ maxWidth: 640 }} />;

  const add = async () => {
    try { await addToCart(p.id); setInCart(true); notify('เพิ่มลงตะกร้าแล้ว'); } catch (e) { notify(e.message); }
  };
  const off = p.compare_at > p.price ? Math.round((1 - p.price / p.compare_at) * 100) : 0;

  return (
    <div className="stack" style={{ gap: 32 }}>
      <nav className="mut hide-m">
        <Link href="/">หน้าแรก</Link> / <Link href={`/search?category=${p.category}`}>{CATS[p.category]}</Link> / {p.name}
      </nav>
      <div className="split" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
        <Cover src={p.cover_url} ratio="r32" label="COVER 3:2 · 1200×800" className="card" />
        <div className="stack">
          <span className="tag">{p.category}</span>
          <h1 className="h1">{p.name}</h1>
          <span className="mut">โดย ร้านสินค้าดิจิทัล · ขายแล้ว {p.sold.toLocaleString('th-TH')} ครั้ง · อัปเดต {when(p.updated_at, false)}</span>
          <div className="row">
            <span className="pp" style={{ fontSize: 26 }}>{baht(p.price)}</span>
            {off > 0 && <><s className="mut mono">{baht(p.compare_at)}</s><span className="st st-FAILED">ลด {off}%</span></>}
          </div>

          {p.owned_since ? (
            <div className="alert ok stack" style={{ alignItems: 'stretch' }}>
              <span>✓ คุณเป็นเจ้าของสินค้านี้แล้ว (ซื้อ {when(p.owned_since, false)})</span>
              <Link className="btn" href="/library">ดาวน์โหลดไฟล์ · ไปที่คลังของฉัน</Link>
            </div>
          ) : (
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              {inCart
                ? <Link className="btn btnl" href="/cart">ดูในตะกร้า</Link>
                : <button className="btn btnl" onClick={add}>เพิ่มลงตะกร้า</button>}
              <button className="btn2 btnl" onClick={() => router.push(user ? `/checkout?products=${p.id}` : `/login?next=${encodeURIComponent(`/checkout?products=${p.id}`)}`)}>ซื้อเลย</button>
            </div>
          )}
          <span className="mut" style={{ fontSize: 12 }}>ดาวน์โหลดได้ทันทีหลังชำระเงิน · ไฟล์ดิจิทัลไม่มีการคืนเงิน</span>

          <dl className="kv card pad">
            <dt>ประเภทไฟล์</dt><dd>{p.file_types || '—'}</dd>
            <dt>ขนาดไฟล์</dt><dd>{mb(p.file_size) || '—'}</dd>
            <dt>อัปเดตล่าสุด</dt><dd className="mono">{p.updated_at?.slice(0, 10)}</dd>
            <dt>เวอร์ชัน</dt><dd>{p.version || '—'}</dd>
          </dl>
        </div>
      </div>

      <section className="card pad">
        <h2 className="h2">รายละเอียดสินค้า</h2>
        {/* stored as markdown; plain pre-wrap keeps line breaks and bullets readable */}
        <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7 }}>{p.description}</p>
      </section>

      {p.related.length > 0 && (
        <section className="stack">
          <div className="between">
            <h2 className="h2">สินค้าที่เกี่ยวข้อง</h2>
            <Link href={`/search?category=${p.category}`}>ดูทั้งหมดในหมวด{CATS[p.category]}</Link>
          </div>
          <div className="grid">{p.related.map((r) => <ProductCard key={r.id} p={r} showDesc={false} />)}</div>
        </section>
      )}
    </div>
  );
}
