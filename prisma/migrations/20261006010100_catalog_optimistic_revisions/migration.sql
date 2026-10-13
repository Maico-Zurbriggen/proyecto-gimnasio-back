ALTER TABLE app.gyms ADD COLUMN inventory_revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE app.gyms ADD CONSTRAINT gym_inventory_revision_check CHECK (inventory_revision >= 0);
ALTER TABLE app.gym_exercises ADD COLUMN revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE app.gym_exercises ADD CONSTRAINT gym_exercise_revision_check CHECK (revision > 0);
