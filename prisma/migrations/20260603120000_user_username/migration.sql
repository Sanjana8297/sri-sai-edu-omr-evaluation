-- Allow login via email or username for teachers and students

ALTER TABLE "Teacher" ALTER COLUMN "email" DROP NOT NULL;
ALTER TABLE "Student" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "Teacher" ADD COLUMN "username" TEXT;
ALTER TABLE "Student" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "Teacher_username_key" ON "Teacher"("username");
CREATE UNIQUE INDEX "Student_username_key" ON "Student"("username");
