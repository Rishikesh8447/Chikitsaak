ALTER TABLE "User"
  ADD COLUMN "city" TEXT,
  ADD COLUMN "state" TEXT,
  ADD COLUMN "country" TEXT;

CREATE INDEX "User_city_idx" ON "User"("city");
CREATE INDEX "User_state_idx" ON "User"("state");
CREATE INDEX "User_country_idx" ON "User"("country");
CREATE INDEX "User_country_state_city_idx" ON "User"("country", "state", "city");
