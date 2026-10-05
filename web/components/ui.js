'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '../lib/store';
import { baht, CATS } from '../lib/api';

export const Logo = ({ href = '/' }) => (
  <Link href={href} className="lg">
    <span className="lgm">
      {/* Feather "shopping-cart"; currentColor picks up .lgm's white */}
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
        <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      </svg>
    </span>
    ร้านสินค้าดิจิทัล
  </Link>
);

export function Cover({ src, ratio = 'r43', label = 'COVER', className = '', alt = '' }) {
  return src
    ? <img src={src} alt={alt} className={`ph ${ratio} ${className}`} />
    : <div className={`ph ${ratio} ${className}`}>{label}</div>;
}

export const Status = ({ s }) => <span className={`st st-${s}`}>{s}</span>;

export function Empty({ title, text, children }) {
  return (
    <div className="empty">
      <div className="eic" />
      <p className="h2">{title}</p>
      {text && <p className="mut" style={{ margin: 0, maxWidth: 420 }}>{text}</p>}
      {children && <div className="row" style={{ justifyContent: 'center', marginTop: 8 }}>{children}</div>}
    </div>
  );
}

export const TestBanner = ({ text = 'ระบบทดสอบ Stripe — ไม่มีการตัดเงินจริง ใช้บัตรทดสอบเท่านั้น' }) => (
  <div className="test"><span className="tb">TEST MODE</span><span>{text}</span></div>
);

// [2]–[9] global header (desktop) + bottom tabs (mobile): two components, not one squashed down
export function Header() {
  const { cartCount, user } = useStore();
  const router = useRouter();
  const path = usePathname();
  const here =(...hrefs) => (hrefs.some((h) => path.startsWith(h)) ? 'page' : undefined);
  const badge = cartCount > 0 && <span className="cb">{cartCount}</span>;
  return (
    <header className="hdr">
      <Logo />
      {/* client-side navigation: a plain GET form would reload the whole app.
          No useSearchParams() here — it would opt every shop page's header out of the prerendered HTML. */}
      <form action="/search" className="hide-m" style={{ flex: 1, maxWidth: 520 }}
        onSubmit={(e) => { e.preventDefault(); router.push(`/search?q=${encodeURIComponent(new FormData(e.target).get('q'))}`); e.target.reset(); }}>
        <input className="srch" name="q" aria-label="ค้นหาสินค้า"
          placeholder="ค้นหาสินค้าดิจิทัล เช่น เทมเพลต Excel" style={{ width: '100%', maxWidth: 'none' }} />
      </form>
      <nav className="hact">
        {user?.role === 'admin' && <Link href="/admin">หลังร้าน</Link>}
        <Link href="/library" aria-current={here('/library')}>คลังของฉัน</Link>
        <Link href="/cart" aria-current={here('/cart')}>ตะกร้า {badge}</Link>
        <Link href={user ? '/account' : '/login'} aria-current={here('/account', '/login', '/orders')}>{user ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}</Link>
      </nav>
      <button className="only-m lnk" style={{ marginLeft: 'auto' }} onClick={() => router.push('/cart')}>
        ตะกร้า {badge}
      </button>
    </header>
  );
}

export function Tabs({ disabled }) {
  const path = usePathname();
  const { cartCount } = useStore();
  const tab = (href, label, extra) => (
    <Link href={href} className={(href === '/' ? path === '/' : path.startsWith(href)) ? 'on' : ''}>
      {label}{extra}
    </Link>
  );
  return (
    <nav className={`tabs ${disabled ? 'off' : ''}`}>
      {tab('/', 'หน้าร้าน')}
      {tab('/search', 'ค้นหา')}
      {tab('/cart', 'ตะกร้า', cartCount > 0 && <span className="cb">{cartCount}</span>)}
      {tab('/account', 'บัญชี')}
    </nav>
  );
}

export function ProductCard({ p, showDesc = true }) {
  const { addToCart, notify } = useStore();
  const router = useRouter();
  const [state, setState] = useState(''); // '' | 'busy' | 'added'
  const toCart = { label: 'ดูตะกร้า', fn: () => router.push('/cart') };
  const add = async () => {
    setState('busy');
    try { await addToCart(p.id); setState('added'); notify('เพิ่มลงตะกร้าแล้ว', toCart); }
    catch (e) { setState(''); notify(e.message, toCart); } // "already in cart" → the cart is the next stop either way
  };
  return (
    <div className="pc">
      <Link href={`/products/${p.id}`} tabIndex={-1}><Cover src={p.cover_url} label="COVER 4:3" alt={p.name} /></Link>
      <div className="pcb">
        <span className="tag">{p.category}</span>
        <Link href={`/products/${p.id}`} className="pt">{p.name}</Link>
        {showDesc && p.excerpt && <p className="pd">{p.excerpt}</p>}
        <div className="prow">
          <span className="pp">{baht(p.price)}</span>
          {state === 'added'
            ? <Link className="btn2" href="/cart">✓ ดูในตะกร้า</Link>
            : <button className="btn" disabled={state === 'busy'} onClick={add}>เพิ่มลงตะกร้า</button>}
        </div>
      </div>
    </div>
  );
}

// Loading placeholder shaped like the product grid, shared by [2] and [3]
export const SkeletonGrid = ({ n = 8, className = 'grid' }) => (
  <div className={`${className} sk`} aria-hidden="true">
    {Array.from({ length: n }, (_, i) => (
      <div key={i} className="pc">
        <div className="ph r43" />
        <div className="pcb"><div className="ph" style={{ height: 14 }} /><div className="ph" style={{ height: 14, width: '60%' }} /></div>
      </div>
    ))}
  </div>
);

export const CategoryChips = ({ active }) => (
  <div className="chips">
    <Link href="/" className={`chip ${!active ? 'on' : ''}`}>ทั้งหมด</Link>
    {Object.entries(CATS).map(([slug, th]) => (
      <Link key={slug} href={`/search?category=${slug}`} className={`chip ${active === slug ? 'on' : ''}`}>{th}</Link>
    ))}
  </div>
);

export function SignedOut({ title, text, next }) {
  return (
    <div className="card">
      <Empty title={title} text={text}>
        <Link className="btn" href={`/login?next=${encodeURIComponent(next)}`}>เข้าสู่ระบบ</Link>
        <Link className="btn2" href={`/login?tab=register&next=${encodeURIComponent(next)}`}>สมัครสมาชิก</Link>
      </Empty>
    </div>
  );
}

export function Modal({ children, onClose }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function Pager({ page, total, size, onPage }) {
  const pages = Math.max(1, Math.ceil(total / size));
  return (
    <div className="between" style={{ padding: '12px 14px' }}>
      <span className="mut">แสดง {total ? (page - 1) * size + 1 : 0}–{Math.min(page * size, total)} จาก {total} รายการ</span>
      <div className="row">
        <button className="btn2" disabled={page <= 1} onClick={() => onPage(page - 1)}>ก่อนหน้า</button>
        <span className="mono">{page} / {pages}</span>
        <button className="btn2" disabled={page >= pages} onClick={() => onPage(page + 1)}>ถัดไป</button>
      </div>
    </div>
  );
}

// [14]-B: admin opened below 1280px
export function Narrow() {
  return (
    <div className="card" style={{ margin: 16 }}>
      <div className="empty">
        <div className="eic" />
        <p className="h2">ระบบหลังร้านรองรับเดสก์ท็อปเท่านั้น</p>
        <p className="mut" style={{ margin: 0 }}>กรุณาเปิดบนหน้าจอกว้างอย่างน้อย 1280px เพื่อใช้ตารางข้อมูลและฟอร์มได้ครบทุกคอลัมน์</p>
        <Link className="btn" href="/">กลับไปหน้าร้าน</Link>
      </div>
    </div>
  );
}
