# Security Specification & Threat Model

## 1. Data Invariants

- **Zero Public Exposure**: Unauthenticated visitors and unauthorized Google accounts cannot read, list, or query `/students`, `/courses`, `/timetable`, `/attendance`, `/auditLogs`, `/authorizedUsers`, or `/systemSettings`.
- **Verified Personnel Access Only**: Access to department records requires a Google-authenticated user (`email_verified == true`) who is either the primary HOD (`jonesdarko345@gmail.com`) or explicitly listed in `/authorizedEmails/{email}`.
- **No Auto-HOD Escalation**: Client sessions never auto-sign in as HOD and never permit role escalation to HOD or Lecturer without server-side verified authorization.
- **Student Integrity**: Every student document must have an index number, name, program, level, and a valid string ID. Only authorized staff can register, update, or remove students.
- **Attendance Accountability**: An attendance record must reference a valid courseId and date. When `isFinalized == true`, only authorized HOD/admin staff can alter or unlock the session.
- **Isolated QR Check-In Tickets**: Student devices in QR check-in mode can only submit a `pending` ticket in `/qrCheckIns/{ticketId}` and can only read their own ticket (`submitterUid == request.auth.uid`), preventing roster scraping or reading other students' records.
- **Audit Immutability**: Audit logs once created cannot be updated by anyone, and can only be deleted by the HOD/admin.
- **Private Contact & Review Inbox**: Anyone using the portal (students, guests, class reps, lecturers) can create a validated `new` message in `/contactMessages/{messageId}`, while only the HOD/Admin can read, list, update status/adminNote, or delete messages—preventing PII/feedback scraping.

---

## 2. The "Dirty Dozen" Threat Payloads

1. **Unauthenticated / Unauthorized Roster Read**: Any unauthenticated or unauthorized user attempts to read `/students`, `/courses`, `/timetable`, `/attendance`, or `/auditLogs`. (Expect: `PERMISSION_DENIED`)
2. **Anonymous User Escalation**: An anonymous auth session attempts to read `/authorizedUsers` or write to `/authorizedEmails`. (Expect: `PERMISSION_DENIED`)
3. **Unauthenticated Student Injection**: An unauthorized user attempts to create `/students/hacker1`. (Expect: `PERMISSION_DENIED`)
4. **Invalid Student ID Character**: Creating `/students/bad*id#` with invalid characters in document ID. (Expect: `PERMISSION_DENIED`)
5. **Student Oversized String Denial of Wallet**: Student name payload with > 150 characters. (Expect: `PERMISSION_DENIED`)
6. **Direct Attendance Tampering on Finalized Session**: Non-admin attempting to modify records in a locked attendance document where `isFinalized == true`. (Expect: `PERMISSION_DENIED`)
7. **Cross-User Profile Hijacking**: User A (`uid_1`) attempting to update `/users/uid_2`. (Expect: `PERMISSION_DENIED`)
8. **Self-Authorization Attack**: An unauthorized user attempting to add their own email to `/authorizedUsers` or `/authorizedEmails`. (Expect: `PERMISSION_DENIED`)
9. **Audit Log Deletion Attempt**: Non-admin user attempting to delete from `/auditLogs/{logId}`. (Expect: `PERMISSION_DENIED`)
10. **Audit Log Tampering (Update)**: Any user attempting to modify historical entries in `/auditLogs/{logId}`. (Expect: `PERMISSION_DENIED`)
11. **QR Ticket Status Spoofing**: A student submitting `/qrCheckIns/{ticketId}` with `status: "confirmed"` directly instead of `"pending"`, or reading another student's ticket. (Expect: `PERMISSION_DENIED`)
12. **Blanket Query Scraping**: Unauthorized client querying `/users`, `/authorizedEmails`, or `/qrCheckIns`. (Expect: `PERMISSION_DENIED`)
