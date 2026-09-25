import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const TABLES: Record<string, { pk: string; core?: boolean; audit?: "standard" | "core" | "none" }> = {
  companies: { pk: "id", audit: "standard" },
  contacts: { pk: "id", audit: "standard" },
  leads: { pk: "id", audit: "standard" },
  opportunities: { pk: "id", audit: "standard" },
  activities: { pk: "id", audit: "standard" },
  customers: { pk: "id", core: true, audit: "core" },
  vehicles: { pk: "id", core: true, audit: "core" },
  jobs: { pk: "id", core: true, audit: "core" },
  quotes: { pk: "id", audit: "standard" },
  quote_lines: { pk: "id", audit: "none" },
  invoices: { pk: "id", audit: "standard" },
  invoice_lines: { pk: "id", audit: "none" },
  payments: { pk: "id", audit: "standard" },
  vendors: { pk: "company_id", audit: "standard" },
  products_services: { pk: "id", audit: "standard" },
  inventory_items: { pk: "id", audit: "standard" },
  purchase_orders: { pk: "id", audit: "standard" },
  purchase_order_lines: { pk: "id", audit: "none" },
  expenses: { pk: "id", audit: "standard" },
  appointments: { pk: "id", audit: "standard" },
  documents: { pk: "id", audit: "standard" },
  email_templates: { pk: "id", audit: "standard" },
};

const PREFIX: Record<string, string> = {
  companies: "CMP", contacts: "CON", leads: "LEAD", opportunities: "OPP",
  activities: "ACT", customers: "CUS", vehicles: "VEH", jobs: "JOB",
  quotes: "QTE", quote_lines: "QLN", invoices: "INV", invoice_lines: "ILN",
  payments: "PAY", products_services: "PRD", inventory_items: "INVITEM",
  purchase_orders: "PO", purchase_order_lines: "POL", expenses: "EXP",
  appointments: "APT", documents: "DOC", email_templates: "EML",
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type,x-google-access-token",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

function adminClient() {
  const url = Deno.env.get("SUPABASE_URL")!;
  let secret = "";
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    secret = keys.default || "";
  } catch {}
  secret ||= Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!secret) throw new Error("No Supabase server secret is available.");
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function googleIdentity(req: Request) {
  const token = req.headers.get("x-google-access-token") || "";
  if (!token) throw new Error("Missing Google access token.");

  const res = await fetch(
    "https://oauth2.googleapis.com/tokeninfo?access_token=" + encodeURIComponent(token),
  );
  const info = await res.json();
  if (!res.ok || !info?.email) throw new Error("Google token validation failed.");
  if (String(info.email_verified || "true") !== "true") {
    throw new Error("Google email is not verified.");
  }
  return { email: String(info.email).trim().toLowerCase() };
}

async function activeProfile(admin: ReturnType<typeof createClient>, email: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("user_id,organization_id,person_id,display_name,email,role,roles,active")
    .ilike("email", email)
    .eq("active", true)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("This Google account is not an active TTT-OS user.");
  return data;
}

function cleanRecord(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input || {})) {
    if (!key || key.startsWith("_")) continue;
    if (["organization_id", "created_at", "updated_at", "created_by", "updated_by", "last_synced_by"].includes(key)) continue;
    out[key] = value === "" ? null : value;
  }
  return out;
}

function newId(table: string) {
  const prefix = PREFIX[table] || "REC";
  return prefix + "-" + crypto.randomUUID().replaceAll("-", "").slice(0, 10).toUpperCase();
}

function mergeCoreSource(table: string, id: string, record: Record<string, any>, prior: Record<string, any> | null) {
  const source: Record<string, any> = { ...(prior || {}), id };
  if (table === "customers") {
    Object.assign(source, {
      firstName: record.first_name || "",
      middleName: record.middle_name || "",
      lastName: record.last_name || "",
      name: record.display_name || [record.first_name, record.middle_name, record.last_name].filter(Boolean).join(" "),
      phone: record.phone || "", email: record.email || "",
      address1: record.address1 || "", address2: record.address2 || "",
      city: record.city || "", state: record.state || "",
      postalCode: record.postal_code || "", country: record.country || "",
      notes: record.notes || "",
    });
  } else if (table === "vehicles") {
    Object.assign(source, {
      customerId: record.customer_id || "", vin: record.vin || "",
      year: record.year || "", make: record.make || "", model: record.model || "",
      trim: record.trim || "", color: record.color || "",
      wrap: record.exterior_finish || "", type: record.vehicle_type || "",
      plate: record.plate || "",
    });
  } else if (table === "jobs") {
    Object.assign(source, {
      estimateId: record.estimate_id || "", workOrderId: record.work_order_id || "",
      customerId: record.customer_id || "", vehicleId: record.vehicle_id || "",
      status: record.status || "", appointment: record.appointment_local || "",
      partsStatus: record.parts_status || "", duration: record.duration || "",
      requestNotes: record.request_notes || "",
      estimateTotal: record.estimate_total ?? 0,
    });
  }
  return source;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "POST required." }, 405);

  try {
    const admin = adminClient();
    const identity = await googleIdentity(req);
    const profile = await activeProfile(admin, identity.email);
    const body = await req.json();
    const action = String(body?.action || "");

    if (action === "profile") {
      return json({ ok: true, profile });
    }

    if (action === "pull") {
      const table = String(body?.table || "");
      if (!TABLES[table]) return json({ ok: false, error: "Table is not allowed." }, 400);

      const { data, error } = await admin
        .from(table)
        .select("*")
        .eq("organization_id", profile.organization_id)
        .is("archived_at", null)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return json({ ok: true, data: data || [] });
    }

    if (action === "upsert") {
      const table = String(body?.table || "");
      const config = TABLES[table];
      if (!config) return json({ ok: false, error: "Table is not allowed." }, 400);

      const record = cleanRecord(body?.record || {});
      let id = String(record[config.pk] || "").trim();
      if (!id && config.pk === "id") {
        id = newId(table);
        record[config.pk] = id;
      }
      if (!id) return json({ ok: false, error: config.pk + " is required." }, 400);

      const { data: existing, error: findError } = await admin
        .from(table)
        .select("*")
        .eq("organization_id", profile.organization_id)
        .eq(config.pk, id)
        .limit(1)
        .maybeSingle();
      if (findError) throw findError;

      record.organization_id = profile.organization_id;
      if (config.core) {
        record.source_json = mergeCoreSource(table, id, record, existing?.source_json || null);
        record.last_synced_by = profile.user_id;
      } else if (config.audit === "standard") {
        record.updated_by = profile.user_id;
        if (!existing) record.created_by = profile.user_id;
      }

      let query;
      if (existing) {
        query = admin
          .from(table)
          .update(record)
          .eq("organization_id", profile.organization_id)
          .eq(config.pk, id)
          .select("*")
          .single();
      } else {
        query = admin.from(table).insert(record).select("*").single();
      }
      const { data, error } = await query;
      if (error) throw error;
      return json({ ok: true, action: existing ? "updated" : "created", data });
    }

    if (action === "sync_log") {
      const row = {
        organization_id: profile.organization_id,
        sync_source: String(body?.sync_source || "google_sheets"),
        sync_direction: String(body?.sync_direction || "unknown"),
        entity_type: body?.entity_type || null,
        entity_id: body?.entity_id || null,
        status: String(body?.status || "success"),
        message: body?.message || null,
        row_count: Number(body?.row_count || 0),
        started_at: body?.started_at || new Date().toISOString(),
        completed_at: body?.completed_at || new Date().toISOString(),
        created_by: profile.user_id,
      };
      const { error } = await admin.from("workspace_sync_log").insert(row);
      if (error) throw error;
      return json({ ok: true });
    }

    return json({ ok: false, error: "Unknown action." }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const authError = /Google|TTT-OS user|access token|verified/i.test(message);
    return json({ ok: false, error: message }, authError ? 401 : 500);
  }
});
