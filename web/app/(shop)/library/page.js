'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, CATS, mb, when } from '../../../lib/api';
import { useStore } from '../../../lib/store';
import { useDownload } from '../../../lib/download';
import { Cover, Empty, SignedOut } from '../../../components/ui';

// [8] My library — only items from PAID orders
export default function Library() {
  const { user } = useStore();
  const [items, setItems] = useState(null);
  const [cat, setCat] = useState('');
  const [term, setTerm] = useState('');
  const { download, busy, error } = useDownload((id) =>
    setItems((xs) => xs.map((x) => (x.item_id === id ? { ...x, downloads: x.downloads + 1 } : x))));

  useEffect(() => { if (user) api('/library').then((r) => setItems(r.items)); }, [user]);

  if (user === null) return <SignedOut title="เข้าสู่ระบบเพื่อดูคลังของคุณ" text="สินค้าที่ซื้อแล้วผูกกับบัญชีของคุณ เข้าสู่ระบบด้วยบัญชีเดิมเพื่อดาวน์โหลดไฟล์ซ้ำ" next="/library" />;
  if (!items) return <div className="ph" style={{ height: 320 }} />;
  if (!items.length) return (
    <div className="card"><Empty title="คุณยังไม่มีสินค้าในคลัง" text="สินค้าที่ซื้อแล้วจะมาอยู่ที่นี่ทันทีหลังชำระเงินสำเร็จ และดาวน์โหลดซ้ำได้ตลอดอายุสิทธิ์">
      <Link className="btn" href="/">เลือกซื้อสินค้า</Link><Link className="btn2" href="/orders">ดูประวัติคำสั่งซื้อ</Link>
    </Empty></div>
  );

  const counts = items.reduce((m, x) => ({ ...m, [x.category]: (m[x.category] ?? 0) + 1 }), {});
  const shown = items.filter((x) => (!cat || x.category === cat) && x.name.toLowerCase().includes(term.toLowerCase()));

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div><h1 className="h1">คลังของฉัน</h1><span className="mut">สินค้าที่คุณเป็นเจ้าของ {items.length} รายการ · ดาวน์โหลดซ้ำได้ตลอดอายุสิทธิ์</span></div>
      <input className="inp" placeholder="ค้นหาในคลังของฉัน" value={term} onChange={(e) => setTerm(e.target.value)} style={{ maxWidth: 420 }} />
      <div className="chips">
        <button className={`chip ${!cat ? 'on' : ''}`} onClick={() => setCat('')}>ทั้งหมด {items.length}</button>
        {Object.entries(counts).map(([c, n]) => (
          <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{CATS[c]} {n}</button>
        ))}
      </div>
      <div className="card">
        {shown.map((x) => {
          const left = x.download_limit - x.downloads;
          const expired = new Date(x.expires_at) < new Date();
          return (
            <div key={x.item_id} className="between" style={{ padding: 16, borderBottom: '1px solid var(--ln2)', flexWrap: 'nowrap' }}>
              <div className="row" style={{ flexWrap: 'nowrap', minWidth: 0 }}>
                <Cover src={x.cover_url} className="thumb" label="" />
                <div style={{ minWidth: 0 }}>
                  <span className="tag">{x.category}</span>
                  <div className="pt">{x.name}</div>
                  <span className="mut mono" style={{ fontSize: 11 }}>{x.order_no}{x.version && ` · ${x.version}`} · ซื้อ {when(x.paid_at, false)}</span>
                  <div className="mut hide-m" style={{ fontSize: 12 }}>{x.file_types} · {mb(x.file_size)}</div>
                </div>
              </div>
              <div className="stack" style={{ alignItems: 'flex-end', gap: 4, flex: 'none', textAlign: 'right' }}>
                {left > 0 && !expired ? (
                  <>
                    <button className="btn" disabled={busy === x.item_id} onClick={() => download(x.item_id)}>
                      {busy === x.item_id ? 'กำลังเตรียมไฟล์…' : 'ดาวน์โหลด'}
                    </button>
                    <span className="mut" style={{ fontSize: 11 }}>ไฟล์จะเปิดในเบราว์เซอร์ภายนอก</span>
                    <span className="mut" style={{ fontSize: 11 }}>เหลือ {left}/{x.download_limit} ครั้ง · หมดอายุ {when(x.expires_at, false)}</span>
                  </>
                ) : (
                  <>
                    <a className="btn2" href={`mailto:support@sukpat.dev?subject=${encodeURIComponent(`ขอลิงก์ใหม่ ${x.order_no} ${x.name}`)}`}>ขอลิงก์ใหม่</a>
                    <span className="bad" style={{ fontSize: 11 }}>{expired ? 'สิทธิ์หมดอายุแล้ว' : `ใช้ครบ ${x.download_limit}/${x.download_limit} ครั้ง`} · ขอเพิ่มได้ทางอีเมล</span>
                  </>
                )}
                {error[x.item_id] && <span className="bad" style={{ fontSize: 11 }}>{error[x.item_id]}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
