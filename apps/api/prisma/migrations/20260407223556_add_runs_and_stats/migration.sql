-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('UPCOMING', 'ACTIVE', 'COMPLETED');

-- AlterTable
ALTER TABLE "games" ADD COLUMN     "run_id" TEXT;

-- CreateTable
CREATE TABLE "runs" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "invite_code" TEXT NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'UPCOMING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "run_players" (
    "id" TEXT NOT NULL,
    "run_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "run_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_stats" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "games_played" INTEGER NOT NULL DEFAULT 0,
    "games_won" INTEGER NOT NULL DEFAULT 0,
    "total_picks" INTEGER NOT NULL DEFAULT 0,
    "correct_picks" INTEGER NOT NULL DEFAULT 0,
    "total_points" INTEGER NOT NULL DEFAULT 0,
    "bonus_picks" INTEGER NOT NULL DEFAULT 0,
    "bonus_correct" INTEGER NOT NULL DEFAULT 0,
    "best_game_points" INTEGER NOT NULL DEFAULT 0,
    "current_streak" INTEGER NOT NULL DEFAULT 0,
    "longest_streak" INTEGER NOT NULL DEFAULT 0,
    "runs_participated" INTEGER NOT NULL DEFAULT 0,
    "runs_won" INTEGER NOT NULL DEFAULT 0,
    "last_played_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_stats_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "runs_invite_code_key" ON "runs"("invite_code");

-- CreateIndex
CREATE INDEX "runs_invite_code_idx" ON "runs"("invite_code");

-- CreateIndex
CREATE INDEX "runs_host_user_id_idx" ON "runs"("host_user_id");

-- CreateIndex
CREATE INDEX "run_players_run_id_idx" ON "run_players"("run_id");

-- CreateIndex
CREATE INDEX "run_players_user_id_idx" ON "run_players"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "run_players_run_id_user_id_key" ON "run_players"("run_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "user_stats_user_id_key" ON "user_stats"("user_id");

-- CreateIndex
CREATE INDEX "games_run_id_idx" ON "games"("run_id");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "runs" ADD CONSTRAINT "runs_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_players" ADD CONSTRAINT "run_players_run_id_fkey" FOREIGN KEY ("run_id") REFERENCES "runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "run_players" ADD CONSTRAINT "run_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_stats" ADD CONSTRAINT "user_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
