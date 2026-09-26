'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { Logo, Narrow } from '../../../components/ui';

// [14] Admin login — separate from customer login: no signup, no OAuth, always lands on the dashboard
export default function AdminLogin() {
  const router = useRouter();
  const { signIn } = useStore();
  const [f, setF] = useState({ email: '', password: '', remember: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      const r = await api('/auth/admin/login', { method: 'POST', body: f });
      await signIn(r.token);
      router.replace('/admin');
    } catch (e) {
      setError(e.status === 403 ? { t: 'บัญชีนี้ไม่มีสิทธิ์เข้าถึงระบบหลังร้าน', s: 'หากคุณเป็นลูกค้า กรุณาเข้าสู่ระบบที่หน้าร้าน' }
        : e.status === 423 ? { t: 'บัญชีถูกล็อก 15 นาที', s: 'ใส่รหัสผิดเกิน 5 ครั้ง' }
        : { t: e.message, s: e.data?.attemptsLeft != null ? `ลองได้อีก ${e.data.attemptsLeft} ครั้ง` : '' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="narrow"><Narrow /></div>
      <div className="adm">
        <div style={{ flex: 1, background: '#1b1d22', color: '#fff', padding: 64, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <span className="mono" style={{ color: '#a9aeb8', fontSize: 11 }}>ADMIN CONSOLE</span>
          <h1 className="h1" style={{ fontSize: 32 }}>ระบบหลังร้าน</h1>
          <p style={{ color: '#a9aeb8', maxWidth: 420 }}>จัดการสินค้า ตรวจคำสั่งซื้อ และดูยอดขายของร้าน — สำหรับผู้ดูแลระบบเท่านั้น</p>
          <ul style={{ color: '#d6d9df', lineHeight: 2 }}><li>แดชบอร์ดยอดขาย</li><li>เพิ่มและแก้ไขสินค้า</li><li>ตรวจคำสั่งซื้อและการชำระเงิน</li></ul>
        </div>
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: '#fff' }}>
          <form onSubmit={submit} style={{ width: 380 }}>
            <Logo />
            <h2 className="h1" style={{ marginTop: 24 }}>เข้าสู่ระบบแอดมิน</h2>
            <p className="mut">ใช้บัญชีผู้ดูแลระบบที่ได้รับสิทธิ์แล้วเท่านั้น</p>
            {error && <div className="alert fld"><div><b>! {error.t}</b><div>{error.s}</div></div></div>}
            <div className="fld"><label className="lbl">อีเมลผู้ดูแลระบบ</label>
              <input className="inp" type="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
            <div className="fld"><label className="lbl">รหัสผ่าน</label>
              <input className="inp" type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>
            <label className="row fld"><input type="checkbox" checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} />จำอุปกรณ์นี้ไว้ 30 วัน</label>
            <button className="btn btnl" disabled={busy}>เข้าสู่ระบบ</button>
            <p className="mut" style={{ fontSize: 12 }}>หน้านี้ไม่มีปุ่มสมัครสมาชิก · สิทธิ์แอดมินกำหนดจากฐานข้อมูลเท่านั้น</p>
            <p>เป็นลูกค้า? <Link href="/login">เข้าสู่ระบบที่หน้าร้าน</Link></p>
          </form>
        </div>
      </div>
    </>
  );
}
