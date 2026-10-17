// TEMPORARY DUMMY CREDENTIALS — replace with a real backend.
//
// SITELINE has no authentication server yet. These passwords let the seeded
// accounts in `initialState()` (src/model.ts) sign in locally so every role can
// be tested. They ship in the browser bundle, so they are NOT secure. Delete
// this file once sign-in is handled by a real authentication service.
//
// Keyed by account ID. The sign-in email comes from the account record itself.
// Never display these values in the UI.
export const DUMMY_CREDENTIALS: Readonly<Record<string, string>> = {
  a1: "Domingo@2026", // Patricia N. Domingo — Administrator
  a2: "Villaverde@2026", // Renz D. Villaverde — Office PM
  a3: "Fernandez@2026", // Lea M. Fernandez — Office PM
  a4: "Espiritu@2026", // Karlo M. Espiritu — Site PM
  a5: "Mercado@2026", // Rafael D. Mercado — Site PM
  a6: "Bautista@2026", // Mikaela Bautista — Site PM
  a7: "Salvador@2026", // Diego A. Salvador — Site PM
  a8: "Concepcion@2026", // Bea R. Concepcion — Site PM
  a9: "Uy@2026", // Ferdinand Uy — Client
  a10: "Reyes@2026", // Jomar T. Reyes — Site PM (seeded as suspended; sign-in is refused)
}

// TEMPORARY built-in shortcut logins for quick testing, one per role.
// Usernames are case-insensitive; passwords are exact. Each signs in as the
// listed seeded account, so the normal account status checks still apply.
// Remove these together with DUMMY_CREDENTIALS.
export const DUMMY_USERNAMES: Readonly<
  Record<string, { accountId: string; password: string }>
> = {
  admin: { accountId: "a1", password: "Password" }, // Patricia N. Domingo — Administrator
  opm: { accountId: "a2", password: "Password" }, // Renz D. Villaverde — Office PM
  spm: { accountId: "a4", password: "Password" }, // Karlo M. Espiritu — Lead Site PM
  clnt: { accountId: "a9", password: "Password" }, // Ferdinand Uy — Client
}
