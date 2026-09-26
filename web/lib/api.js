export const CATS = {
  ebook: 'อีบุ๊ก', template: 'เทมเพลต', 'source-code': 'ซอร์สโค้ด',
  'online-course': 'คอร์สออนไลน์', 'design-assets': 'ไฟล์กราฟิก',
};
export const baht = (n) => '฿' + Number(n ?? 0).toLocaleString('th-TH');
export const when = (d, time = true) =>
  d ? new Date(d).toLocaleString('th-TH', time ? { dateStyle: 'medium', timeStyle: 'short' } : { dateStyle: 'medium' }) : '';
export const mb = (b) => (b ? `${(b / 1048576).toFixed(1)} MB` : '');

// localStorage can throw (private mode, blocked storage): never let that break a page
export const store = {
  get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

export async function api(path, { method = 'GET', body } = {}) {
  const token = store.get('token');
  const res = await fetch('/api' + path, {
    method,
    headers: { ...(token && { Authorization: `Bearer ${token}` }), ...(body && { 'Content-Type': 'application/json' }) },
    body: body && JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  if (!res.ok) throw Object.assign(new Error(data?.error || 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง'), { status: res.status, data });
  return data;
}

// Multipart upload with progress (fetch can't report upload progress). Returns { promise, abort }.
export function upload(path, method, formData, onProgress) {
  const xhr = new XMLHttpRequest();
  const promise = new Promise((resolve, reject) => {
    xhr.open(method, '/api' + path);
    const token = store.get('token');
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded, e.total);
    xhr.onload = () => {
      let data = null;
      try { data = JSON.parse(xhr.responseText); } catch {}
      xhr.status < 300 ? resolve(data)
        : reject(Object.assign(new Error(data?.error || 'บันทึกไม่สำเร็จ'), { status: xhr.status, data }));
    };
    xhr.onerror = () => reject(new Error('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้'));
    xhr.onabort = () => reject(Object.assign(new Error('ยกเลิกการอัปโหลดแล้ว'), { aborted: true }));
    xhr.send(formData);
  });
  return { promise, abort: () => xhr.abort() };
}

// App Inventor's WebViewer can't download files. The app listens for WebViewStringChange
// and opens the URL with an ActivityStarter (Chrome). Plain browsers just open it.
export function openExternal(url) {
  if (typeof window !== 'undefined' && window.AppInventor) window.AppInventor.setWebViewString(url);
  else window.location.href = url;
}
