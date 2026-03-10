# Auth UI Guide

Use this guide when adding or updating auth screens.

## Components

- Use `AuthScreenContainer` for every auth screen root.
  - `contentMode="centeredCard"` for centered card layouts (login-like).
  - default mode for long form layouts (register-like).
- Use `AuthTextInput` for all text fields.
  - Prefer `leadingIcon` for field context.
  - Use `trailingIcon` + `onTrailingPress` for visibility toggles.
- Use `AuthPrimaryButton` for main actions.
- Use `AuthSocialButton` for external auth actions.
- Use `AuthDivider` for section separators.
- Use `AuthCheckboxRow` for compact boolean rows.
- Use `AuthRoleSelect` for registration role selection.

## Tokens

All auth styling must come from `styles/tokens.ts`.

- Colors: use semantic values (`inputBackground`, `divider`, `textMuted`, etc.).
- Typography: prefer `typography.*` roles over ad-hoc font values.
- Sizing: use `controlHeights.*`, `spacing.*`, and `radius.*`.
- Shadows: use `shadows.button` and `shadows.card` for elevation consistency.

## Validation + Logic Boundaries

- Keep validation and API behavior in screen logic (`login.tsx`, `register.tsx`).
- Keep presentational concerns in shared components.
- Do not modify `auth-service` contract for UI-only changes.
- For registration phone persistence, keep metadata key as `phone` to align with `public.users.phone`.
- `public.users.phone` is unique (`users_phone_key`), so duplicate phone must return a clear user message.

## New Form Row Checklist

1. Add label + input using `AuthTextInput`.
2. Use tokenized spacing only.
3. Add field-level error rendering through `error` prop.
4. Ensure keyboard/autocomplete/contentType values are set.
5. Add accessibility labels for interactive icon buttons.

## Phone Persistence Verification

After a new signup, verify both auth metadata and profile row:

- `select id, email, raw_user_meta_data->>'phone' as phone from auth.users order by created_at desc limit 5;`
- `select id, full_name, role, phone from public.users order by created_at desc nulls last limit 5;`
