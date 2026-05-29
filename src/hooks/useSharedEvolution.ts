import { useState, useEffect } from 'react';
import { api } from '@/services/api';

export function useSharedEvolution() {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function check() {
      try {
        const data = (await api.get('system_settings', { key: 'shared_evolution' })) as any[];
        const row = data?.[0];
        setEnabled(!!row?.value?.enabled);
      } catch {
        setEnabled(false);
      } finally {
        setLoading(false);
      }
    }
    check();
  }, []);

  return loading ? false : enabled;
}