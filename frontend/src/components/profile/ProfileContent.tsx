'use client';

import type { UserProfile, UserStatistics, CourseInProgress } from '@/types/course';
import MisCompras from './MisCompras';
import StudentHeader from '@/components/shared/StudentHeader';
import BackLink from '@/components/shared/BackLink';
import styles from './ProfileContent.module.css';
import AnimalAvatar from '@/components/shared/AnimalAvatar';

interface ProfileContentProps {
  profile: UserProfile;
  statistics: UserStatistics;
  coursesInProgress: CourseInProgress[];
  avatarUrl?: string | null;
  onEditClick?: () => void;
  onAvatarClick?: () => void;
}

export default function ProfileContent({ profile, statistics, coursesInProgress, avatarUrl, onEditClick, onAvatarClick }: ProfileContentProps) {
  return (
    <div className={styles.container}>
      {/* Misma barra que el resto de las vistas del alumno: logo, Dashboard /
          Mi progreso / Certificados y menú de usuario. */}
      <StudentHeader />

      <main className={styles.main}>
        <div className={styles.titleBlock}>
          <BackLink href="/cursos">Volver al Dashboard</BackLink>
          <h1 className={styles.pageTitle}>Mi perfil</h1>
        </div>

        <div className={styles.profileCard}>
          <div className={styles.profileHeader}>
            <div className={styles.avatarWrapper}>
              {avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={avatarUrl} alt={profile.name} className={styles.avatarImg} />
              ) : (
                <div className={styles.avatar} style={{ overflow: 'hidden', background: 'none' }}><AnimalAvatar seed={profile.id || profile.email} /></div>
              )}
              {onAvatarClick && (
                <button className={styles.changeAvatarBtn} onClick={onAvatarClick} title="Cambiar foto de perfil">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </button>
              )}
            </div>
            <div className={styles.profileInfo}>
              <h2 className={styles.profileName}>{profile.name}</h2>
              <p className={styles.profileEmail}>{profile.email}</p>
              <button className={styles.editButton} onClick={onEditClick}>Editar perfil</button>
            </div>
          </div>
        </div>

        <div className={styles.statsCard}>
          <h3 className={styles.cardTitle}>Estadísticas</h3>
          <div className={styles.statsGrid}>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{statistics.coursesEnrolled}</span>
              <span className={styles.statLabel}>Cursos inscritos</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{statistics.coursesCompleted}</span>
              <span className={styles.statLabel}>Cursos completados</span>
            </div>
            <div className={styles.statItem}>
              <span className={styles.statValue}>{statistics.totalTime}</span>
              <span className={styles.statLabel}>Tiempo total</span>
            </div>
          </div>
        </div>

        <div className={styles.infoCard}>
          <h3 className={styles.cardTitle}>Información personal</h3>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Nombre completo</span>
              <span className={styles.infoValue}>{profile.name}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Correo electrónico</span>
              <span className={styles.infoValueLink}>{profile.email}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Teléfono</span>
              <span className={styles.infoValue}>{profile.phone || '—'}</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Organización</span>
              <span className={styles.infoValue}>{profile.organizacion?.nombre || 'Sin organización'}</span>
            </div>
          </div>
        </div>

        <div className={styles.coursesCard}>
          <h3 className={styles.cardTitle}>Cursos en progreso</h3>
          <div className={styles.coursesList}>
            {coursesInProgress.length === 0 && (
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem', margin: 0 }}>
                No tienes cursos en progreso. Los cursos completados aparecen en <strong>Mis cursos</strong>.
              </p>
            )}
            {coursesInProgress.map((course) => (
              <div key={course.id} className={styles.courseItem}>
                <div className={styles.courseNumber}>
                  {String(course.order).padStart(2, '0')}
                </div>
                <div className={styles.courseInfo}>
                  <span className={styles.courseTitle}>{course.title}</span>
                  <span className={styles.courseProgress}>{course.progress}% completado</span>
                </div>
                <div className={styles.progressBarContainer}>
                  <div
                    className={styles.progressBar}
                    style={{ width: `${course.progress}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <MisCompras />
      </main>
    </div>
  );
}
