'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useStore } from '../../../lib/store';

// Forgot password — one page, two steps: no link params = ask for the email,
// opened from the emailed link (?u&exp&sig) = set the new password.
export default function Reset() {
  const sp = useSearchParams();
  const router = useRouter();
  const { notify, refresh } = useStore();
  const link = sp.get('sig') && { u: sp.get('u'), exp: sp.get('exp'), sig: sp.get('sig') };
  const [v, setV] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null);
    try {
      if (link) {
        await api('/auth/reset', { method: 'POST', body: { ...link, password: v } });
        await refresh(); // the reset signed every device out, this one included
        notify('ตั้งรหัสผ่านใหม่แล้ว เข้าสู่ระบบได้เลย');
        router.replace('/login');
      } else {
        await api('/auth/forgot', { method: 'POST', body: { email: v } });
        setSent(true);
      }
    } catch (e) {
      setError(e.data?.errors?.password ?? e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card pad" style={{ maxWidth: 440, margin: '24px auto' }}>
      <h1 className="h1">{link ? 'ตั้งรหัสผ่านใหม่' : 'ลืมรหัสผ่าน'}</h1>
      {sent ? (
        <div className="alert ok">หากอีเมลนี้มีบัญชีอยู่ เราส่งลิงก์ตั้งรหัสผ่านใหม่ไปให้แล้ว (ใช้ได้ 1 ชั่วโมง) หากไม่พบให้ดูในโฟลเดอร์สแปม</div>
      ) : (
        <form onSubmit={submit}>
          <p className="mut">{link ? 'กำหนดรหัสผ่านใหม่อย่างน้อย 8 ตัวอักษร' : 'กรอกอีเมลที่ใช้สมัคร เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ให้'}</p>
          {error && <div className="alert" style={{ marginBottom: 16 }}>! {error}</div>}
          <div className="fld">
            <label className="lbl" htmlFor="v">{link ? 'รหัสผ่านใหม่' : 'อีเมล'}</label>
            <input id="v" className="inp" type={link ? 'password' : 'email'} minLength={link ? 8 : undefined}
              autoComplete={link ? 'new-password' : 'email'} value={v} onChange={(e) => setV(e.target.value)} required />
          </div>
          <button className="btn btnl" disabled={busy}>{link ? 'บันทึกรหัสผ่านใหม่' : 'ส่งลิงก์ตั้งรหัสผ่าน'}</button>
        </form>
      )}
      <p style={{ marginBottom: 0 }}><Link href="/login">กลับไปหน้าเข้าสู่ระบบ</Link></p>
    </div>
  );
}
