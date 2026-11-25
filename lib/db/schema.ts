/**
 * Column registry: the ONLY names the query builder will put into SQL (so a column name from outside can never become
 * SQL). A test checks it matches the real tables (PRAGMA table_info), so it cannot drift from /migrations.
 *
 * Notation per column: `name` text/number as is, `name[]` JSON, `name?` boolean (0/1), `name$` money (stored as
 * integer cents in `name_cents`, the app sees dollars), `name%` x100 number (stored in `name_x100`).
 */
export type Kind = "plain" | "json" | "bool" | "money" | "x100";
export type Col = { db: string; kind: Kind };
export type Table = { pk: string; cols: Record<string, Col>; hasVersion: boolean };

const parse = (pk: string, spec: string): Table => {
  const cols: Record<string, Col> = {};
  for (const tok of spec.trim().split(/\s+/)) {
    const m = tok.match(/^([a-z_0-9]+)(\[\]|\?|\$|%)?$/);
    if (!m) throw new Error(`bad column token ${tok}`);
    const [, name, mark] = m;
    cols[name] = mark === "[]" ? { db: name, kind: "json" } : mark === "?" ? { db: name, kind: "bool" } : mark === "$" ? { db: `${name}_cents`, kind: "money" } : mark === "%" ? { db: `${name}_x100`, kind: "x100" } : { db: name, kind: "plain" };
  }
  return { pk, cols, hasVersion: "version" in cols };
};

export const TABLES: Record<string, Table> = {
  admin_users: parse("id", "id email name role active? password_hash totp_secret totp_enabled? totp_last_step recovery_codes[] must_change_password? must_enroll_mfa? temp_password_expires_at version created_at updated_at"),
  sessions: parse("id", "id user_id mfa_ok? ip user_agent created_at last_seen_at expires_at"),
  invites: parse("id", "id email name role token_hash invited_by expires_at used_at created_at"),
  password_resets: parse("id", "id user_id token_hash expires_at used_at created_at"),
  rate_limits: parse("key", "key count reset_at"),
  idempotency_keys: parse("key", "key order_id created_at"),
  products: parse("id", "id slug kind name descriptor flavor description spec price$ compare_at_price$ sachet_count sachet_weight_g glow chips[] compare_spec facts[] ingredients allergens warning how_to[] why[] faqs[] bundle_items[] seo_title seo_description og_image status sort version created_at updated_at"),
  product_images: parse("id", "id product_id kind src alt label sort version created_at"),
  inventory_items: parse("id", "id product_id sku on_hand low_stock_threshold version created_at"),
  batches: parse("id", "id inventory_item_id lot_number expiry_date quantity status received_at version created_at"),
  stock_movements: parse("id", "id inventory_item_id delta reason note order_id batch_id actor is_demo? created_at"),
  customers: parse("id", "id name phone email tags[] notes blocked? is_demo? version created_at"),
  delivery_partners: parse("id", "id name phone notes active? is_demo? version created_at"),
  shipping_zones: parse("id", "id name fee$ free_over$ eta active? sort version"),
  orders: parse("id", "id order_number customer_id status payment_method payment_status subtotal$ discount_total$ shipping_fee$ total$ cod_amount_due$ cod_collected? cod_settled_at discount_code region address customer_notes delivery_partner_id tracking_number source utm_source utm_medium utm_campaign cancel_reason stock_deducted? is_demo? is_test? public_token governorate district street landmark delivered_at affiliate_id code_used discount_amount$ commission_amount$ commission_status commission_payout_id commission_correction_payout_id attribution heard_from version created_at updated_at"),
  order_items: parse("id", "id order_id product_id name unit_price$ qty"),
  order_events: parse("id", "id order_id type message from_status to_status actor created_at"),
  discounts: parse("id", "id code type value% min_order$ product_ids[] starts_at ends_at usage_limit used_count active? is_demo? version created_at"),
  abandoned_checkouts: parse("id", "id name phone items[] total$ recovered? contacted_at utm_source is_demo? version created_at"),
  events: parse("id", "id type session_id path utm_source is_demo? created_at"),
  pages_content: parse("key", "key value[] version updated_at"),
  settings: parse("key", "key value[] version updated_at"),
  audit_log: parse("id", "id actor_id actor_email action entity entity_id details[] created_at"),
  affiliates: parse("id", "id name instagram_handle phone email code tier commission_rate% customer_discount_percent% status payout_method notes private_token password_hash terms_version terms_accepted_at payout_details leaderboard_optout? last_login_at rules_read_at version created_at"),
  affiliate_payouts: parse("id", "id affiliate_id amount$ gross$ corrections$ method note paid_at"),
  affiliate_applications: parse("id", "id name instagram_handle tiktok_handle followers city sport message status phone email terms_version terms_accepted_at admin_notes affiliate_id decided_at created_at"),
  ambassador_tokens: parse("id", "id affiliate_id kind token_hash expires_at used_at created_at"),
  ambassador_sessions: parse("id", "id affiliate_id ip created_at last_seen_at expires_at"),
  ref_clicks: parse("affiliate_id", "affiliate_id day count"),
  payout_requests: parse("id", "id affiliate_id amount$ status note payout_id created_at decided_at"),
  missions: parse("id", "id title description reward$ reward_text month status created_at"),
  mission_submissions: parse("id", "id mission_id affiliate_id proof_url proof_file status admin_note created_at decided_at"),
  affiliate_bonuses: parse("id", "id affiliate_id amount$ reason submission_id payout_id created_at"),
  kit_requests: parse("id", "id affiliate_id kind status note created_at updated_at"),
  resources: parse("id", "id title description category file_name stored_name url size_bytes sort created_at"),
  announcements: parse("id", "id title body created_at"),
  notifications: parse("id", "id affiliate_id kind title body link read_at created_at"),
  counters: parse("name", "name value"),
};
