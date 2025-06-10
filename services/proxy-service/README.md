# VIT Proxy Service

A microservice that proxies requests to the VTOP CLI tool.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Start the service:
```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

## API Endpoints

### POST /vtop
Execute a VTOP CLI command.

**Request Body:**
```json
{
  "command": "grades",
  "username": "your_username",
  "password": "your_password",
  "flags": {
    "semester": 1,
    "debug": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "command": "grades",
  "data": {...}
}
```

### GET /commands
List all available commands.

## Supported Commands

- `profile` - Student profile information
- `marks` - Marks for a semester
- `grades` - Grades for a semester  
- `attendance` - Attendance details
- `timetable` - Class timetable
- `receipts` - Fee receipts
- `hostel` - Hostel information
- `cgpa` - CGPA details
- `exams` - Exam schedule
- `library-dues` - Library dues
- `calendar` - Academic calendar
- `nightslip` - Nightslip status
- `leave` - Leave status
- `msg` - Class messages
- `da` - Digital assignments
- `facility` - Facility registration
- `syllabus` - Course syllabus

## Command Flags

Different commands support different flags:

- `semester` (number) - Semester number
- `course` (number) - Course selection
- `faculty` (string) - Faculty name
- `class-group` (number) - Class group
- `fuzzy-index` (number) - Fuzzy search index
- `debug` (boolean) - Enable debug mode
