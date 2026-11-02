import type { ContextData } from './index'

export const latestEvents: ContextData = {
  section: 'latest-events',
  title: 'Upcoming Academic Events (as of November 2, 2026)',
  lastUpdated: '2026-11-02',
  priority: 'medium',
  content: `
- November 12–December 5, 2026: Fall theory FAT across listed slots under the revised October 8 CoE schedule; individual slots vary.
- December 2: Winter 2026-27 commences, overlapping some Fall FAT slots. Check your individual schedule.
- December 2–4: Winter add/drop.
- December 11: Winter re-registration fee deadline.
- December 20–January 3, 2027: Winter vacation.
- January 15–17: Pongal holidays.
- January 24–31: Winter CAT-I.
- February 11–14: Riviera 2027.

See the academic calendar and exam schedule sections for source, scope, caveats and remaining dates. Consult VTOP and later university notices for updates.
`,
  metadata: { asOf: '2026-11-02' },
}
