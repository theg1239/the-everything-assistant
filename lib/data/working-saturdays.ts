import { ContextData } from './index'

/**
 * Working Saturdays for VIT Vellore
 * Special Saturdays when classes are conducted to compensate for holidays
 */
export const workingSaturdays: ContextData = {
  section: 'working-saturdays',
  title: 'Working Saturdays Schedule',
  lastUpdated: '2024-12-20',
  priority: 'high',
  content: `
**Working Saturdays for Winter Semester 2024-25:**

**January 2025:**
- January 25, 2025 (Saturday) - Working day to compensate for Republic Day holiday

**February 2025:**
- February 15, 2025 (Saturday) - Working day to compensate for other holidays
- February 22, 2025 (Saturday) - Working day before mid-term exams

**March 2025:**
- March 15, 2025 (Saturday) - Working day to compensate for Holi
- March 29, 2025 (Saturday) - Working day to make up for lost classes

**April 2025:**
- April 12, 2025 (Saturday) - Working day before end-semester exams

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
    nextWorkingSaturday: '2025-01-25',
    totalWorkingSaturdays: 5,
    currentSemester: 'Winter 2024-25',
  },
}
