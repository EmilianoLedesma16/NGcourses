'use client';

import { avatarOf, conCambioDePerfil, useCambiosDePerfil, type PerfilCambio } from '@/lib/avatar';
import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { InstructorHeader } from './InstructorHeader';
import { InstructorSidebar } from './InstructorSidebar';
import { AccessNotice } from '@/components/shared/AccessNotice';
import { getCurrentUser } from '@/lib/auth';
import styles from './InstructorLayout.module.css';

interface InstructorLayoutProps {
  children: React.ReactNode;
}

export const InstructorLayout: React.FC<InstructorLayoutProps> = ({ children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [headerUser, setHeaderUser] = useState<{ name: string; initials: string; role: string; avatarUrl?: string | null; seed?: string } | undefined>(undefined);
  const router = useRouter();

  useEffect(() => {
    getCurrentUser().then((u) => {
      if (u.rol !== 'instructor') {
        router.replace('/');
        return;
      }
      const name = u.full_name || u.email;
      const stored = avatarOf(u);
      setHeaderUser({
        name,
        initials: name.slice(0, 2).toUpperCase(),
        seed: u.id,
        role: 'Instructor',
        avatarUrl: stored || null,
      });
    }).catch(() => {
      router.replace('/');
    });
  }, [router]);

  // Foto o nombre cambiados en la página de perfil: se reflejan sin recargar.
  const aplicarCambioDePerfil = useCallback(
    (c: PerfilCambio) => setHeaderUser((prev) => (prev ? conCambioDePerfil(prev, c) : prev)),
    [],
  );
  useCambiosDePerfil(aplicarCambioDePerfil);

  return (
    <div className={styles.container}>
      <InstructorHeader user={headerUser} onMenuClick={() => setSidebarOpen((o) => !o)} />

      <AccessNotice />
      <div className={styles.contentWrapper}>
        <InstructorSidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className={styles.main}>
          <div className={styles.content}>
            {headerUser && children}
          </div>
        </main>
      </div>
    </div>
  );
};
