-- Reverses 039_naplata_role.sql. Members on 'naplata' fall back to 'agent'.
UPDATE team_members SET role = 'agent' WHERE role = 'naplata';
ALTER TABLE team_members DROP CONSTRAINT IF EXISTS team_members_role_check;
ALTER TABLE team_members
  ADD CONSTRAINT team_members_role_check CHECK (role IN ('owner', 'agent'));
