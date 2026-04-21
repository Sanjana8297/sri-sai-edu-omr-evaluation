# Proctored Exam Test Plan

## Preconditions
- Teacher account and student account exist in same track (JEE or NEET).
- At least one `QuestionPaper` exists for that teacher.
- App is running with latest Prisma schema/migrations.

## Scheduling and Access Window
- Create exam with valid times (`startTime < endTime`) and duration.
- Try creating exam with `startTime >= endTime` and verify API rejects.
- Publish exam and verify it appears in student `available` list.
- Verify student cannot start before `startTime`.
- Verify student cannot start after `endTime`.

## Session Start and Permissions
- Start exam with camera/mic allowed and verify session stores `cameraGranted=true`, `micGranted=true`.
- Start exam with camera/mic denied and verify start is still allowed.
- Confirm denied start writes proctoring events (`PERMISSION_DENIED`, `CAMERA_MISSING`, `MIC_MISSING` as applicable).

## Proctoring Violations (3-Strike Policy)
- During active exam, trigger tab hide once and verify `violationCount=1`.
- Trigger window blur second time and verify `violationCount=2`.
- Trigger third violation and verify session becomes `AUTO_SUBMITTED` with reason `VIOLATION_LIMIT_REACHED`.
- Verify no further event logging is accepted after finalization.

## Timer and Submission
- Start exam and let timer expire; verify auto-submit with `TIME_WINDOW_EXPIRED`.
- Start exam and submit manually before deadline; verify status `SUBMITTED`.
- Submit endpoint idempotency: repeated submit should return finalized session without creating duplicates.

## Teacher Review and Analytics
- On teacher exam review UI, select exam and verify session rows appear.
- Verify each row shows student identity, status, violation count, permission indicators.
- Verify event timeline includes event types and timestamps in chronological order.

## Regression Checks
- Existing teacher question paper and answer key flows remain functional.
- Existing student exam history/performance pages still load.
- Existing teacher manual exam result entry endpoint still works.
