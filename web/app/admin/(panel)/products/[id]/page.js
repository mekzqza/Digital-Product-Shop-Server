'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { api, CATS, mb, upload, when } from '../../../../../lib/api';
import { useStore } from '../../../../../lib/store';
import { useDeleteProduct } from '../../../../../lib/deleteProduct';
import { Modal, Status } from '../../../../../components/ui';

const MAX_DESC = 2000;
const check = {
  name: (v) => !v.trim() && 'กรุณากรอกชื่อสินค้า',
  category: (v) => !v && 'เลือกหมวดหมู่อย่างน้อย 1 หมวด',
  price: (v) => !(Number(v) > 0) && 'ราคาต้องมากกว่า 0',
  description: (v) => v.length > MAX_DESC && `ยาวเกิน ${MAX_DESC.toLocaleString()} ตัวอักษร`,
};

// [12] Product form — one form for create (/new) and edit
export default function ProductForm() {
  const { id } = useParams();
  const isNew = id === 'new';
  const router = useRouter();
  const { notify } = useStore();
  const [p, setP] = useState(null); // saved record
  const [f, setF] = useState({ name: '', category: '', price: '', compare_at: '', description: '', file_types: '', version: '', status: 'DRAFT' });
  const [cover, setCover] = useState(null); // File
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [dirty, setDirty] = useState(false);
  const [progress, setProgress] = useState(null); // { loaded, total }
  const [leave, setLeave] = useState(false);
  const xhr = useRef(null);
  const coverPreview = useMemo(() => cover && URL.createObjectURL(cover), [cover]);
  useEffect(() => () => coverPreview && URL.revokeObjectURL(coverPreview), [coverPreview]);
  const del = useDeleteProduct(() => { setDirty(false); router.push('/admin/products'); });

  useEffect(() => {
    if (isNew) return;
    api(`/admin/products/${id}`).then((r) => {
      setP(r);
      setF(Object.fromEntries(Object.keys(f).map((k) => [k, r[k] == null ? '' : String(r[k])])));
    });
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // browser-level guard for tab close / reload; in-app links use the modal below
  useEffect(() => {
    if (!dirty && !progress) return;
    const h = (e) => e.preventDefault();
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, progress]);

  const change = (k, v) => { setF({ ...f, [k]: v }); setDirty(true); };
  const blur = (k) => setErrors({ ...errors, [k]: check[k]?.(f[k]) || null });

  async function save(status) {
    const local = Object.fromEntries(Object.entries(check).map(([k, fn]) => [k, fn(f[k])]).filter(([, v]) => v));
    if (Object.keys(local).length) { setErrors(local); document.getElementById(Object.keys(local)[0])?.focus(); return; }
    const fd = new FormData();
    Object.entries({ ...f, status }).forEach(([k, v]) => fd.append(k, v));
    if (cover) fd.append('cover', cover);
    if (file) fd.append('file', file);
    setProgress({ loaded: 0, total: (cover?.size ?? 0) + (file?.size ?? 0) || 1 });
    const job = upload(isNew ? '/admin/products' : `/admin/products/${id}`, isNew ? 'POST' : 'PUT', fd,
      (loaded, total) => setProgress({ loaded, total }));
    xhr.current = job;
    try {
      await job.promise;
      setDirty(false);
      notify(status === 'PUBLISHED' ? 'บันทึกและเผยแพร่แล้ว' : 'บันทึกเป็น DRAFT แล้ว');
      router.push('/admin/products');
    } catch (e) {
      if (!e.aborted) {
        setErrors(e.data?.errors ?? {});
        const first = Object.keys(e.data?.errors ?? {})[0];
        if (first) document.getElementById(first)?.scrollIntoView({ block: 'center' });
        notify(e.message);
      }
    } finally {
      setProgress(null); xhr.current = null;
    }
  }

  if (!isNew && !p) return <div className="ph" style={{ height: 400 }} />;
  const errCount = Object.values(errors).filter(Boolean).length;
  const pct = progress ? Math.round((progress.loaded / progress.total) * 100) : 0;
  const coverUrl = coverPreview || p?.cover_url;
  const hasFile = file || p?.file;
  const field = (k, label, props = {}) => (
    <div className="fld" style={props.style}>
      <label className="lbl" htmlFor={k}>{label}</label>
      <input id={k} className={`inp ${errors[k] ? 'bad' : ''}`} value={f[k]} onChange={(e) => change(k, e.target.value)} onBlur={() => blur(k)} {...props} style={undefined} />
      {errors[k] && <div className="err">{errors[k]}</div>}
    </div>
  );

  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <span className="mut"><button className="lnk" onClick={() => (dirty ? setLeave(true) : router.push('/admin/products'))}>สินค้า</button> / {isNew ? 'เพิ่มสินค้าใหม่' : 'แก้ไขสินค้า'}</span>
        <div className="row"><h1 className="h1">{isNew ? 'เพิ่มสินค้าใหม่' : p.name}</h1><Status s={f.status} /></div>
        {p && <span className="mut">บันทึกล่าสุด {when(p.updated_at)} · {p.sku}</span>}
      </div>
      {errCount > 0 && <div className="alert">! บันทึกไม่สำเร็จ — มี {errCount} ช่องที่ต้องแก้</div>}

      <div className="split" style={{ gridTemplateColumns: '1fr 340px' }}>
        <div className="stack">
          <section className="card pad">
            <h2 className="h2 fld">ข้อมูลสินค้า</h2>
            {field('name', 'ชื่อสินค้า *', { placeholder: 'ระบุชื่อสินค้า' })}
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>
              <div className="fld" style={{ flex: 1 }}>
                <label className="lbl" htmlFor="category">หมวดหมู่ *</label>
                <select id="category" className={`inp ${errors.category ? 'bad' : ''}`} value={f.category} onChange={(e) => change('category', e.target.value)} onBlur={() => blur('category')}>
                  <option value="">เลือกหมวดหมู่</option>{Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v} · {k}</option>)}
                </select>
                {errors.category && <div className="err">{errors.category}</div>}
              </div>
              <div style={{ flex: 1 }}>{field('price', 'ราคา (บาท) *', { type: 'number', min: 1, step: '0.01' })}</div>
              <div style={{ flex: 1 }}>{field('compare_at', 'ราคาก่อนลด (ไม่บังคับ)', { type: 'number', min: 0, step: '0.01' })}</div>
            </div>
            <div className="fld">
              <label className="lbl" htmlFor="description">รายละเอียดสินค้า * <span className="mut">(รองรับ Markdown)</span></label>
              <textarea id="description" className={`inp ${errors.description ? 'bad' : ''}`} value={f.description}
                onChange={(e) => change('description', e.target.value)} onBlur={() => blur('description')} />
              <div className="between"><span className="err">{errors.description}</span>
                <span className={`mono ${f.description.length > MAX_DESC ? 'bad' : 'mut'}`} style={{ fontSize: 11 }}>{f.description.length.toLocaleString()} / {MAX_DESC.toLocaleString()} ตัวอักษร</span></div>
            </div>
          </section>

          <section className="card pad">
            <h2 className="h2 fld">ไฟล์สินค้า</h2>
            <div className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap', gap: 20 }}>
              <div className="fld" id="cover" style={{ width: 280 }}>
                <span className="lbl">ภาพปกสินค้า *</span>
                {coverUrl ? <img src={coverUrl} alt="" className="ph r32 card" /> : <div className="ph r32 card">COVER PREVIEW 1200×800</div>}
                <label className="btn2" style={{ marginTop: 8 }}>{coverUrl ? 'เปลี่ยนรูปปก' : 'เลือกรูปปก'}
                  <input type="file" accept="image/jpeg,image/png" hidden onChange={(e) => {
                    const c = e.target.files[0];
                    if (c && c.size > 2 * 1048576) return setErrors({ ...errors, cover: 'รูปปกต้องไม่เกิน 2 MB' });
                    setCover(c); setDirty(true); setErrors({ ...errors, cover: null });
                  }} />
                </label>
                <div className="mut" style={{ fontSize: 11, marginTop: 6 }}>JPG, PNG · ไม่เกิน 2 MB · อัตราส่วน 3:2</div>
                {errors.cover && <div className="err">{errors.cover}</div>}
              </div>
              <div className="fld" id="file" style={{ flex: 1 }}>
                <span className="lbl">ไฟล์สินค้าสำหรับดาวน์โหลด *</span>
                <div className={`card pad ${errors.file ? 'inp bad' : ''}`} style={{ height: 'auto' }}>
                  {progress && file ? (
                    <div className="stack" style={{ gap: 6 }}>
                      <div className="between"><b>{file.name}</b><button className="lnk" onClick={() => xhr.current?.abort()}>✕ ยกเลิก</button></div>
                      <div className="bar"><i style={{ width: `${pct}%` }} /></div>
                      <span className="mut mono" style={{ fontSize: 11 }}>กำลังอัปโหลด · {mb(progress.loaded)} / {mb(progress.total)} · {pct}%</span>
                    </div>
                  ) : hasFile ? (
                    <div className="between">
                      <span>✓ {file?.name ?? p.file_name} <span className="mut">· {mb(file?.size ?? p.file_size)}{file ? ' · จะอัปโหลดตอนบันทึก' : ''}</span></span>
                      <label className="btn2">เลือกไฟล์ใหม่<input type="file" accept=".zip,.pdf,.mp4" hidden onChange={(e) => { setFile(e.target.files[0]); setDirty(true); }} /></label>
                    </div>
                  ) : (
                    <label className="row" style={{ cursor: 'pointer' }}>ลากไฟล์มาวางที่นี่ หรือ <span className="btn2">เลือกไฟล์</span>
                      <input type="file" accept=".zip,.pdf,.mp4" hidden onChange={(e) => { setFile(e.target.files[0]); setDirty(true); setErrors({ ...errors, file: null }); }} />
                    </label>
                  )}
                </div>
                <div className="mut" style={{ fontSize: 11, marginTop: 6 }}>ZIP, PDF, MP4 · ไม่เกิน 500 MB · ห้ามปิดหน้านี้ระหว่างอัปโหลด</div>
                {errors.file && <div className="err">{errors.file}</div>}
                <div className="row" style={{ marginTop: 16, flexWrap: 'nowrap' }}>
                  <div style={{ flex: 1 }}>{field('file_types', 'ประเภทไฟล์ที่แสดงหน้าร้าน', { placeholder: 'XLSX · PDF' })}</div>
                  <div style={{ width: 120 }}>{field('version', 'เวอร์ชัน', { placeholder: 'v1.0' })}</div>
                </div>
              </div>
            </div>
          </section>
        </div>

        <aside className="stack sticky">
          <section className="card pad stack">
            <h2 className="h2">การเผยแพร่</h2>
            <label className="between" style={{ cursor: 'pointer' }}>
              <span>เผยแพร่ขึ้นร้าน</span>
              <input type="checkbox" role="switch" style={{ width: 20, height: 20 }} checked={f.status === 'PUBLISHED'}
                onChange={(e) => change('status', e.target.checked ? 'PUBLISHED' : 'DRAFT')} />
            </label>
            <span className="mut" style={{ fontSize: 12 }}>ปิดสวิตช์เพื่อเก็บเป็น DRAFT — สินค้าจะหายจากหน้าร้านแต่ลูกค้าเดิมยังดาวน์โหลดได้</span>
          </section>
          <section className="card pad stack" style={{ gap: 6 }}>
            <h2 className="h2">สรุปสถานะ</h2>
            {[[f.name && f.category && Number(f.price) > 0, 'กรอกข้อมูลสินค้าครบ'], [coverUrl, 'มีภาพปกสินค้า'], [hasFile, 'มีไฟล์สินค้า']].map(([ok, l]) => (
              <span key={l} className={ok ? 'up' : 'mut'}>{ok ? '✓' : '•'} {l}</span>
            ))}
          </section>
          {!isNew && (
            <section className="card pad stack">
              <h2 className="h2">ลบสินค้า</h2>
              <span className="mut" style={{ fontSize: 12 }}>สินค้าที่มีผู้ซื้อแล้วจะลบไม่ได้ ระบบจะเสนอเปลี่ยนเป็น DRAFT แทน</span>
              <button className="btn2 danger" onClick={() => del.ask(p)}>ลบสินค้านี้</button>
            </section>
          )}
        </aside>
      </div>

      <div className="foot">
        {dirty && <span className="mut" style={{ marginRight: 'auto' }}>มีการแก้ไขที่ยังไม่บันทึก</span>}
        <button className="btn2" onClick={() => (dirty || progress ? setLeave(true) : router.push('/admin/products'))}>ยกเลิก</button>
        <button className="btn2" disabled={!!progress} onClick={() => save('DRAFT')}>บันทึกเป็น DRAFT</button>
        <button className="btn" disabled={!!progress} onClick={() => save('PUBLISHED')}>{progress ? `กำลังอัปโหลด ${pct}%` : 'บันทึกและเผยแพร่'}</button>
      </div>

      {leave && (
        <Modal onClose={() => setLeave(false)}>
          <h2 className="h2">ออกจากหน้านี้?</h2>
          <p>การแก้ไขที่ยังไม่บันทึกจะหายไป{progress && ` และไฟล์ที่กำลังอัปโหลด (${pct}%) จะถูกยกเลิก`}</p>
          <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn2" onClick={() => setLeave(false)}>อยู่หน้านี้ต่อ</button>
            <button className="btn danger" onClick={() => { xhr.current?.abort(); setDirty(false); router.push('/admin/products'); }}>ออกและทิ้งการแก้ไข</button>
          </div>
        </Modal>
      )}
      {del.modal}
    </div>
  );
}
