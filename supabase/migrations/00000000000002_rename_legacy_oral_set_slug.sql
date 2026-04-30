-- Align legacy seed slug with app default (`mvp-orals-v1`).
-- Safe: only runs when the old slug exists and `mvp-orals-v1` does not.

do $$
begin
  if exists (
    select 1 from public.question_sets where slug = 'checkride-oral-v1'
  ) and not exists (
    select 1 from public.question_sets where slug = 'mvp-orals-v1'
  ) then
    update public.question_sets
    set slug = 'mvp-orals-v1', updated_at = now()
    where slug = 'checkride-oral-v1';
  end if;
end $$;
