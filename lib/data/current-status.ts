import type { ContextData } from './index'

export const currentStatus: ContextData = {
  section: 'current-status',
  title: 'VIT Vellore Semester Status (November 2, 2026)',
  lastUpdated: '2026-11-02',
  priority: 'high',
  content: `
As of November 2, 2026, Fall 2026-27 is the current semester and Winter 2026-27 is upcoming. The Winter calendar commences December 2; revised Fall theory FAT runs November 12–December 5 for listed slots, with some late slots overlapping Winter commencement. Check the CoE schedule and VTOP for individual obligations rather than assuming the overlap has been resolved.

Fall's last laboratory instructional day was October 24, with lab FAT October 26–30. October 31 followed Wednesday order. November 3 is the last theory instructional day and upload deadline for assignments/project reports; November 4–11 is the Deepavali holiday for students. These dates come from the Fall calendar VIT/VLR/Acad/2026/004 and later instructional-day notices.

Winter add/drop is December 2–4, winter vacation December 20–January 3, and CAT-I January 24–31, 2027. See the academic calendar for full scope, holidays, registration guidance and later dates. Check subsequent official notices for changes.
`,
  metadata: {
    asOf: '2026-11-02',
    currentSemester: 'Fall 2026-27',
    upcomingSemester: 'Winter 2026-27',
  },
}
