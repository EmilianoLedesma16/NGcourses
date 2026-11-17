import Link from 'next/link';
import styles from './Dashboard.module.css';

/** Componentes de gráficas compartidos por el panel admin y el del supervisor. */

export interface EmbudoData { inscritos: number; sin_iniciar: number; en_curso: number; terminaron: number; certificados: number }
export interface SemanaData { inicio: string; inscripciones: number; lecciones_completadas: number }

export const n = (v: number) => v.toLocaleString('es-MX');
export const pct = (a: number, b: number) => (b > 0 ? Math.round((100 * a) / b) : 0);
export const semanaCorta = new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short' });

/* ── Avance de los alumnos: cifras por etapa y una barra dividida ────── */
export function Embudo({ e, sub }: { e: EmbudoData; sub?: string }) {
  const etapas = [
    { key: 'sin', label: 'Sin iniciar', value: e.sin_iniciar, cls: styles.segIdle },
    { key: 'curso', label: 'En curso', value: e.en_curso, cls: styles.segActive },
    { key: 'fin', label: 'Terminaron', value: e.terminaron, cls: styles.segDone },
  ];
  const total = Math.max(1, e.inscritos);
  return (
    <section className={`${styles.panel} ${styles.board}`} aria-labelledby="avance-titulo">
      <div className={styles.panelHead}>
        <div>
          <h2 id="avance-titulo" className={styles.panelTitle}>Avance de los alumnos</h2>
          <p className={styles.boardSub}>{sub ?? `${n(e.inscritos)} inscripciones vigentes en todos los cursos`}</p>
        </div>
      </div>
      <dl className={styles.stats}>
        {etapas.map((s) => (
          <div key={s.key} className={styles.stat}>
            <dt><i className={`${styles.swatch} ${s.cls}`} aria-hidden="true" />{s.label}</dt>
            <dd>
              <span className={styles.statNum}>{n(s.value)}</span>
              <span className={styles.statPct}>{pct(s.value, total)}%</span>
            </dd>
          </div>
        ))}
        <div className={`${styles.stat} ${styles.statCert}`}>
          <dt>Certificados emitidos</dt>
          <dd><span className={styles.statNum}>{n(e.certificados)}</span></dd>
        </div>
      </dl>
      <div className={styles.rail} role="img" aria-label={etapas.map((s) => `${s.label}: ${pct(s.value, total)}%`).join(', ')}>
        {etapas.map((s) => (
          <div key={s.key} className={`${styles.seg} ${s.cls}`} style={{ flexGrow: Math.max(s.value, total * 0.02) }} />
        ))}
      </div>
    </section>
  );
}

/* ── Actividad semanal: columnas (lecciones) + línea (inscripciones) ───── */
export function Actividad({ semanas }: { semanas: SemanaData[] }) {
  const W = 640, H = 220, L = 34, R = 34, T = 14, B = 28;
  const iw = W - L - R, ih = H - T - B;
  const maxLec = Math.max(4, ...semanas.map((s) => s.lecciones_completadas));
  const maxIns = Math.max(4, ...semanas.map((s) => s.inscripciones));
  const step = iw / semanas.length;
  const bw = Math.min(26, step * 0.56);
  const yL = (v: number) => T + ih - (ih * v) / maxLec;
  const yI = (v: number) => T + ih - (ih * v) / maxIns;
  const ticks = [0, 0.5, 1].map((f) => Math.round(maxLec * f));
  const linea = semanas.map((s, i) => `${L + step * i + step / 2},${yI(s.inscripciones)}`).join(' ');
  const ultima = semanas[semanas.length - 1];
  const totalLec = semanas.reduce((a, s) => a + s.lecciones_completadas, 0);
  const totalIns = semanas.reduce((a, s) => a + s.inscripciones, 0);

  return (
    <section className={styles.panel} aria-labelledby="actividad-titulo">
      <div className={styles.panelHead}>
        <h2 id="actividad-titulo" className={styles.panelTitle}>Actividad de las últimas 12 semanas</h2>
        <div className={styles.keys}>
          <span><i className={`${styles.key} ${styles.keyBar}`} aria-hidden="true" />Lecciones completadas</span>
          <span><i className={`${styles.key} ${styles.keyLine}`} aria-hidden="true" />Inscripciones nuevas</span>
        </div>
      </div>
      <div className={styles.chartWrap}>
        <svg viewBox={`0 0 ${W} ${H}`} className={styles.chart} role="img"
          aria-label={`En 12 semanas: ${totalLec} lecciones completadas y ${totalIns} inscripciones nuevas. Esta semana: ${ultima?.lecciones_completadas ?? 0} lecciones y ${ultima?.inscripciones ?? 0} inscripciones.`}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={L} x2={W - R} y1={yL(t)} y2={yL(t)} className={styles.grid} />
              <text x={L - 8} y={yL(t) + 4} className={styles.axis} textAnchor="end">{t}</text>
            </g>
          ))}
          {[0, 0.5, 1].map((f) => (
            <text key={f} x={W - R + 8} y={yI(maxIns * f) + 4} className={`${styles.axis} ${styles.axisLine}`}>{Math.round(maxIns * f)}</text>
          ))}
          {semanas.map((s, i) => {
            const x = L + step * i + (step - bw) / 2;
            const y = yL(s.lecciones_completadas);
            const actual = i === semanas.length - 1;
            return (
              <g key={s.inicio}>
                <rect x={x} y={y} width={bw} height={Math.max(0, T + ih - y)} rx={2}
                  className={actual ? styles.barNow : styles.bar}>
                  <title>{`Semana del ${semanaCorta.format(new Date(s.inicio + 'T12:00:00'))}: ${s.lecciones_completadas} lecciones, ${s.inscripciones} inscripciones`}</title>
                </rect>
                {(i % 2 === 1 || actual) && (
                  <text x={L + step * i + step / 2} y={H - 8} textAnchor="middle" className={styles.axis}>
                    {actual ? 'Esta semana' : semanaCorta.format(new Date(s.inicio + 'T12:00:00'))}
                  </text>
                )}
              </g>
            );
          })}
          <polyline points={linea} className={styles.line} />
          {semanas.map((s, i) => (
            <circle key={s.inicio} cx={L + step * i + step / 2} cy={yI(s.inscripciones)} r={i === semanas.length - 1 ? 4 : 2.5} className={styles.dot} />
          ))}
        </svg>
      </div>
    </section>
  );
}

/* ── Barras horizontales con avance ────────────────────────────────────── */
export function Ranking({ title, id, href, rows, empty }: {
  title: string; id: string; href?: string; empty?: string;
  rows: { key: string; name: string; meta: string; avance: number; href?: string }[];
}) {
  return (
    <section className={styles.panel} aria-labelledby={id}>
      <div className={styles.panelHead}>
        <h2 id={id} className={styles.panelTitle}>{title}</h2>
        {href && <Link href={href} className={styles.link}>Ver todo</Link>}
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>{empty ?? 'Todavía no hay inscripciones.'}</p>
      ) : (
        <ul className={styles.rank}>
          {rows.map((r) => (
            <li key={r.key} className={styles.rankRow}>
              <div className={styles.rankTop}>
                {r.href ? <Link href={r.href} className={styles.rankName}>{r.name}</Link> : <span className={styles.rankName}>{r.name}</span>}
                <span className={styles.rankPct}>{Math.round(r.avance)}%</span>
              </div>
              <div className={styles.meter} role="img" aria-label={`Avance promedio ${Math.round(r.avance)}%`}>
                <span style={{ width: `${Math.max(2, r.avance)}%` }} />
              </div>
              <span className={styles.rankMeta}>{r.meta}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ── Cifras clave ─────────────────────────────────────────────────────── */
export function Kpis({ items }: { items: { label: string; value: string; hint?: string }[] }) {
  return (
    <dl className={styles.kpis}>
      {items.map((k) => (
        <div key={k.label} className={styles.kpi}>
          <dt className={styles.kpiLabel}>{k.label}</dt>
          <dd style={{ margin: 0 }}>
            <span className={styles.kpiValue}>{k.value}</span>
            {k.hint && <span className={styles.kpiHint} style={{ display: 'block' }}>{k.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}
