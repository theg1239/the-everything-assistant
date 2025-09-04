import { ContextData } from './index'

export const examSchedule: ContextData = {
  section: 'exam-schedule',
  title: 'Exam Schedule & Information Fall 2025-26',
  lastUpdated: '2025-09-04',
  priority: 'high',
  content: `
Fall Semester 2025-26 Exam Schedule:

Continuous Assessment Test - I (CAT-1):
- Dates: August 17-23, 2025 (Sunday to Saturday)
- Duration: 90 minutes per exam
- Weightage: 15% of total marks
- Venue: Regular classrooms
- Syllabus: Topics covered till mid-semester
 - Status: Concluded

Continuous Assessment Test - II (CAT-2):
- Dates: October 5-11, 2025 (Sunday to Saturday)
- Duration: 90 minutes per exam
- Weightage: 15% of total marks
- Venue: Regular classrooms
- Syllabus: Topics covered since CAT-1
 - Status: Upcoming

Final Assessment Test (FAT) - Laboratory:
- Dates: November 10-14, 2025 (Monday to Friday)
- Duration: As per lab schedule
- Weightage: 50% of lab component
- Venue: Respective laboratories
- Last instructional day for labs: November 7, 2025

Final Assessment Test (FAT) - Theory:
- Dates: November 17 - December 4, 2025 (Monday to Thursday)
- Duration: 3 hours per exam
- Weightage: 50% of total marks
- Venue: Exam halls (to be announced by CoE)
- Last instructional day for theory: November 14, 2025

For weekend intra semester:
- Mid Terms: 2025-09-20 to 2025-09-21
- Final assessment test for Lab courses: 2025-11-15
- Last instructional day  for theory courses: 2025-11-16
- Final assessment test for theory courses: 2025-11-17 to 2025-12-04

Important Deadlines:
- Course withdrawal option: September 8-10, 2025
- Assignment and project report uploads: November 14, 2025 (Friday)
- FAT schedule announcement: By Controller of Examinations at appropriate time

Attendance Requirements:
- Minimum 75% attendance mandatory for appearing in examinations (CAT and FAT)
- 100% attendance preferred; relaxation given for genuine reasons only
- Students below 75% attendance will not be eligible for exams

Exam Guidelines:
- Students must carry valid ID card and hall ticket
- Entry not allowed 30 minutes after exam starts
- No electronic devices allowed except permitted calculators
- Dress code: Formal attire mandatory
- Any malpractice results in severe disciplinary action
- Mobile phones strictly prohibited in exam halls

Assessment Pattern:
- CAT-1: 15% (covers initial syllabus)
- CAT-2: 15% (covers mid-semester syllabus)
- Digital Assignment: 10% (online submission)
- FAT: 50% (comprehensive - entire syllabus)
- Quiz/Surprise Tests: 10% (conducted throughout semester)

Grade System:
- S (Outstanding): 90-100% (10 points)
- A (Excellent): 80-89% (9 points)
- B (Very Good): 70-79% (8 points)
- C (Good): 60-69% (7 points)
- D (Average): 50-59% (6 points)
- E (Pass): 45-49% (5 points)
- F (Fail): Below 45% (0 points)
- N: Audit (no points)

Re-examination Policy:
- Available for failed courses in subsequent semester
- Re-exam fee applicable as per university norms (6000 INR for both theory and lab)
- Re-registration required for failed courses
`,
  metadata: {
    currentSemester: 'Fall 2025-26',
    nextExamPeriod: 'CAT-2 October 5-11, 2025',
    cat1Dates: 'August 17-23, 2025',
    cat2Dates: 'October 5-11, 2025',
    fatDates: 'November 17 - December 4, 2025',
    attendanceRequirement: '75%',
  },
}
