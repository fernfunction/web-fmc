import type { FmcMessage } from './types';

// scratchpad messages from the Smiths guide, alerting beats advisory
export const MSG = {
  invalidEntry: { text: 'INVALID ENTRY', priority: 'advisory' },
  notInDataBase: { text: 'NOT IN DATA BASE', priority: 'advisory' },
  takeoffSpeedsDeleted: { text: 'TAKEOFF SPEEDS DELETED', priority: 'alert' },
  invalidDelete: { text: 'INVALID DELETE', priority: 'advisory' },
  standby: { text: 'STANDBY ONE', priority: 'advisory' },
  enterIrsPos: { text: 'ENTER IRS POSITION', priority: 'alert' },
  irsNavOnly: { text: 'IRS NAV ONLY', priority: 'advisory' },
  perfInitIncomplete: { text: 'PERF/INIT DATA INCOMPLETE', priority: 'advisory' },
  routeNotActive: { text: 'ROUTE NOT ACTIVE', priority: 'advisory' },
  noActiveRoute: { text: 'NO ACTIVE ROUTE', priority: 'advisory' },
  endOfRoute: { text: 'END OF ROUTE', priority: 'alert' },
  resetMcpAlt: { text: 'RESET MCP ALT', priority: 'alert' },
  unableCrzAlt: { text: 'UNABLE CRZ ALT', priority: 'alert' },
  notOnIntercept: { text: 'NOT ON INTERCEPT HEADING', priority: 'alert' },
  holdAtDeleted: { text: 'HOLD AT XXXXX DELETED', priority: 'advisory' },
  keyInop: { text: 'KEY/FUNCTION INOP', priority: 'advisory' },
  deleteOnly: { text: 'INVALID ENTRY', priority: 'advisory' },
  groundOnly: { text: 'GROUND OPERATION ONLY', priority: 'advisory' },
  dataBaseFull: { text: 'DATA BASE FULL', priority: 'advisory' },
  navDataOutOfDate: { text: 'NAV DATA OUT OF DATE', priority: 'advisory' },
} as const satisfies Record<string, FmcMessage>;

export function msgCompare(a: FmcMessage, b: FmcMessage): number {
  if (a.priority === b.priority) return 0;
  return a.priority === 'alert' ? -1 : 1;
}
