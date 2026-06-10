import { useFmcStore } from '../fmc/store';
import { fmtGmt } from '../fmc/nav/geo';
import { trimForCg } from '../fmc/perf/model';
import { TimeChart } from './charts/TimeChart';
import styles from './debug.module.css';

const C = {
  green: '#2fd64f',
  cyan: '#35d2e8',
  magenta: '#ff5af0',
  amber: '#ffb547',
};

function Chip({ label, value }: { label: string; value: string | number | undefined | null }) {
  const v = value === undefined || value === null || value === '' ? '—' : String(value);
  return (
    <div className={styles.chip}>
      <span className={styles.chipLabel}>{label}</span>
      <span className={styles.chipValue}>{v}</span>
    </div>
  );
}

function onOff(b: boolean): string {
  return b ? 'ON' : 'OFF';
}

export function DebugPanel() {
  const s = useFmcStore();
  if (!s.ui.debugOpen) return null;

  const plan = s.mod ?? s.active;
  const legs = s.active.legs;
  const activeLeg = legs[s.activeLegIndex];
  const nextLeg = legs.slice(s.activeLegIndex + 1).find((l) => !l.isDiscontinuity);
  const to = plan.takeoff;
  const p = plan.perf;

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <h2>TELEMETRY</h2>
        <span className={styles.headerNote}>1 Hz · last 10 min</span>
        <button onClick={s.toggleDebug} aria-label="close telemetry">
          ✕
        </button>
      </header>

      <h3>SIMULATION FEED</h3>
      <div className={styles.chartGrid}>
        <TimeChart title="ALTITUDE (FT)" minSpan={1000} fields={[{ key: 'alt', label: 'ALT', color: C.cyan }]} />
        <TimeChart
          title="SPEEDS (KT)"
          minSpan={60}
          fields={[
            { key: 'ias', label: 'IAS', color: C.green },
            { key: 'tas', label: 'TAS', color: C.cyan },
            { key: 'gs', label: 'GS', color: C.magenta },
          ]}
        />
        <TimeChart title="MACH" minSpan={0.02} fields={[{ key: 'mach', label: 'M', color: C.amber }]} />
        <TimeChart
          title="HDG / TRK (°)"
          minSpan={40}
          fields={[
            { key: 'hdg', label: 'HDG', color: C.green },
            { key: 'trk', label: 'TRK', color: C.cyan },
          ]}
        />
        <TimeChart
          title="VERT SPEED (FPM)"
          minSpan={600}
          fields={[{ key: 'vs', label: 'V/S', color: C.magenta }]}
        />
        <TimeChart
          title="WEIGHT / FUEL (×1000 LB)"
          minSpan={15}
          fields={[
            { key: 'gw', label: 'GW', color: C.amber },
            { key: 'fuel', label: 'FUEL', color: C.green },
          ]}
        />
        <TimeChart title="FUEL FLOW (LB/HR)" minSpan={900} fields={[{ key: 'ff', label: 'FF', color: C.cyan }]} />
        <TimeChart
          title="FUEL PER TANK (×1000 LB)"
          minSpan={4}
          fields={[
            { key: 'tank1', label: 'TK1', color: C.green },
            { key: 'tankC', label: 'CTR', color: C.amber },
            { key: 'tank2', label: 'TK2', color: C.cyan },
          ]}
        />
        <TimeChart
          title="SAT / TAT (°C)"
          minSpan={12}
          fields={[
            { key: 'sat', label: 'SAT', color: C.cyan },
            { key: 'tat', label: 'TAT', color: C.amber },
          ]}
        />
        <TimeChart
          title="WIND (KT / °)"
          minSpan={60}
          fields={[
            { key: 'windSpd', label: 'SPD', color: C.green },
            { key: 'windDir', label: 'DIR', color: C.cyan },
          ]}
        />
        <TimeChart title="DTG ACTIVE WPT (NM)" fields={[{ key: 'dtgWpt', label: 'DTG', color: C.magenta }]} />
        <TimeChart title="DTG DEST (NM)" fields={[{ key: 'dtgDest', label: 'DTG', color: C.green }]} />
        <TimeChart
          title="POSITION (°)"
          fields={[
            { key: 'lat', label: 'LAT', color: C.green },
            { key: 'lon', label: 'LON', color: C.cyan },
          ]}
        />
      </div>

      <h3>AIRCRAFT / CLOCK</h3>
      <div className={styles.chipGrid}>
        <Chip label="PHASE" value={s.aircraft.phase} />
        <Chip label="ON GROUND" value={onOff(s.aircraft.onGround)} />
        <Chip label="GMT" value={fmtGmt(s.aircraft.clock.gmtSeconds)} />
        <Chip label="DATE" value={s.aircraft.clock.date} />
        <Chip label="TIME WARP" value={`${s.ui.timeScale}x`} />
        <Chip label="LAT" value={s.aircraft.position.lat.toFixed(4)} />
        <Chip label="LON" value={s.aircraft.position.lon.toFixed(4)} />
        <Chip label="IRS" value={s.aircraft.irs.status} />
        <Chip label="IRS DRIFT" value={`${s.aircraft.irs.driftNmHr} NM/HR`} />
        <Chip label="IRS POS SET" value={onOff(s.aircraft.irsPosSet)} />
        <Chip label="GPS AVAIL" value={onOff(s.aircraft.gpsAvailable)} />
      </div>

      <h3>FMC STATE</h3>
      <div className={styles.chipGrid}>
        <Chip label="PAGE" value={s.ui.page} />
        <Chip label="SUBPAGE" value={s.ui.pageIndex + 1} />
        <Chip label="SCRATCHPAD" value={s.scratchpad} />
        <Chip label="MESSAGES" value={s.messages.length} />
        <Chip label="TOP MSG" value={s.messages[0]?.text} />
        <Chip label="MOD PENDING" value={onOff(s.mod !== null)} />
        <Chip label="ACTIVE WPT" value={activeLeg?.isDiscontinuity ? 'DISCO' : activeLeg?.ident} />
        <Chip label="NEXT WPT" value={nextLeg?.ident} />
        <Chip label="LEG INDEX" value={s.activeLegIndex} />
        <Chip label="LEGS" value={legs.length} />
        <Chip label="OFFSET" value={plan.offset ? `${plan.offset.side}${plan.offset.nm}${plan.offset.active ? ' ACT' : ''}` : undefined} />
        <Chip label="HOLD AT" value={plan.hold?.atIdent} />
        <Chip label="NAV CYCLE" value={s.navDataCycle} />
        <Chip label="GPS UPDATE" value={onOff(s.gpsUpdating)} />
        <Chip label="DME UPDATE" value={onOff(s.dmeUpdating)} />
        <Chip label="VOR INHIBIT" value={onOff(s.navAidsInhibited)} />
        <Chip label="IDENT OK" value={onOff(s.identConfirmed)} />
        <Chip label="POS INIT OK" value={onOff(s.posInitDone)} />
      </div>

      <h3>ROUTE</h3>
      <div className={styles.chipGrid}>
        <Chip label="ORIGIN" value={plan.origin} />
        <Chip label="DEST" value={plan.dest} />
        <Chip label="RUNWAY" value={plan.runway} />
        <Chip label="SID" value={plan.sid} />
        <Chip label="STAR" value={plan.star} />
        <Chip label="APPROACH" value={plan.approach} />
        <Chip label="CO ROUTE" value={plan.coRoute} />
        <Chip label="FLT NO" value={plan.fltNo} />
        <Chip label="ACTIVATED" value={onOff(plan.activated)} />
        <Chip label="EXECUTED" value={onOff(plan.executed)} />
      </div>

      <h3>PERF / TAKEOFF / VNAV</h3>
      <div className={styles.chipGrid}>
        <Chip label="GW" value={p.gw?.toFixed(1)} />
        <Chip label="ZFW" value={p.zfw?.toFixed(1)} />
        <Chip label="RESERVES" value={p.reserves?.toFixed(1)} />
        <Chip label="COST INDEX" value={p.costIndex} />
        <Chip label="CRZ ALT" value={p.crzAlt} />
        <Chip label="TRANS ALT" value={p.transAlt} />
        <Chip label="ISA DEV" value={p.isaDev !== undefined ? `${p.isaDev}°C` : undefined} />
        <Chip label="CRZ WIND" value={p.crzWind ? `${p.crzWind.dir}/${p.crzWind.speed}` : undefined} />
        <Chip label="FLAPS" value={to.flaps} />
        <Chip label="V1" value={to.v1} />
        <Chip label="VR" value={to.vr} />
        <Chip label="V2" value={to.v2} />
        <Chip label="CG" value={to.cg !== undefined ? `${to.cg.toFixed(1)}%` : undefined} />
        <Chip label="TRIM" value={to.cg !== undefined ? trimForCg(to.cg).toFixed(2) : undefined} />
        <Chip label="N1 RATING" value={to.n1Rating} />
        <Chip label="CLB RATING" value={to.clbRating} />
        <Chip label="SEL OAT" value={to.oatSel !== undefined ? `${to.oatSel}°C` : undefined} />
        <Chip label="TO SHIFT" value={to.toShiftFt !== undefined ? `${to.toShiftFt}FT` : undefined} />
        <Chip label="CLB MODE" value={plan.vnav.clbMode} />
        <Chip label="CRZ MODE" value={plan.vnav.crzMode} />
        <Chip label="E/D ALT" value={plan.vnav.edAlt} />
        <Chip label="DES NOW" value={onOff(Boolean(plan.vnav.desNow))} />
      </div>
    </aside>
  );
}
