'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { loadStripe } from '@stripe/stripe-js';
import { CardElement, Elements, useElements, useStripe } from '@stripe/react-stripe-js';
import { api, baht } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { Cover, TestBanner } from '../../../components/ui';

const PK = process.env.NEXT_PUBLIC_STRIPE_PK;
const stripePromise = PK ? loadStripe(PK) : null;

// [6] Checkout — ?products=1,2 is "ซื้อเลย" / retry; no param = whole cart
export default function CheckoutPage() {
  const { user } = useStore();
  const router = useRouter();
  const sp = useSearchParams();
  const ids = sp.get('products')?.split(',').map(Number).filter(Boolean);
  const [items, setItems] = useState(null);

  useEffect(() => {
    if (user === null) router.replace(`/login?next=${encodeURIComponent('/checkout?' + sp)}`);
    if (!user) return;
    (ids ? Promise.all(ids.map((id) => api(`/products/${id}`).catch(() => null))).then((xs) => xs.filter(Boolean))
      : api('/cart').then((r) => r.items)).then(setItems);
  }, [user]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!user || !items) return <div className="ph" style={{ height: 320 }} />;
  if (!items.length) return <div className="alert">ไม่มีสินค้าที่ชำระเงินได้ <Link href="/">กลับไปหน้าร้าน</Link></div>;

  return (
    <div className="stack" style={{ gap: 20 }}>
      <TestBanner text={<>ระบบทดสอบ Stripe — ไม่มีการตัดเงินจริง ใช้บัตรทดสอบเท่านั้น <span className="mono mut">{PK ? `${PK.slice(0, 8)}••••${PK.slice(-4)}` : 'ยังไม่ได้ตั้ง NEXT_PUBLIC_STRIPE_PK'}</span></>} />
      <div><span className="mut">ขั้นตอน 2/3 · ชำระเงิน</span><h1 className="h1">ชำระเงิน</h1></div>
      {stripePromise
        ? <Elements stripe={stripePromise}><PayForm user={user} items={items} ids={ids} /></Elements>
        : <div className="alert">ยังไม่ได้ตั้งค่า Stripe publishable key</div>}
    </div>
  );
}

function PayForm({ user, items, ids }) {
  const stripe = useStripe();
  const elements = useElements();
  const router = useRouter();
  const [cardDone, setCardDone] = useState(false);
  const [agree, setAgree] = useState(false);
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [order, setOrder] = useState(null); // kept so a retry after decline reuses the same order
  const total = items.reduce((s, p) => s + p.price, 0);

  async function pay() {
    setTried(true);
    if (!cardDone || !agree || !stripe) return;
    setBusy(true); setError(null);
    try {
      const o = order ?? await api('/checkout', { method: 'POST', body: ids ? { productIds: ids } : {} });
      setOrder(o);
      const { error: err } = await stripe.confirmCardPayment(o.clientSecret, {
        payment_method: { card: elements.getElement(CardElement), billing_details: { name: user.name, email: user.email } },
      });
      if (err) { setError(`${err.message}${err.decline_code || err.code ? ` (${err.decline_code || err.code})` : ''}`); return; }
      router.push(`/checkout/result?order=${o.orderNo}`);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="split">
      <div className="stack">
        {tried && (!cardDone || !agree) && (
          <div className="alert">! {!cardDone ? 'กรอกข้อมูลบัตรให้ครบก่อนชำระเงิน' : 'ต้องยอมรับเงื่อนไขก่อนดำเนินการต่อ'}</div>
        )}
        <section className="card pad stack">
          <div className="between"><h2 className="h2">ข้อมูลผู้ซื้อ</h2><Link href="/account">แก้ไขในบัญชีของฉัน</Link></div>
          <div><span className="lbl">ชื่อ-นามสกุล</span><div className="inp" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)' }}>{user.name}</div></div>
          <div><span className="lbl">อีเมลรับใบเสร็จ</span><div className="inp" style={{ display: 'flex', alignItems: 'center', background: 'var(--bg)' }}>{user.email}</div></div>
          <span className="mut mono" style={{ fontSize: 10 }}>READ-ONLY · ดึงจากบัญชีที่ล็อกอิน</span>
        </section>
        <section className="card pad stack">
          <div className="between"><h2 className="h2">ข้อมูลบัตรเครดิต/เดบิต</h2><span className="mut mono" style={{ fontSize: 10 }}>POWERED BY STRIPE</span></div>
          <div className={`inp ${error ? 'bad' : ''}`} style={{ display: 'flex', alignItems: 'center' }}>
            <CardElement options={{ hidePostalCode: true, style: { base: { fontSize: '15px', fontFamily: 'system-ui' } } }}
              onChange={(e) => setCardDone(e.complete)} style={{ width: '100%' }} />
          </div>
          {error && <div className="err">{error} — ข้อมูลในฟอร์มยังอยู่ ลองบัตรอื่นได้เลย</div>}
          <div className="test" style={{ fontSize: 12 }}>
            <span className="tb">TEST CARD</span>
            <span>ใช้เลขบัตร <b className="mono">4242 4242 4242 4242</b> · วันหมดอายุอนาคตใดก็ได้ · CVC สามหลักใดก็ได้ · บัตรที่ถูกปฏิเสธ: <span className="mono">4000 0000 0000 0002</span></span>
          </div>
          <label className="row" style={{ flexWrap: 'nowrap', minHeight: 44 }}>
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} style={{ width: 20, height: 20 }} />
            <span>ยอมรับ<a href="#">เงื่อนไขการใช้งาน</a>และรับทราบว่าสินค้าดิจิทัลไม่สามารถขอคืนเงินได้</span>
          </label>
        </section>
      </div>
      <aside className="card pad stack sticky">
        <h2 className="h2">สรุปคำสั่งซื้อ ({items.length} รายการ)</h2>
        {items.map((p) => (
          <div key={p.id} className="row" style={{ flexWrap: 'nowrap' }}>
            <Cover src={p.cover_url} className="thumb" label="" />
            <div style={{ flex: 1, minWidth: 0 }}><div className="pt">{p.name}</div><span className="mut" style={{ fontSize: 11 }}>{p.file_types}</span></div>
            <span className="mono">{baht(p.price)}</span>
          </div>
        ))}
        <div className="between" style={{ borderTop: '1px solid var(--ln)', paddingTop: 12 }}><b>ยอดชำระทั้งหมด</b><b className="mono">{baht(total)}</b></div>
        <button className="btn btnl" disabled={busy} onClick={pay}>{busy ? 'กำลังดำเนินการ…' : error ? 'ลองชำระเงินอีกครั้ง' : `ชำระเงิน ${baht(total)}`}</button>
        <span className="mut mono" style={{ fontSize: 10, textAlign: 'center' }}>TEST MODE · ไม่มีการตัดเงินจริง</span>
        <Link href="/cart">← กลับไปที่ตะกร้า</Link>
      </aside>
    </div>
  );
}
