const DATABASE = 'novel-agent-reference-library-v1';
const OBJECT_STORE = 'workspaces';

async function openReferenceDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let blocked = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(OBJECT_STORE)) request.result.createObjectStore(OBJECT_STORE); };
    request.onsuccess = () => { if (blocked) request.result.close(); else resolve(request.result); };
    request.onerror = () => reject(new Error('无法打开参考资料库，请检查浏览器存储权限。'));
    request.onblocked = () => { blocked = true; reject(new Error('参考资料库升级被其他页面阻止，请关闭其他应用标签页后刷新。')); };
  });
}

export async function readReferenceWorkspace(key: string): Promise<unknown> {
  const database = await openReferenceDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE, 'readonly');
      const request = transaction.objectStore(OBJECT_STORE).get(key);
      transaction.oncomplete = () => resolve(request.result);
      transaction.onabort = transaction.onerror = () => reject(new Error('参考资料读取失败，原有数据未被覆盖。'));
    });
  } finally { database.close(); }
}

export async function writeReferenceWorkspace(key: string, data: unknown): Promise<void> {
  const database = await openReferenceDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(OBJECT_STORE, 'readwrite');
      transaction.objectStore(OBJECT_STORE).put(data, key);
      transaction.oncomplete = () => resolve();
      transaction.onabort = transaction.onerror = () => reject(new Error('参考资料未保存：浏览器空间不足或不允许写入。当前文字仍保留在页面，请导出备份后重试。'));
    });
  } catch { throw new Error('参考资料未保存：浏览器空间不足或不允许写入。当前文字仍保留在页面，请导出备份后重试。'); }
  finally { database.close(); }
}
