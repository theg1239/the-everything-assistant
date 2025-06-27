import { ContextData } from './index'

/**
 * Working Saturdays for VIT Vellore
 * Special Saturdays when classes are conducted to compensate for holidays
 */
export const workingSaturdays: ContextData = {
  section: 'working-saturdays',
  title: 'Working Saturdays Schedule',
  lastUpdated: '2025-06-28',
  priority: 'high',
  content: `
**Working Saturdays for Fall Semester 2025-26:**

- July 19, 2025 (Saturday) — Instructional Day (Monday Day Order)
- August 2, 2025 (Saturday) — Instructional Day (Tuesday Order)
- August 30, 2025 (Saturday) — Instructional Day (Wednesday Order)

**Notes:**
- Most other Saturdays in the semester are regular instructional days (not compensatory/"special" working Saturdays).
- Exam Saturdays (CAT-I: Aug 23, CAT-II: Oct 11) are not counted as working Saturdays for compensation.
- Event Saturdays (e.g., Gravitas: Sep 27) are non-instructional.

**Schedule for Working Saturdays:**
- Regular class timings apply (same as weekdays)
- All faculty and students must attend
- Mess and other facilities operate on normal schedule
- Library remains open with regular hours
- Transportation services available as per weekday schedule

**Important Notes:**
- Working Saturday announcements are made at least 1 week in advance
- Students must attend classes as per their regular timetable
- Attendance is mandatory and will be recorded
- Any doubts about working Saturday schedules should be clarified with academic office

**Contact for Queries:**
- Academic Office: academics@vit.ac.in
- Student Services: studentservices@vit.ac.in
`,
  metadata: {
    nextWorkingSaturday: '2025-07-19',
    totalWorkingSaturdays: 3,
    currentSemester: 'Fall 2025-26',
  },
}
