'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useStore } from '../lib/store';
import { baht, CATS } from '../lib/api';

export const Logo = ({ href = '/' }) => (
  <Link href={href} className="lg"><span className="lgm">ล</span>โหลดเลย</Link>
);

export function Cover({ src, ratio = 'r43', label = 'COVER', className = '' }) {
  return src
    ? <img src={src} alt="" className={`ph ${ratio} ${className}`} />
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
  return (
    <header className="hdr">
      <Logo />
      <form action="/search" className="hide-m" style={{ flex: 1, maxWidth: 520 }}>
        <input className="srch" name="q" placeholder="ค้นหาสินค้าดิจิทัล เช่น เทมเพลต Excel" style={{ width: '100%', maxWidth: 'none' }} />
      </form>
      <nav className="hact">
        <Link href="/library">คลังของฉัน</Link>
        <Link href="/cart">ตะกร้า <span className="cb">{cartCount}</span></Link>
        <Link href={user ? '/account' : '/login'}>{user ? 'บัญชีของฉัน' : 'เข้าสู่ระบบ'}</Link>
      </nav>
      <button className="only-m lnk" style={{ marginLeft: 'auto' }} onClick={() => router.push('/cart')}>
        ตะกร้า <span className="cb">{cartCount}</span>
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
  const add = async () => {
    try { await addToCart(p.id); notify('เพิ่มลงตะกร้าแล้ว'); } catch (e) { notify(e.message); }
  };
  return (
    <div className="pc">
      <Link href={`/products/${p.id}`}><Cover src={p.cover_url} label="COVER 4:3" /></Link>
      <div className="pcb">
        <span className="tag">{p.category}</span>
        <Link href={`/products/${p.id}`} className="pt">{p.name}</Link>
        {showDesc && p.excerpt && <p className="pd">{p.excerpt}</p>}
        <div className="prow">
          <span className="pp">{baht(p.price)}</span>
          <button className="btn" onClick={add}>เพิ่มลงตะกร้า</button>
        </div>
      </div>
    </div>
  );
}

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
