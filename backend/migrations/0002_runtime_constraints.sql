CREATE UNIQUE INDEX IF NOT EXISTS uq_balance_events_finished_battle
  ON public.balance_events (battle_id)
  WHERE kind = 'battle_finished' AND battle_id IS NOT NULL;
