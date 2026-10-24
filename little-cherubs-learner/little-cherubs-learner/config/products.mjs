// Selar products and what each one gives.
//
// When a sale arrives from Selar (through Zapier), the product name is matched
// against `match` below, ignoring capitals. The first product whose `match`
// text appears in the Selar product name wins.
//
// Every sale becomes a 90-day "pass credit" on the parent's account. The credit
// is applied to the child automatically when the family has one child in that
// Form; otherwise the parent chooses the child in Parent > Pass.
//
// To add a product: copy a block, change `match`, `label`, `form` and
// `subjects`, then redeploy.

export default [
  {
    id: "f1-biology-90",
    match: "Form 1 Biology",
    label: "Form 1 Biology · 90-day pass",
    form: 1,
    subjects: ["biology"],
    days: 90,
  },
];

// The page parents are sent to when they renew. Put your Selar product link here
// (or set the RENEW_URL environment variable in Netlify, which takes priority).
export const DEFAULT_RENEW_URL = "https://selar.com/";
