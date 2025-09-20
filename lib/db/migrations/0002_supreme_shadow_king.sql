ALTER TABLE "User" ADD COLUMN "google_id" varchar(64);--> statement-breakpoint
ALTER TABLE "User" ADD COLUMN "google_username" varchar(64);--> statement-breakpoint
ALTER TABLE "User" ADD CONSTRAINT "User_google_id_unique" UNIQUE("google_id");