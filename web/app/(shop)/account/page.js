'use client';
import Link from 'next/link';
import { useStore } from '../../../lib/store';
import { SignedOut } from '../../../components/ui';

// "บัญชี" tab: entry point to library / order history
export default function Account() {
  const { user, signOut } = useStore();
  if (user === null) return <SignedOut title="บัญชีของฉัน" text="เข้าสู่ระบบเพื่อดูคลังและประวัติคำสั่งซื้อ" next="/account" />;
  if (!user) return null;
  return (
    <div className="card pad stack" style={{ maxWidth: 480 }}>
      <h1 className="h1">{user.name}</h1>
      <span className="mut">{user.email}</span>
      <Link className="btn2 btnl" href="/library">คลังของฉัน</Link>
      <Link className="btn2 btnl" href="/orders">ประวัติคำสั่งซื้อ</Link>
      {user.role === 'admin' && <Link className="btn2 btnl" href="/admin">ระบบหลังร้าน</Link>}
      <button className="btn2 btnl danger" onClick={signOut}>ออกจากระบบ</button>
    </div>
  );
}
