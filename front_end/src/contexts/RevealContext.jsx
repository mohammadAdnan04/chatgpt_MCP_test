'use client';
import React from 'react';
import { useAuth } from '@/contexts/AuthContext';
const config = { apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000' };
const Ctx = React.createContext(null);
export function RevealProvider({ children }) {
  const { isAuthenticated } = useAuth();
  const [revealed, setRevealed] = React.useState(new Map());
  const [realtimeData, setRealtimeData] = React.useState(new Map());
  const normalize = React.useCallback((u) => {
    try {
      if (!u) return "";
      const url = new URL(String(u).trim());
      url.hash = "";
      url.search = "";
      const host = url.hostname.toLowerCase();
      const proto = url.protocol.toLowerCase();
      const path = url.pathname.toLowerCase().replace(/\/+$/,"/");
      return `${proto}//${host}${path}`;
    } catch {
      return String(u || "").trim();
    }
  }, []);
  const mark = React.useCallback((profileUrl, type) => {
    if (!profileUrl || !type) return;
    setRevealed(prev => {
      const next = new Map(prev);
      const key = normalize(profileUrl);
      const cur = next.get(key) || {};
      next.set(key, { ...cur, [type]: true });
      return next;
    });
  }, [normalize]);
  React.useEffect(() => {
    if (!isAuthenticated) return;
    const url = `${config.apiUrl}/api/reveal/stream`;
    let es;
    try {
      es = new EventSource(url, { withCredentials: true });
      es.addEventListener('reveal-recorded', (e) => {
        try {
          const data = JSON.parse(e.data || '{}');
          const p = data.profileUrl;
          const types = Array.isArray(data.types) ? data.types : [];
          types.forEach(t => mark(p, t));

          if (p && (data.emails || data.phones || data.technologies || data.facebook_url || data.twitter_url || data.annual_revenue)) {
             setRealtimeData(prev => {
                const next = new Map(prev);
                const key = normalize(p);
                const cur = next.get(key) || {};
                next.set(key, { 
                   ...cur, 
                   ...(data.emails ? { emails: data.emails } : {}),
                   ...(data.email_status ? { email_status: data.email_status } : {}),
                   ...(data.phones ? { phones: data.phones } : {}),
                   ...(data.phone_status ? { phone_status: data.phone_status } : {}),
                   ...(data.technologies ? { technologies: data.technologies } : {}),
                   ...(data.facebook_url ? { facebook_url: data.facebook_url } : {}),
                   ...(data.twitter_url ? { twitter_url: data.twitter_url } : {}),
                   ...(data.annual_revenue ? { annual_revenue: data.annual_revenue } : {}),
                   ...(data.total_funding ? { total_funding: data.total_funding } : {}),
                   ...(data.latest_funding ? { latest_funding: data.latest_funding } : {}),
                   ...(data.latest_funding_amount ? { latest_funding_amount: data.latest_funding_amount } : {}),
                   ...(data.last_raised_at ? { last_raised_at: data.last_raised_at } : {})
                });
                return next;
             });
          }
        } catch {}
      });
    } catch {}
    return () => { try { es && es.close(); } catch {} };
  }, [isAuthenticated, mark]);
  const isRevealed = React.useCallback((profileUrl, type) => {
    if (!profileUrl || !type) return false;
    const cur = revealed.get(normalize(profileUrl));
    return !!(cur && cur[type]);
  }, [revealed, normalize]);
  const hydrate = React.useCallback((profileUrl, types) => {
    if (!profileUrl) return;
    const arr = Array.isArray(types) ? types : [];
    arr.forEach(t => mark(profileUrl, t));
  }, [mark]);
  const getRealtimeData = React.useCallback((profileUrl) => {
    if (!profileUrl) return null;
    return realtimeData.get(normalize(profileUrl));
  }, [realtimeData, normalize]);
  const value = React.useMemo(() => ({ isRevealed, markRevealed: mark, hydrate, getRealtimeData }), [isRevealed, mark, hydrate, getRealtimeData]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
export function useReveal() {
  return React.useContext(Ctx) || { isRevealed: () => false, markRevealed: () => {}, hydrate: () => {}, getRealtimeData: () => null };
}
