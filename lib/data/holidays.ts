import { ContextData } from './index'

/**
 * Holiday Calendar and Leave Information
 * Official holidays, semester breaks, and leave policies
 */
export const holidays: ContextData = {
  section: 'holidays',
  title: 'Holiday Calendar 2025-26',
  lastUpdated: '2025-06-28',
  priority: 'medium',
  content: `
**Official Holidays and Breaks for Academic Year 2025-26 (VIT Vellore):**


**August 2025:**
- August 15 (Friday) - Independence Day
- August 27 (Wednesday) - Vinayakar Chathurthi

**September 2025:**
- September 5 (Friday) - Meelad-un-Nabi (No Instructional Day)
- September 26-28 (Saturday-Sunday) - Gravitas '25 (No Instructional Day)

**October 2025:**
- October 1 (Wednesday) - Ayutha Pooja (Holiday)
- October 2 (Thursday) - Gandhi Jayanthi (Holiday)
- October 18-26 (Saturday-Sunday) - Deepavali (Holiday)

**November 2025:**
(No holidays marked)

**Exam Days:**
- CAT-I: August 17-23 (Sunday-Saturday)
- CAT-II: October 5-11 (Sunday-Saturday)

**Leave Policies for Students:**
- Medical leave: Requires medical certificate
- Emergency leave: Prior permission from warden/faculty advisor
- Academic leave: Approval from Dean Academic
- Maximum consecutive leave: 3 days without special permission
- Attendance requirement: Minimum 75% for exam eligibility

**Important Notes:**
- Holiday dates may change based on government notifications
- Compensatory working days may be declared for some holidays
- Mess and hostel facilities continue during holidays
- Library may have reduced hours during holidays
`,
  metadata: {
    attendanceMinimum: '75%',
  },
}
