-- CreateEnum
CREATE TYPE "GameStatus" AS ENUM ('LOBBY', 'DRAFTING', 'LOCKED', 'SCORED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "games" (
    "id" TEXT NOT NULL,
    "host_user_id" TEXT NOT NULL,
    "show_date" DATE NOT NULL,
    "show_venue" TEXT NOT NULL,
    "status" "GameStatus" NOT NULL DEFAULT 'LOBBY',
    "invite_code" TEXT NOT NULL,
    "draft_order" TEXT[],
    "current_round" INTEGER NOT NULL DEFAULT 0,
    "current_pick_index" INTEGER NOT NULL DEFAULT 0,
    "total_rounds" INTEGER NOT NULL DEFAULT 11,
    "max_players" INTEGER NOT NULL DEFAULT 8,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_players" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "draft_position" INTEGER NOT NULL DEFAULT 0,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_players_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "picks" (
    "id" TEXT NOT NULL,
    "game_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "song_name" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "pick_order" INTEGER NOT NULL,
    "is_bonus" BOOLEAN NOT NULL DEFAULT false,
    "scored" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "picks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "songs" (
    "id" TEXT NOT NULL,
    "phish_net_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "times_played" INTEGER NOT NULL DEFAULT 0,
    "last_played" TEXT,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "games_invite_code_key" ON "games"("invite_code");

-- CreateIndex
CREATE INDEX "games_invite_code_idx" ON "games"("invite_code");

-- CreateIndex
CREATE INDEX "games_host_user_id_idx" ON "games"("host_user_id");

-- CreateIndex
CREATE INDEX "games_status_idx" ON "games"("status");

-- CreateIndex
CREATE INDEX "game_players_game_id_idx" ON "game_players"("game_id");

-- CreateIndex
CREATE INDEX "game_players_user_id_idx" ON "game_players"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "game_players_game_id_user_id_key" ON "game_players"("game_id", "user_id");

-- CreateIndex
CREATE INDEX "picks_game_id_round_idx" ON "picks"("game_id", "round");

-- CreateIndex
CREATE INDEX "picks_game_id_user_id_idx" ON "picks"("game_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "songs_phish_net_id_key" ON "songs"("phish_net_id");

-- CreateIndex
CREATE INDEX "songs_name_idx" ON "songs"("name");

-- AddForeignKey
ALTER TABLE "games" ADD CONSTRAINT "games_host_user_id_fkey" FOREIGN KEY ("host_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_players" ADD CONSTRAINT "game_players_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picks" ADD CONSTRAINT "picks_game_id_fkey" FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "picks" ADD CONSTRAINT "picks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
