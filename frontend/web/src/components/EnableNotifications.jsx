// Gentle, user-initiated "Enable notifications" control (style a — never an
// auto-prompt). Permission is requested ONLY on the user's tap. Renders nothing
// on unsupported browsers or when no VAPID key is configured.
//
// Role-agnostic — used by both the student and teacher portals. lib/push.js posts
// to /api/me/push-subscription, which is gated for students AND teachers and keys
// the row by the JWT's user_id, so the same control works for either role.
//
// Two variants:
//   - "banner" (Dashboard): shows only while actionable (can enable); hides once
//     on or blocked, so it never nags.
//   - "row" (Profile): always shows the current state with an on/off control.
//
// Standalone component so the push UI/states stay separate and easy to debug.
import React, { useState, useEffect } from 'react';
import { hf, hfText } from '@/lib/styles';
import { I } from '@/components/icons';
import { Btn } from '@/components/ui/primitives';
import {
  pushConfigured, notificationPermission,
  subscribeToPush, unsubscribeFromPush, getExistingSubscription,
} from '@/lib/push';

const Shell = ({ tone = 'primary', children }) => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
    padding: '12px 14px', borderRadius: 12,
    background: tone === 'primary' ? hf.primarySoft : hf.surface2,
    border: `1px solid ${tone === 'primary' ? hf.primaryEdge : hf.borderS}`,
  }}>
    <span style={{ color: tone === 'primary' ? hf.primary : hf.muted, display: 'inline-flex', flexShrink: 0 }}>{I.bell}</span>
    {children}
  </div>
);

const Text = ({ title, subtitle }) => (
  <div style={{ flex: 1, minWidth: 150 }}>
    <div style={{ ...hfText.body, fontWeight: 650, color: hf.ink }}>{title}</div>
    {subtitle && <div style={{ ...hfText.small, color: hf.ink2, marginTop: 1 }}>{subtitle}</div>}
  </div>
);

export function EnableNotifications({ variant = 'banner' }) {
  const supported = pushConfigured();
  const [perm, setPerm] = useState(() => (supported ? notificationPermission() : 'denied'));
  const [subscribed, setSubscribed] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    if (!supported) { setReady(true); return; }
    let alive = true;
    getExistingSubscription().then((s) => { if (alive) { setSubscribed(!!s); setReady(true); } });
    return () => { alive = false; };
  }, [supported]);

  if (!supported || !ready) return null; // unsupported/unconfigured → hidden; avoid flicker

  // Tap handler — requests permission inside the user gesture, then subscribes.
  const enable = async () => {
    setErr('');
    setBusy(true);
    try {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') return; // denied/dismissed → stop, no nagging
      await subscribeToPush();
      setSubscribed(true);
    } catch (e) {
      setErr(e.message || 'Could not enable notifications.');
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setErr('');
    setBusy(true);
    try {
      await unsubscribeFromPush();
      setSubscribed(false);
    } catch (e) {
      setErr(e.message || 'Could not turn off notifications.');
    } finally {
      setBusy(false);
    }
  };

  const isOn = perm === 'granted' && subscribed;
  const isBlocked = perm === 'denied';

  // Dashboard banner only appears while there's an action to take — once on or
  // blocked, it disappears so it never nags.
  if (variant === 'banner' && (isOn || isBlocked)) return null;

  if (isOn) {
    return (
      <Shell tone="neutral">
        <Text title="Notifications on" subtitle="You'll get alerts for new notices and homework." />
        <Btn variant="ghost" size="sm" onClick={disable} disabled={busy}>{busy ? '…' : 'Turn off'}</Btn>
      </Shell>
    );
  }

  if (isBlocked) {
    return (
      <Shell tone="neutral">
        <Text title="Notifications blocked" subtitle="Allow notifications for this site in your browser settings to turn them on." />
      </Shell>
    );
  }

  // Default / can-enable.
  return (
    <Shell tone="primary">
      <Text title="Get notified" subtitle="Turn on alerts for new notices, homework and results." />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <Btn variant="primary" size="sm" onClick={enable} disabled={busy}>{busy ? 'Enabling…' : 'Enable'}</Btn>
        {err && <span style={{ ...hfText.small, color: hf.accent }}>{err}</span>}
      </div>
    </Shell>
  );
}
