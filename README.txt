DoorSync

DoorSync is a web app prototype for coordinating classroom unlock requests and professor availability across campus.

This implementation is based on:

- DoorSync_BRD.docx for product behavior and role workflows.
- DoorSync_Database_Design_withERD.xlsx for entities, relationships, and seed data.

The app is dependency-free and can be hosted as static files.

Run locally

Open index.html in a browser, or serve the folder:

python -m http.server 5173

Then visit http://localhost:5173.

Included prototype behavior

Professor schedules: sample recurring classes are defined in data.js, linked by ProfessorID and RoomID. Existing saved data receives these schedules automatically. The tracker shows today and the next seven days in Asia/Manila time. Requests are allowed from 15 minutes before class until (excluding) class start: an 8:00 AM class allows requests from 7:45 AM through 7:59:59 AM. Requests must match the signed-in professor's scheduled class. Unlocked rooms, pending room requests, and repeat requests for the same class date are blocked.

These are browser-side prototype checks using the device clock. Production hosting with real accounts will need server-side authentication, schedule validation, and authoritative server time. Run schedule checks with: node --test schedule.test.js

- Login page with email/password sign-in for student, professor, or personnel accounts from the supplied database seed data.
- Student view shows only rooms linked to the student's enrolled class schedules, including class times and professor names. The locked-room count uses the same assigned rooms. Professor availability remains visible.
- Student assignments in data.js: Juan takes SCH-001/002, Maria SCH-003/004, Angelo SCH-001/005, and Kristine SCH-005/006. Existing saved data receives these links automatically.
- Presentation demo mode is the "Demo: bypass class schedule" switch above logout. It allows professors to request any locked room at any time, without a scheduled class. Enabling it and sending requests never change room statuses. Pending duplicates and unlocked rooms remain blocked; personnel must mark a room unlocked. Personnel can lock it again for another demonstration. Switch off to restore class ownership and the 15-minute rule. The setting persists in this browser; Reset demo data also turns it off. Existing requests remain in the personnel queue.
- Professor view for availability updates and room unlock requests.
- Personnel view for pending requests, room details, completed requests, and locking rooms again after use.
- Local persistence through localStorage.
- Seed data matching the supplied database workbook.

Note: the supplied workbook has role/entity records and email addresses but no password or credential table, so this prototype uses doorsync123 as the demo password for every seeded account.

Demo credentials

All demo accounts use this password:

doorsync123

Students

- Juan Dela Cruz: juan.delacruz@nu-baliwag.edu.ph
- Maria Santos: maria.santos@nu-baliwag.edu.ph
- Angelo Reyes: angelo.reyes@nu-baliwag.edu.ph
- Kristine Bautista: kristine.bautista@nu-baliwag.edu.ph

Professors

- Dr. Ramon Cruz: ramon.cruz@nu-baliwag.edu.ph
- Prof. Liza Fernandez: liza.fernandez@nu-baliwag.edu.ph
- Dr. Michael Torres: michael.torres@nu-baliwag.edu.ph

Personnel

- Rico Manalo: rico.manalo@nu-baliwag.edu.ph
- Ella Ramos: ella.ramos@nu-baliwag.edu.ph
