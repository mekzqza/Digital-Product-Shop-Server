'use client';
import { useState } from 'react';
import { api, downloadFile } from '../../../../lib/api';
import { useStore } from '../../../../lib/store';

const SETS = [['products', 'สินค้า'], ['users', 'ผู้ใช้'], ['orders', 'ยอดขาย (คำสั่งซื้อ)']];

// Import / Export — CSV opens straight in Excel, JSON is for other systems
export default function Data() {
  const { notify } = useStore();
  const [busy, setBusy] = useState(false);
  const [fail, setFail] = useState(null); // { message, rows: [{ row, name, errors }] } from a rejected import

  const exp = (what, ext) =>
    downloadFile(`/admin/export/${what}?format=${ext}`, `${what}.${ext}`).catch((e) => notify(e.message));

  async function imp(e) {
    const input = e.target, file = input.files[0];
    if (!file) return;
    setBusy(true); setFail(null);
    try {
      const r = await api('/admin/import/products', { method: 'POST', body: await file.text() });
      notify(`นำเข้าสำเร็จ — เพิ่มใหม่ ${r.created} · อัปเดต ${r.updated} รายการ`);
    } catch (err) {
      setFail({ message: err.message, rows: err.data?.rows ?? [] });
    } finally {
      setBusy(false);
      input.value = ''; // so the same file can be picked again after fixing it
    }
  }

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div><h1 className="h1">นำเข้า / ส่งออก</h1><span className="mut">CSV เปิดใน Excel ได้ทันที · JSON สำหรับเชื่อมกับระบบอื่น</span></div>

      <section className="card pad stack">
        <h2 className="h2">ส่งออก</h2>
        {SETS.map(([what, label]) => (
          <div key={what} className="between">
            <span>{label}</span>
            <div className="row">
              <button className="btn2" onClick={() => exp(what, 'csv')}>CSV</button>
              <button className="btn2" onClick={() => exp(what, 'json')}>JSON</button>
            </div>
          </div>
        ))}
      </section>

      <section className="card pad stack">
        <h2 className="h2">นำเข้าสินค้า</h2>
        <span className="mut">
          ใช้ไฟล์ที่ส่งออกจาก “สินค้า” เป็นแม่แบบ · แถวที่ไม่มี id = เพิ่มสินค้าใหม่เป็น DRAFT · แถวที่มี id = แก้ไขสินค้าเดิม
          · ถ้าแก้ใน Excel ให้บันทึกเป็น “CSV UTF-8”
        </span>
        {/* native file input: click to browse or drop a file on it */}
        <input type="file" accept=".csv,.json" disabled={busy} onChange={imp} aria-label="ไฟล์ CSV หรือ JSON" />
        {busy && <span className="mut">กำลังนำเข้า…</span>}
        {fail && (
          <div className="alert"><div>
            <b>! {fail.message}</b>
            {fail.rows.map((r) => (
              <div key={r.row}>แถวที่ {r.row}{r.name ? ` (${r.name})` : ''}: {Object.values(r.errors).join(' · ')}</div>
            ))}
          </div></div>
        )}
      </section>
    </div>
  );
}
