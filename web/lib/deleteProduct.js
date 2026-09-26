'use client';
import { useState } from 'react';
import { api } from './api';
import { Modal } from '../components/ui';

// [11]-B delete flow, shared by the product list and the product form.
// Always confirm; if the server refuses (409: already purchased) offer "switch to DRAFT" instead.
export function useDeleteProduct(onDone) {
  const [target, setTarget] = useState(null);   // product being deleted
  const [blocked, setBlocked] = useState(null); // 409 payload
  const [busy, setBusy] = useState(false);
  const close = () => { setTarget(null); setBlocked(null); };

  async function confirm() {
    setBusy(true);
    try {
      await api(`/admin/products/${target.id}`, { method: 'DELETE' });
      close(); onDone('deleted');
    } catch (e) {
      if (e.status === 409) setBlocked(e.data ?? {});
      else { alert(e.message); close(); }
    } finally { setBusy(false); }
  }
  async function toDraft() {
    setBusy(true);
    await api('/admin/products', { method: 'PATCH', body: { ids: [target.id], status: 'DRAFT' } }).finally(() => setBusy(false));
    close(); onDone('drafted');
  }

  const modal = target && (
    <Modal onClose={close}>
      <h2 className="h2">ลบสินค้านี้?</h2>
      {blocked ? (
        <>
          <p>“{target.name}” มีผู้ซื้อแล้ว{blocked.buyers != null && ` ${blocked.buyers.toLocaleString('th-TH')} ราย`}</p>
          <div className="alert">! ลบไม่ได้ เพราะจะทำให้ลูกค้าเดิมดาวน์โหลดไฟล์ไม่ได้ — ให้เปลี่ยนสถานะเป็น DRAFT เพื่อถอนออกจากหน้าร้านแทน</div>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn2" onClick={close}>ยกเลิก</button>
            <button className="btn" disabled={busy} onClick={toDraft}>เปลี่ยนเป็น DRAFT</button>
          </div>
        </>
      ) : (
        <>
          <p>“{target.name}” จะถูกลบถาวร พร้อมไฟล์และภาพปก</p>
          <div className="row" style={{ justifyContent: 'flex-end', marginTop: 20 }}>
            <button className="btn2" onClick={close}>ยกเลิก</button>
            <button className="btn danger" disabled={busy} onClick={confirm}>ลบสินค้า</button>
          </div>
        </>
      )}
    </Modal>
  );
  return { ask: setTarget, modal };
}
