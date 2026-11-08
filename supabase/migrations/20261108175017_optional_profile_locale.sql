-- No saved language means the interface keeps the member's browser/session choice.
-- Preserve every existing preference; only future unspecified profiles change.
alter table public.profiles
  alter column preferred_locale drop not null,
  alter column preferred_locale drop default;
