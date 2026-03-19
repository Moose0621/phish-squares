-- AlterTable: Add is_admin column to users
ALTER TABLE "users" ADD COLUMN "is_admin" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Modify songs table to match current schema
-- Drop old unique constraint on phish_net_id
DROP INDEX IF EXISTS "songs_phish_net_id_key";

-- Remove phish_net_id column
ALTER TABLE "songs" DROP COLUMN IF EXISTS "phish_net_id";

-- Add new columns
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "artist" TEXT NOT NULL DEFAULT '';
ALTER TABLE "songs" ADD COLUMN IF NOT EXISTS "is_custom" BOOLEAN NOT NULL DEFAULT false;

-- Add unique constraint on name
CREATE UNIQUE INDEX IF NOT EXISTS "songs_name_key" ON "songs"("name");
