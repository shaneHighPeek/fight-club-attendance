# User Flows

## 1. Member Check-in

### Entry Point
- Kiosk home screen with two options:
  - "Check-in as Member" (default)
  - "First Time Visitor"

### Flow
1. **Member Identification**
   - Display keypad and name input
   - User can enter:
     - Last name (minimum 3 characters)
     - OR phone number (formatted as entered)
   - Show partial matches as user types

2. **Member Selection**
   - Display matching members (photo, name, membership type)
   - If single match → Auto-proceed
   - If multiple matches (common with shared family phone) → Show student select list to choose the correct student
   - "Not on list?" option → Casual check-in

3. **Confirmation**
   - Show member details (photo, name, membership status, current belt + stripes)
   - Large "Check In" button
   - Visual/audio confirmation
   - Display check-in time

4. **Completion**
   - Show success message
   - Return to home screen after 2 seconds
   - Print receipt (optional)

## 2. Casual Visitor Check-in

### Entry Point
- Kiosk home screen → "First Time Visitor"

### Flow
1. **Waiver Presentation**
   - Display digital waiver
   - Scrollable content
   - Required fields highlighted
   - Digital signature pad
   - If an active waiver is already on file → Skip waiver and go directly to Check-in

2. **Information Collection**
   - Personal Information:
     - Full Name
     - Date of Birth
     - Child/Adult selector
     - Email
     - Phone
   - Emergency Contact:
     - Name
     - Relationship
     - Phone
   - Agreement checkboxes
   - Digital signature

3. **Review**
   - Summary of entered information
   - Edit option
   - Submit button

4. **Check-in**
   - Process waiver
   - Capture photo (optional)
   - Issue temporary pass (if applicable)
   - Send email confirmation

5. **Completion**
   - Thank you message
   - Next steps
   - Return to home screen

## 3. Admin - Viewing Attendance

### Entry Point
- Admin dashboard → Attendance section

### Flow
1. **Filter Selection**
   - Date range picker
   - Location filter
   - Member type (All/Members/Casual)
   - Rank filter (belt + stripes)
   - Class/event filter (future)

2. **Data Display**
   - Summary cards:
     - Total check-ins
     - Unique members
     - New visitors
     - Peak times
   - Interactive chart
   - Sortable data table

3. **Actions**
   - Export to CSV/Excel
   - Print report
   - View member details
   - Add manual entry

4. **Member Detail View**
   - Profile information
   - Age / DOB (coach reference)
   - Check-in history
   - Sessions by rank (belt + stripes)
   - Attendance patterns
   - Notes/actions

## 4. Staff - Manual Check-in

### Entry Point
- Staff dashboard → Manual Check-in

### Flow
1. **Member Lookup**
   - Search by name/phone
   - Or scan membership card
   - Or select from recent

2. **Check-in Options**
   - Select class/session
   - Add notes
   - Apply late arrival (if applicable)
   - Process payment (if needed)

3. **Confirmation**
   - Show check-in details
   - Print receipt (if needed)
   - Return to search

## Error States & Edge Cases

### No Match Found
- Clear error message
- Suggestions (check spelling)
- Option to try again
- Link to casual check-in

### Duplicate Check-in
- Detect recent check-ins (last 2 hours)
- Show last check-in time
- Option to proceed anyway

### System Offline
- Cache recent member data
- Queue check-ins
- Show offline indicator
- Automatic sync when back online

### Access Denied
- Clear permission message
- Contact admin information
- Log unauthorized attempts

### Kiosk Lock (misuse prevention)
- After 5 failed lookup attempts in a row, lock the kiosk screen.
- Unlock requires a 4-digit coach or admin PIN.
- Log lock/unlock events for audit.
