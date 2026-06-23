-- Allow login via email or username for admins

ALTER TABLE "Admin" ALTER COLUMN "email" DROP NOT NULL;

ALTER TABLE "Admin" ADD COLUMN "username" TEXT;

CREATE UNIQUE INDEX "Admin_username_key" ON "Admin"("username");
