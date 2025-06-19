import { ContextData } from './index'

/**
 * Academic Calendar for VIT Vellore
 * Contains semester dates, exam periods, and important academic milestones
 */
export const academicCalendar: ContextData = {
  section: 'academic-calendar',
  title: 'Academic Calendar Fall Semester 2025-26',
  lastUpdated: '2025-06-20',
  priority: 'high',
  content: `
Fall Semester 2025-26 Academic Calendar
*(Applicable to students of all programmes except MBA)*

Course Registration & Setup:
- June 4, 2025 (Wednesday): Course wish list registration by students
- June 9-20, 2025 (Monday to Friday): Course allocation and scheduling by Schools
- June 28, 2025 (Saturday): Course registration by students
- July 9, 2025 (Wednesday): Commencement of Fall Semester 2025-26
- July 9-11, 2025 (Wednesday to Friday): Course add/drop option to students
- July 20, 2025 (Sunday): Last date for payment of re-registration fees

Holidays & Breaks:
- August 15, 2025 (Friday): Independence Day (Holiday)
- August 27, 2025 (Wednesday): Vinayaka Chathurthi (Holiday)
- September 5, 2025 (Friday): Meeladun-Nabi (No Instructional Day)
- September 26-28, 2025 (Friday to Sunday): Gravitas'25
- October 1, 2025 (Wednesday): Ayutha Pooja (Holiday)
- October 2, 2025 (Thursday): Gandhi Jayanthi (Holiday)
- October 18-26, 2025 (Saturday to Sunday): Deepavali (Holiday)

Assessment Schedule:
- August 17, 2025 (Sunday) to August 23, 2025 (Saturday): Continuous Assessment Test - I (CAT-1)
- September 8-10, 2025 (Monday to Wednesday): Course withdraw option for students
- October 5, 2025 (Sunday) to October 11, 2025 (Saturday): Continuous Assessment Test - II (CAT-2)

Final Examinations:
- November 7, 2025 (Friday): Last instructional day for laboratory classes
- November 10-14, 2025 (Monday to Friday): Final Assessment Test (FAT) for laboratory courses/components
- November 14, 2025 (Friday): Last instructional day for theory classes
- November 17, 2025 - December 4, 2025 (Monday to Thursday): Commencement of Final Assessment Test (FAT) for theory courses

Winter Semester 2025-2026:
- December 5, 2025 (Friday): Commencement of Winter Semester 2025-2026 (Tentative)
- December 21, 2025 - January 4, 2026 (Sunday to Sunday): Winter Vacation for students (Tentative)

Important Notes:
- Students must participate in course wish list registration (mandatory) to be eligible for Course Registration
- Minimum 100% attendance required; however, relaxation on minimum attendance given for genuine reasons
- Minimum 75% attendance mandatory for appearing in examinations (CAT and FAT), exception for 9 CGPA+
- Last date for assignment and project report uploads: November 14, 2025 (Friday)
- FAT schedule will be announced by CoE at appropriate time
- Academic calendar on VTOP Login to be referred for Saturday instructional days conversion

*Contact Information:
- Academic Office: academics@vit.ac.in
- Dean Academics: M. Anthony Xavior PhD
- For queries: Check VTOP portal for updates and notifications
`,
  metadata: {
    currentSemester: 'Fall 2025-26',
    nextImportantDate: '2025-08-17',
    academicYear: '2025-26',
    semesterStart: '2025-07-09',
    semesterEnd: '2025-12-04',
    cat1Period: 'August 17-23, 2025',
    cat2Period: 'October 5-11, 2025',
    fatPeriod: 'November 17 - December 4, 2025',
    deanAcademics: 'M. Anthony Xavior PhD'
  }
}
