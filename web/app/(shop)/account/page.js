'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { SignedOut } from '../../../components/ui';

// "บัญชี" tab: entry point to library / order history
export default function Account() {
  const { user, signOut, notify } = useStore();
  const verified = useSearchParams().get('verified'); // set by the redirect from GET /api/auth/verify
  const [busy, setBusy] = useState(false);
  // shown signed out too: the link is often opened on another device than the one that registered
  const notice = verified === '1' ? <div className="alert ok">ยืนยันอีเมลเรียบร้อยแล้ว</div>
    : verified === '0' ? <div className="alert">! ลิงก์ยืนยันไม่ถูกต้องหรือหมดอายุ — เข้าสู่ระบบแล้วกด “ส่งลิงก์ยืนยันอีกครั้ง”</div>
    : null;

  if (user === null) return (
    <div className="stack">
      {notice}
      <SignedOut title="บัญชีของฉัน" text="เข้าสู่ระบบเพื่อดูคลังและประวัติคำสั่งซื้อ" next="/account" />
    </div>
  );
  if (!user) return null;

  const resend = () => {
    setBusy(true);
    api('/auth/verify/send', { method: 'POST' })
      .then(() => notify(`ส่งลิงก์ยืนยันไปที่ ${user.email} แล้ว`), (e) => notify(e.message))
      .finally(() => setBusy(false));
  };
  return (
    <div className="card pad stack" style={{ maxWidth: 480 }}>
      {notice}
      <h1 className="h1">{user.name}</h1>
      <span className="mut">{user.email}</span>
      {!user.email_verified && (
        <div className="test">
          <span>ยังไม่ได้ยืนยันอีเมล — ใบเสร็จและลิงก์กู้คืนรหัสผ่านจะส่งไปที่อีเมลนี้</span>
          <button className="lnk" disabled={busy} onClick={resend}>ส่งลิงก์ยืนยันอีกครั้ง</button>
        </div>
      )}
      <Link className="btn2 btnl" href="/library">คลังของฉัน</Link>
      <Link className="btn2 btnl" href="/orders">ประวัติคำสั่งซื้อ</Link>
      {user.role === 'admin' && <Link className="btn2 btnl" href="/admin">ระบบหลังร้าน</Link>}
      <button className="btn2 btnl danger" onClick={signOut}>ออกจากระบบ</button>
    </div>
  );
}
