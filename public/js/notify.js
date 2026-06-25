/* ============================================================================
 * notify.js — real device notifications.
 *   • Native iOS/Android (Capacitor)  → @capacitor/local-notifications bridge
 *   • Browser / installed PWA          → Web Notifications API (via service worker)
 * Degrades to a no-op (returns false) if unsupported or not permitted.
 * ==========================================================================*/
const capPlugin = () => (typeof window !== 'undefined' && window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null;

export function notifyState() {
  if (capPlugin()) return 'native';
  if (typeof Notification !== 'undefined') return Notification.permission; // 'granted' | 'denied' | 'default'
  return 'unsupported';
}

export async function requestNotifyPermission() {
  const ln = capPlugin();
  if (ln) { try { const r = await ln.requestPermissions(); return r.display === 'granted'; } catch { return false; } }
  if (typeof Notification !== 'undefined') { try { return (await Notification.requestPermission()) === 'granted'; } catch { return false; } }
  return false;
}

let _id = 1;
export async function notify(title, body) {
  const ln = capPlugin();
  if (ln) {
    try { await ln.schedule({ notifications: [{ id: (_id++ % 100000) + 1, title, body, schedule: { at: new Date(Date.now() + 300) } }] }); return true; }
    catch (e) { console.warn('[notify] native failed', e); }
  }
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const reg = navigator.serviceWorker && await navigator.serviceWorker.getRegistration();
      if (reg && reg.showNotification) await reg.showNotification(title, { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'sa-fc', renotify: true });
      else new Notification(title, { body, icon: 'icon-192.png' });
      return true;
    } catch (e) { console.warn('[notify] web failed', e); }
  }
  return false;
}
