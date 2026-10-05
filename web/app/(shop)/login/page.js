'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '../../../lib/api';
import { useStore } from '../../../lib/store';

const rules = {
  name: (v) => !v.trim() && 'กรุณากรอกชื่อ-นามสกุล',
  email: (v) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) && 'รูปแบบอีเมลไม่ถูกต้อง',
  password: (v) => v.length < 8 && 'รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร',
};

// [1] Auth — one page, two tabs, switched in place
export default function Login() {
  const sp = useSearchParams();
  const router = useRouter();
  const { signIn } = useStore();
  const [tab, setTab] = useState(sp.get('tab') === 'register' ? 'register' : 'login');
  const [f, setF] = useState({ name: '', email: '', password: '', confirm: '', remember: false });
  const [touched, setTouched] = useState({});
  const [show, setShow] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null); // "check your mail"
  const [unverified, setUnverified] = useState(false); // the last login was refused for an unverified address
  const [busy, setBusy] = useState(false);

  const reg = tab === 'register';
  const errs = reg ? {
    name: rules.name(f.name), email: rules.email(f.email), password: rules.password(f.password),
    confirm: f.confirm !== f.password && 'รหัสผ่านไม่ตรงกัน',
  } : {};
  const valid = !Object.values(errs).some(Boolean);

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setError(null); setNotice(null); setUnverified(false);
    try {
      const r = reg
        ? await api('/auth/register', { method: 'POST', body: { name: f.name, email: f.email, password: f.password } })
        : await api('/auth/login', { method: 'POST', body: { email: f.email, password: f.password, remember: f.remember } });
      if (!r.token) { // registered: there is no session until the emailed link is opened
        setTab('login'); setTouched({}); setF({ ...f, password: '', confirm: '' });
        setNotice(`ส่งลิงก์ยืนยันไปที่ ${r.user.email} แล้ว กดลิงก์ในอีเมลก่อน แล้วกลับมาเข้าสู่ระบบ (ลิงก์ใช้ได้ 24 ชั่วโมง)`);
        return;
      }
      await signIn(r.token);
      const next = sp.get('next');
      router.replace(next?.startsWith('/') && !next.startsWith('//') ? next : '/'); // only same-site redirects
    } catch (e) {
      const left = e.data?.attemptsLeft;
      setUnverified(e.data?.code === 'email_unverified');
      setError(e.status === 423 ? 'บัญชีถูกล็อก 15 นาทีเพราะใส่รหัสผิดหลายครั้ง'
        : `${e.message}${left != null ? ` · ลองได้อีก ${left} ครั้งก่อนบัญชีถูกล็อก 15 นาที` : ''}`);
    } finally {
      setBusy(false);
    }
  }

  // The server answers 204 whether or not it sent anything (it won't say if the address has an account).
  const resend = () => api('/auth/verify/send', { method: 'POST', body: { email: f.email } }).then(
    () => { setError(null); setUnverified(false); setNotice(`ส่งลิงก์ยืนยันไปที่ ${f.email} แล้ว (ส่งได้นาทีละ 1 ฉบับ) หากไม่พบให้ดูในโฟลเดอร์สแปม`); },
    (e) => setError(e.message));

  const field = (k, label, type = 'text', ph) => (
    <div className="fld">
      <label className="lbl" htmlFor={k}>{label}</label>
      <input id={k} className={`inp ${touched[k] && errs[k] ? 'bad' : ''}`} type={type} placeholder={ph} value={f[k]}
        onChange={(e) => setF({ ...f, [k]: e.target.value })} onBlur={() => setTouched({ ...touched, [k]: true })} required />
      {touched[k] && errs[k] && <div className="err">{errs[k]}</div>}
    </div>
  );

  return (
    <div className="card pad" style={{ maxWidth: 440, margin: '24px auto' }}>
      <div className="chips" style={{ marginBottom: 20 }}>
        <button className={`chip ${!reg ? 'on' : ''}`} onClick={() => setTab('login')}>เข้าสู่ระบบ</button>
        <button className={`chip ${reg ? 'on' : ''}`} onClick={() => setTab('register')}>สมัครสมาชิก</button>
      </div>
      <h1 className="h1">{reg ? 'สมัครสมาชิก' : 'ยินดีต้อนรับกลับมา'}</h1>
      <p className="mut">{reg ? 'สร้างบัญชีเพื่อซื้อและดาวน์โหลดสินค้าดิจิทัล' : 'เข้าสู่ระบบเพื่อเข้าถึงคลังสินค้าดิจิทัลของคุณ'}</p>
      {notice && <div className="alert ok" role="status" style={{ marginBottom: 16 }}>{notice}</div>}
      {error && (
        <div className="alert" style={{ marginBottom: 16 }}>
          ! {error} {unverified && <button type="button" className="lnk" onClick={resend}>ส่งลิงก์ยืนยันอีกครั้ง</button>}
        </div>
      )}
      <form onSubmit={submit}>
        {reg && field('name', 'ชื่อ-นามสกุล')}
        {field('email', 'อีเมล', 'email', 'you@example.com')}
        <div className="fld">
          <label className="lbl" htmlFor="password">รหัสผ่าน</label>
          <div style={{ position: 'relative' }}>
            <input id="password" className={`inp ${touched.password && errs.password ? 'bad' : ''}`} type={show ? 'text' : 'password'}
              value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })}
              onBlur={() => setTouched({ ...touched, password: true })} required />
            <button type="button" className="lnk mono" style={{ position: 'absolute', right: 12, top: 12, fontSize: 11 }} onClick={() => setShow(!show)}>{show ? 'HIDE' : 'SHOW'}</button>
          </div>
          {touched.password && errs.password && <div className="err">{errs.password}</div>}
        </div>
        {reg && field('confirm', 'ยืนยันรหัสผ่าน', 'password')}
        {!reg && (
          <div className="between fld">
            <label className="row"><input type="checkbox" checked={f.remember} onChange={(e) => setF({ ...f, remember: e.target.checked })} />จำฉันไว้</label>
            <Link href="/reset">ลืมรหัสผ่าน?</Link>
          </div>
        )}
        <button className="btn btnl" disabled={busy || !valid}>{reg ? 'สมัครสมาชิก' : 'เข้าสู่ระบบ'}</button>
      </form>
    </div>
  );
}
